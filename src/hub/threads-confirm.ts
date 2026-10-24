import {fail} from './contract.js';
import type {AdapterCommand} from './openpost.js';
export type ThreadsReadBinding={accountKey:string;userId:string;username:string;token:string};
function permalink(value:string){
  const u=new URL(value);if(u.protocol!=='https:'||!['threads.com','www.threads.com','threads.net','www.threads.net'].includes(u.hostname)||u.username||u.password||u.port||u.search||u.hash)fail('THREADS_PROOF_LINK_DENIED',502);
  const m=u.pathname.match(/^\/@?([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]+)\/?$/);if(!m)fail('THREADS_PROOF_LINK_DENIED',502);return [m![1].toLowerCase(),m![2]].join('/');
}
// Read only. Buffer remains the sole scheduling/publishing executor.
// Docs: developers.facebook.com/docs/threads/retrieve-and-discover-posts/retrieve-posts/
export function threadsConfirmer(bindings:ThreadsReadBinding[],fetcher:typeof fetch=fetch,now=()=>Date.now()){
  const keys=new Set<string>();for(const b of bindings){if(keys.has(b.accountKey)||!b.accountKey.endsWith(':threads')||!/^\d+$/.test(b.userId)||!/^\w[\w.]*$/.test(b.username)||!b.token)fail('THREADS_PROOF_CONFIG_INVALID',503);keys.add(b.accountKey);}
  return async(link:string,c:AdapterCommand)=>{
    const b=bindings.find(b=>b.accountKey===c.target.accountKey);if(!b)return;
    if(c.target.platform!=='threads'||c.plan.assets.length)fail('THREADS_PROOF_FORMAT_DENIED',502);
    const expected=permalink(link);if(expected.split('/')[0]!==b.username.toLowerCase())fail('THREADS_PROOF_IDENTITY_MISMATCH',502);
    async function get(path:string,q:Record<string,string>){
      let r:Response;try{r=await fetcher(`https://graph.threads.net/v1.0/${path}?${new URLSearchParams(q)}`,{headers:{Authorization:`Bearer ${b!.token}`},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('THREADS_PROOF_UNCONFIRMED');}
      if(!r.ok)fail('THREADS_PROOF_READ_FAILED',502);const data=await r.json().catch(()=>fail('THREADS_PROOF_INVALID_RESPONSE',502));if(data?.error)fail('THREADS_PROOF_READ_FAILED',502);return data;
    }
    const identity=await get('me',{fields:'id,username'});if(identity.id!==b.userId||identity.username?.toLowerCase()!==b.username.toLowerCase())fail('THREADS_PROOF_IDENTITY_MISMATCH',502);
    let after:string|undefined;const seen=new Set<string>();
    for(let page=0;page<5;page++){
      const data=await get(`${b.userId}/threads`,{fields:'id,text,permalink,username,owner,timestamp,media_type',limit:'100',...(after?{after}:{})});
      if(!Array.isArray(data.data)||data.data.length>100)fail('THREADS_PROOF_INVALID_RESPONSE',502);
      for(const post of data.data){
        if(typeof post.permalink!=='string'||permalink(post.permalink)!==expected)continue;
        const at=Date.parse(post.timestamp);
        if(!/^\d+$/.test(post.id)||post.owner?.id!==b.userId||post.username?.toLowerCase()!==b.username.toLowerCase()||post.media_type!=='TEXT_POST'||post.text!==c.plan.variants[c.target.variant].text||!Number.isFinite(at)||at<Date.parse(c.target.scheduledAt)-600000||at>now()+300000)fail('THREADS_PROOF_MATERIAL_MISMATCH',502);
        return {platformPostId:post.id,confirmedAt:new Date(now()).toISOString()};
      }
      if(!data.paging?.next)break;const cursor=data.paging?.cursors?.after;
      // Never follow provider-supplied URLs or send a token to a pagination host.
      if(typeof cursor!=='string'||seen.has(cursor))fail('THREADS_PROOF_CURSOR_INVALID',502);seen.add(cursor);after=cursor;
    }
    return;
  };
}
