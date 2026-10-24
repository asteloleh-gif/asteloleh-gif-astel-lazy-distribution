import { fail } from './contract.js';
export const FAMILY_CHANNEL_ID='UCMWFPgFfuNKRQqXzbCqGZhA';
export const YOUTUBE_READ_SCOPES=['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'];
export type YouTubeCredentials={clientId:string;clientSecret:string;refreshToken:string;channelId:string};
// Per-channel OAuth connection. No upload, metadata edits, rename or publication methods.
export class YouTubeConnection {
  private access?:{token:string;until:number};
  constructor(private readonly credentials:YouTubeCredentials,private readonly fetcher:typeof fetch=fetch,private readonly now=()=>Date.now()){
    if(!credentials.clientId||!credentials.clientSecret||!credentials.refreshToken||!/^UC[\w-]{22}$/.test(credentials.channelId))fail('YOUTUBE_CONNECTION_REQUIRED',503);
  }
  private async token(){
    if(this.access&&this.access.until>this.now()+60000)return this.access.token;
    let r:Response;try{r=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.credentials.clientId,client_secret:this.credentials.clientSecret,refresh_token:this.credentials.refreshToken,grant_type:'refresh_token'}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return fail('YOUTUBE_AUTH_UNAVAILABLE',502);}
    if(!r.ok)return fail('YOUTUBE_REAUTH_REQUIRED',503);
    const d=await r.json() as any;
    if(typeof d.access_token!=='string'||!d.access_token||!Number.isFinite(d.expires_in)||d.expires_in<120)return fail('YOUTUBE_AUTH_INVALID',502);
    this.access={token:d.access_token,until:this.now()+Math.min(d.expires_in,3600)*1000};return d.access_token as string;
  }
  private async get(origin:string,path:string,params:Record<string,string>){
    const token=await this.token(),url=new URL(path,origin);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
    let r:Response;try{r=await this.fetcher(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return fail('YOUTUBE_READ_UNAVAILABLE',502);}
    if(!r.ok)return fail(r.status===403?'YOUTUBE_ACCESS_OR_QUOTA_DENIED':'YOUTUBE_READ_FAILED',502);
    return await r.json() as any;
  }
  async account(){
    const d=await this.get('https://www.googleapis.com','/youtube/v3/channels',{part:'snippet,contentDetails,statistics,status',mine:'true'});
    if(!Array.isArray(d.items)||d.items.length!==1||d.items[0].id!==this.credentials.channelId)return fail('YOUTUBE_CHANNEL_MISMATCH',403);
    const c=d.items[0];if(typeof c.contentDetails?.relatedPlaylists?.uploads!=='string')return fail('YOUTUBE_UPLOADS_PLAYLIST_MISSING',502);
    return {channelId:c.id,title:c.snippet?.title,customUrl:c.snippet?.customUrl,uploadsPlaylistId:c.contentDetails.relatedPlaylists.uploads,statistics:c.statistics??{},status:c.status??{},permalink:'https://www.youtube.com/channel/'+c.id};
  }
  async videos(){
    const account=await this.account(),items:any[]=[],seen=new Set<string>();let page='';
    do{
      const d=await this.get('https://www.googleapis.com','/youtube/v3/playlistItems',{part:'snippet,contentDetails,status',playlistId:account.uploadsPlaylistId,maxResults:'50',...(page?{pageToken:page}:{})});
      if(!Array.isArray(d.items))return fail('YOUTUBE_RESPONSE_INVALID',502);
      for(const v of d.items){if(v.snippet?.channelId!==account.channelId)return fail('YOUTUBE_CHANNEL_MISMATCH',403);items.push(v);}
      const next=d.nextPageToken;if(next!==undefined&&(typeof next!=='string'||!next||seen.has(next)))return fail('YOUTUBE_PAGINATION_INVALID',502);
      page=next??'';if(page)seen.add(page);
      if(seen.size>10000)return fail('YOUTUBE_PAGINATION_LIMIT',502);
    }while(page);
    return {channelId:account.channelId,items,count:items.length};
  }
  async analytics(startDate:string,endDate:string){
    for(const value of [startDate,endDate])if(!/^\d{4}-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return fail('YOUTUBE_INVALID_DATE',400);
    if(startDate>endDate||endDate>new Date(this.now()).toISOString().slice(0,10))return fail('YOUTUBE_INVALID_DATE_RANGE',400);
    await this.account();
    const d=await this.get('https://youtubeanalytics.googleapis.com','/v2/reports',{ids:'channel=='+this.credentials.channelId,startDate,endDate,metrics:'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',dimensions:'day',sort:'day'});
    return {channelId:this.credentials.channelId,startDate,endDate,columnHeaders:d.columnHeaders??[],rows:d.rows??[]};
  }
}
