import {instagramVariant,instagramPayload} from './instagram-format.js';
import {open,readFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import type {MediaProbe} from './drive-media.js';
import {fail,hash} from './contract.js';
import type {Receipt} from './contract.js';
import type {AdapterCommand,PublishingAdapter} from './openpost.js';

export type BufferBinding={accountKey:string;platform:'threads'|'instagram';channelId:string;serviceId?:string;organizationId?:string};
export interface RequestBudget { reserve(accountId:string,write:boolean):Promise<void> }
// Separate lock from the Hub journal: adapter calls run inside a Hub transaction.
// Provision buffer-budget.json as {"version":1,"requests":{}} on durable storage.
// Conservative local caps leave headroom for other clients; provider 429 still wins.
export class FileBufferBudget implements RequestBudget {
  constructor(private directory:string,private now=()=>Date.now()){}
  async reserve(account:string,write:boolean){
    const lock=await open(join(this.directory,'buffer-budget.lock'),'wx',0o600).catch(()=>fail('BUFFER_BUDGET_LOCKED',503));
    try{
      const file=join(this.directory,'buffer-budget.json');
      const data=await readFile(file,'utf8').then(JSON.parse).catch(()=>fail('BUFFER_BUDGET_PROVISION_REQUIRED',503));
      if(data.version!==1||!data.requests||typeof data.requests!=='object')return fail('BUFFER_BUDGET_INVALID',503);
      const now=this.now(),rows=data.requests[account]??[];
      if(!Array.isArray(rows)||rows.some((x:any)=>!Number.isFinite(x.at)||typeof x.write!=='boolean'||x.at>now))return fail('BUFFER_BUDGET_INVALID',503);
      const recent=rows.filter((x:any)=>x.at>now-30*86400000);
      const day=recent.filter((x:any)=>x.at>now-86400000);
      if(recent.length>=2800||day.length>=80||recent.filter((x:any)=>x.at>now-900000).length>=80||
        (write&&day.filter((x:any)=>x.write).length>=30))return fail('BUFFER_LOCAL_BUDGET_EXHAUSTED',429);
      recent.push({at:now,write});data.requests[account]=recent;
      const next=await open(file+'.next','w',0o600);
      try{await next.writeFile(JSON.stringify(data));await next.sync();}finally{await next.close();}
      await rename(file+'.next',file);const dir=await open(this.directory,'r');try{await dir.sync();}finally{await dir.close();}
    }finally{await lock.close();await unlink(join(this.directory,'buffer-budget.lock'));}
  }
}
const fields='id channelId text dueAt status externalLink sentAt allowedActions';
export class BufferAdapter implements PublishingAdapter {
  readonly simulation=false;
  constructor(readonly id:string,private token:string,private accountId:string,private bindings:BufferBinding[],
    private budget:RequestBudget,private enabled=false,private fetcher:typeof fetch=fetch,
    private confirm?: (link:string,c:AdapterCommand)=>Promise<{platformPostId:string;confirmedAt:string}|undefined>,
    private releaseDigests?:string[], private delegatedApprovalActors:string[]=[],private options:{reels?:boolean;probe?:MediaProbe;verifyIdentity?:boolean;accountKeys?:string[];instagramFormats?:boolean;firstComment?:boolean}={}){
      if(releaseDigests&&(!Array.isArray(releaseDigests)||releaseDigests.some(d=>typeof d!=='string'||!/^[a-f0-9]{64}$/.test(d))))fail('BUFFER_RELEASE_CONFIG_INVALID',503);
    }
  capabilities(){return {...(this.options.instagramFormats&&this.bindings.some(b=>b.platform==='instagram')?{instagramFormats:['image','carousel','reel','story'],notificationRequiresDevice:true,firstComment:this.options.firstComment===true}:{}),executionOwner:'provider' as const,schedule:this.enabled,cancel:this.enabled,live:this.enabled};}
  private scoped(c:AdapterCommand){return this.options.accountKeys===undefined||this.options.accountKeys.includes(c.target.accountKey);}
  private binding(c:AdapterCommand){
    if(!this.token||!this.accountId)return fail('BUFFER_RELEASE_NOT_CONFIGURED',503);
    const matches=this.bindings.filter(b=>b.accountKey===c.target.accountKey&&b.platform===c.target.platform);
    if(matches.length!==1)return fail('BUFFER_BINDING_DENIED',403);return matches[0];
  }
  private async query(query:string,variables:Record<string,unknown>,write=false,preserveCreateResponse=false):Promise<any>{
    await this.budget.reserve(this.accountId,write);
    let response:Response;
    try{response=await this.fetcher('https://api.buffer.com',{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({query,variables}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return fail('BUFFER_TRANSPORT_UNCONFIRMED',502);}
    if(!response.ok)return fail(response.status===429?'BUFFER_RATE_LIMITED':'BUFFER_REQUEST_FAILED',502);
    const result=await response.json().catch(()=>fail('BUFFER_INVALID_RESPONSE',502));
    if(result.errors||!result.data){
      // A partial create response can contain a real ID even when a metadata resolver failed.
      if(preserveCreateResponse&&result.data?.createPost?.post?.id)return {...result.data,__hubGraphqlErrors:true};
      return fail('BUFFER_GRAPHQL_FAILED',502);
    }return result.data;
  }
  async validate(c:AdapterCommand){
    this.binding(c);const v=c.plan.variants[c.target.variant];
    if(!v||!Number.isFinite(Date.parse(c.target.scheduledAt)))return fail('BUFFER_INVALID_MATERIAL',400);
    if(c.target.platform==='threads'&&v.asset!==undefined)return fail('BUFFER_THREADS_TEXT_ONLY',400);
    if(c.target.platform==='threads'&&v.threads!==undefined){
      if(typeof v.threads.topic!=='string'||!v.threads.topic.trim())return fail('INVALID_THREADS_TOPIC',400);
      // Fail closed before scheduling if this provider schema cannot carry the native topic.
      const schema=await this.query('query{metadata:__type(name:"PostInputMetaData"){inputFields{name}} threads:__type(name:"ThreadsPostMetadataInput"){inputFields{name}}} ',{});
      if(!schema.metadata?.inputFields?.some((f:any)=>f.name==='threads')||!schema.threads?.inputFields?.some((f:any)=>f.name==='topic'))return fail('BUFFER_THREADS_TOPIC_UNSUPPORTED',503);
    }
    if(c.target.platform==='instagram'){
      const v=c.plan.variants[c.target.variant];
      const extended=!!(v.instagram||v.assetIndices||c.plan.assets.some(a=>a.kind==='video'||a.altText!==undefined||a.userTags!==undefined||a.thumbnailOffset!==undefined));
      if(extended&&!this.options.instagramFormats)return fail('BUFFER_INSTAGRAM_FORMATS_NOT_ENABLED',503);
      // Legacy command fixtures and existing image paths retain their previous no-network behavior.
      if(this.options.instagramFormats){
        const f=instagramVariant(v,c.plan.assets);
        const newMedia=extended||f.type==='reel';
        if(newMedia){if(!this.options.probe)return fail('BUFFER_REELS_PREFLIGHT_REQUIRED',503);for(const asset of f.selected)await this.options.probe(asset,c.target.scheduledAt);}
        else if(this.scoped(c)&&this.options.probe)for(const asset of f.selected)await this.options.probe(asset,c.target.scheduledAt);
        if(f.options?.firstComment&&!this.options.firstComment)return fail('BUFFER_FIRST_COMMENT_PLAN_REQUIRED',403);
        if(newMedia||this.scoped(c))await this.verifyBinding(c,{publishing:f.publishing,type:f.type,location:!!f.options?.geolocation});
        return;
      }
      const asset=v.asset===undefined?undefined:c.plan.assets[v.asset];
      if(!asset||!['image','reel'].includes(asset.kind))return fail('BUFFER_IMAGE_ONLY',400);
      if(asset.kind==='reel'&&(!this.scoped(c)||!this.options.reels||!this.options.probe||!this.options.verifyIdentity))return fail('BUFFER_REELS_NOT_ENABLED',503);
      if(this.scoped(c)&&this.options.probe)await this.options.probe(asset,c.target.scheduledAt);
    }
    if(this.scoped(c)&&this.options.verifyIdentity)await this.verifyBinding(c);
  }
  private async verifyBinding(c:AdapterCommand,format?:{publishing:string;type:string;location:boolean}){
    const b=this.binding(c);
    const data=await this.query('query($input:ChannelInput!){account{id} channel(input:$input){id organizationId service serviceId isDisconnected isLocked isQueuePaused allowedActions '+(format?'type scopes hasActiveMemberDevice':'')+'}}',{input:{id:b.channelId}});
    const channel=data.channel;
    if(data.account?.id!==this.accountId||channel?.id!==b.channelId||channel.service!==b.platform||!b.serviceId||channel.serviceId!==b.serviceId||!b.organizationId||channel.organizationId!==b.organizationId)return fail('BUFFER_REMOTE_IDENTITY_MISMATCH',403);
    if(format?.publishing==='notification'&&channel.hasActiveMemberDevice!==true)return fail('BUFFER_NOTIFICATION_DEVICE_REQUIRED',403);
    if(format?.type==='story'&&format.publishing==='automatic'&&channel.type!=='business')return fail('BUFFER_STORY_BUSINESS_REQUIRED',403);
    if(format?.location&&!channel.scopes?.includes('instagram_basic'))return fail('BUFFER_LOCATION_FACEBOOK_CONNECTION_REQUIRED',403);
    if(channel.isDisconnected!==false||channel.isLocked!==false||channel.isQueuePaused!==false||!channel.allowedActions?.includes('scheduleUpdates'))return fail('BUFFER_CHANNEL_NOT_READY',503);
  }
  async submit(c:AdapterCommand,checkpoint:(id:string)=>Promise<void>):Promise<Receipt>{
    if(!this.enabled)return fail('BUFFER_RELEASE_NOT_ENABLED',503);
    if(this.releaseDigests&&!this.releaseDigests.includes(hash(c.plan))&&!this.delegatedApprovalActors.includes(c.approvalActor??''))return fail('BUFFER_MATERIAL_NOT_RELEASED',403);
    await this.validate(c);const b=this.binding(c),v=c.plan.variants[c.target.variant];
    const asset=v.asset===undefined?undefined:c.plan.assets[v.asset];
    const input={channelId:b.channelId,text:v.text,assets:asset?[asset.kind==='reel'?{video:{url:asset.url}}:{image:{url:asset.url}}]:[],
      ...(asset?.kind==='reel'?{metadata:{instagram:{type:'reel',shouldShareToFeed:true}}}:{}),
      ...(c.target.platform==='threads'&&v.threads?{metadata:{threads:{topic:v.threads.topic}}}:{}),
      schedulingType:'automatic',...(c.target.platform==='instagram'&&this.options.instagramFormats?instagramPayload(v,c.plan.assets):{}),mode:'customScheduled',dueAt:c.target.scheduledAt,needsApproval:false,aiAssisted:false};
    const data=await this.query(`mutation($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{${this.fields(c)}}}}}`,{input},true,true);
    const p=data.createPost?.post;
    if(data.createPost?.__typename!=='PostActionSuccess'||!p?.id)return fail('BUFFER_CREATE_UNCONFIRMED',502);
    // Persist remote identity before any readback. No automatic create retry, even on timeout.
    await checkpoint(p.id);
    if(data.__hubGraphqlErrors)return fail('BUFFER_CREATE_UNCONFIRMED',502);
    this.check(p,c,p.id,true);return this.receipt(p,c);
  }
  private fields(c:AdapterCommand,confirmTopic=true){return fields+(confirmTopic&&c.target.platform==='threads'&&c.plan.variants[c.target.variant].threads?' metadata{... on ThreadsPostMetadata{topic}}':'')+(this.options.instagramFormats&&c.target.platform==='instagram'?' schedulingType metadata{... on InstagramPostMetadata{type shouldShareToFeed}}':'');}
  private check(p:any,c:AdapterCommand,id:string,schedule=false,confirmTopic=true){
    const topic=c.plan.variants[c.target.variant].threads?.topic;
    if(confirmTopic&&c.target.platform==='threads'&&topic!==undefined){
      if(typeof p?.metadata?.topic!=='string')fail('BUFFER_THREADS_TOPIC_UNCONFIRMED',502);
      if(p.metadata.topic!==topic)fail('BUFFER_THREADS_TOPIC_MISMATCH',502);
    }
    if(this.options.instagramFormats&&c.target.platform==='instagram'){
      const v=c.plan.variants[c.target.variant],f=instagramVariant(v,c.plan.assets);
      if(v.instagram||v.assetIndices||f.type==='reel'||f.selected.some(a=>a.kind==='video')){
        const type=p?.metadata?.type,matched=type===f.type||f.type==='post'&&f.selected.length>1&&type==='carousel';
        if(!matched||p.schedulingType!==f.publishing||f.type==='reel'&&p.metadata.shouldShareToFeed!==(f.options?.shareToFeed??true))fail('BUFFER_POST_FORMAT_MISMATCH',502);
      }
    }
    if(p?.id!==id||p.channelId!==this.binding(c).channelId||(p.text??'')!==c.plan.variants[c.target.variant].text||
      (schedule&&Date.parse(p.dueAt)!==Date.parse(c.target.scheduledAt)))return fail('BUFFER_POST_IDENTITY_MISMATCH',502);
  }
  private async receipt(p:any,c:AdapterCommand):Promise<Receipt>{
    if(p.status==='error')return {providerId:p.id,state:'FAILED',providerStatus:'error'};
    if(!['scheduled','sending','sent'].includes(p.status))return fail('BUFFER_UNEXPECTED_POST_STATE',502);
    // Buffer ID is not a platform ID. No fabricated publication success from `sent` alone.
    if(p.status==='sent'&&p.externalLink){
      let u:URL;try{u=new URL(p.externalLink);}catch{return fail('BUFFER_PLATFORM_LINK_DENIED',502);}
      const allowed=c.target.platform==='instagram'?['www.instagram.com','instagram.com']:['www.threads.com','threads.com','www.threads.net','threads.net'];
      if(u.protocol!=='https:'||!allowed.includes(u.hostname)||u.username||u.password)return fail('BUFFER_PLATFORM_LINK_DENIED',502);
      const proof=await this.confirm?.(p.externalLink,c);
      if(proof?.platformPostId&&Number.isFinite(Date.parse(proof.confirmedAt)))return {providerId:p.id,state:'PUBLISHED',providerStatus:'sent',permalink:p.externalLink,...proof};
    }
    return {providerId:p.id,state:'PROVIDER_ACCEPTED',providerStatus:p.status,...(p.status==='sent'&&p.externalLink?{permalink:p.externalLink}:{})};
  }
  private async post(id:string,c:AdapterCommand,confirmTopic=true){return (await this.query(`query($input:PostInput!){post(input:$input){${this.fields(c,confirmTopic)}}}`,{input:{id}})).post;}
  async status(id:string,c:AdapterCommand){const p=await this.post(id,c);this.check(p,c,id);return this.receipt(p,c);}
  async cancel(id:string,c:AdapterCommand):Promise<Receipt>{
    if(!this.enabled)return fail('BUFFER_RELEASE_NOT_ENABLED',503);
    const p=await this.post(id,c,false);this.check(p,c,id,false,false);
    if(p.status!=='scheduled'||!p.allowedActions?.includes('deletePost'))return fail('BUFFER_CANCEL_NOT_SAFE',409);
    const data=await this.query('mutation($input:DeletePostInput!){deletePost(input:$input){__typename ... on DeletePostSuccess{id}}}',{input:{id}},true);
    if(data.deletePost?.__typename!=='DeletePostSuccess'||data.deletePost.id!==id)return fail('BUFFER_CANCEL_UNCONFIRMED',502);
    // Missing post / 404 alone never proves cancellation, including after a lost delete ack.
    return {providerId:id,state:'CANCELLED'};
  }
}
