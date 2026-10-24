import {open,readFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {fail} from './contract.js';
import type {Receipt} from './contract.js';
import type {AdapterCommand,PublishingAdapter} from './openpost.js';

export type BufferBinding={accountKey:string;platform:'threads'|'instagram';channelId:string};
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
    private confirm?: (link:string,c:AdapterCommand)=>Promise<{platformPostId:string;confirmedAt:string}|undefined>){}
  capabilities(){return {executionOwner:'provider' as const,schedule:this.enabled,cancel:this.enabled,live:this.enabled};}
  private binding(c:AdapterCommand){
    if(!this.enabled||!this.token||!this.accountId)return fail('BUFFER_RELEASE_NOT_ENABLED',503);
    const matches=this.bindings.filter(b=>b.accountKey===c.target.accountKey&&b.platform===c.target.platform);
    if(matches.length!==1)return fail('BUFFER_BINDING_DENIED',403);return matches[0];
  }
  private async query(query:string,variables:Record<string,unknown>,write=false):Promise<any>{
    await this.budget.reserve(this.accountId,write);
    let response:Response;
    try{response=await this.fetcher('https://api.buffer.com',{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({query,variables}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{return fail('BUFFER_TRANSPORT_UNCONFIRMED',502);}
    if(!response.ok)return fail(response.status===429?'BUFFER_RATE_LIMITED':'BUFFER_REQUEST_FAILED',502);
    const result=await response.json().catch(()=>fail('BUFFER_INVALID_RESPONSE',502));
    if(result.errors||!result.data)return fail('BUFFER_GRAPHQL_FAILED',502);return result.data;
  }
  async validate(c:AdapterCommand){
    this.binding(c);const v=c.plan.variants[c.target.variant];
    if(!v||!Number.isFinite(Date.parse(c.target.scheduledAt)))return fail('BUFFER_INVALID_MATERIAL',400);
    if(c.target.platform==='threads'&&v.asset!==undefined)return fail('BUFFER_THREADS_TEXT_ONLY',400);
    // Reel metadata needs an independently certified format mapping; never guess it.
    if(c.target.platform==='instagram'&&(v.asset===undefined||c.plan.assets[v.asset]?.kind!=='image'))return fail('BUFFER_IMAGE_ONLY',400);
  }
  async submit(c:AdapterCommand,checkpoint:(id:string)=>Promise<void>):Promise<Receipt>{
    await this.validate(c);const b=this.binding(c),v=c.plan.variants[c.target.variant];
    const asset=v.asset===undefined?undefined:c.plan.assets[v.asset];
    const input={channelId:b.channelId,text:v.text,assets:asset?[{image:{url:asset.url}}]:[],
      schedulingType:'automatic',mode:'customScheduled',dueAt:c.target.scheduledAt,needsApproval:false,aiAssisted:false};
    const data=await this.query(`mutation($input:CreatePostInput!){createPost(input:$input){__typename ... on PostActionSuccess{post{${fields}}}}}`,{input},true);
    const p=data.createPost?.post;
    if(data.createPost?.__typename!=='PostActionSuccess'||!p?.id)return fail('BUFFER_CREATE_UNCONFIRMED',502);
    // Persist remote identity before any readback. No automatic create retry, even on timeout.
    await checkpoint(p.id);this.check(p,c,p.id,true);return this.receipt(p,c);
  }
  private check(p:any,c:AdapterCommand,id:string,schedule=false){
    if(p?.id!==id||p.channelId!==this.binding(c).channelId||p.text!==c.plan.variants[c.target.variant].text||
      (schedule&&Date.parse(p.dueAt)!==Date.parse(c.target.scheduledAt)))return fail('BUFFER_POST_IDENTITY_MISMATCH',502);
  }
  private async receipt(p:any,c:AdapterCommand):Promise<Receipt>{
    if(p.status==='error')return {providerId:p.id,state:'FAILED'};
    if(!['scheduled','sending','sent'].includes(p.status))return fail('BUFFER_UNEXPECTED_POST_STATE',502);
    // Buffer ID is not a platform ID. No fabricated publication success from `sent` alone.
    if(p.status==='sent'&&p.externalLink&&this.confirm){
      const u=new URL(p.externalLink),allowed=c.target.platform==='instagram'?['www.instagram.com','instagram.com']:['www.threads.com','threads.com','www.threads.net','threads.net'];
      if(u.protocol!=='https:'||!allowed.includes(u.hostname)||u.username||u.password)return fail('BUFFER_PLATFORM_LINK_DENIED',502);
      const proof=await this.confirm(p.externalLink,c);
      if(proof?.platformPostId&&Number.isFinite(Date.parse(proof.confirmedAt)))return {providerId:p.id,state:'PUBLISHED',permalink:p.externalLink,...proof};
    }
    return {providerId:p.id,state:'PROVIDER_ACCEPTED',...(p.status==='sent'&&p.externalLink?{permalink:p.externalLink}:{})};
  }
  private async post(id:string){return (await this.query(`query($input:PostInput!){post(input:$input){${fields}}}`,{input:{id}})).post;}
  async status(id:string,c:AdapterCommand){const p=await this.post(id);this.check(p,c,id);return this.receipt(p,c);}
  async cancel(id:string,c:AdapterCommand):Promise<Receipt>{
    const p=await this.post(id);this.check(p,c,id);
    if(p.status!=='scheduled'||!p.allowedActions?.includes('deletePost'))return fail('BUFFER_CANCEL_NOT_SAFE',409);
    const data=await this.query('mutation($input:DeletePostInput!){deletePost(input:$input){__typename ... on DeletePostSuccess{id}}}',{input:{id}},true);
    if(data.deletePost?.__typename!=='DeletePostSuccess'||data.deletePost.id!==id)return fail('BUFFER_CANCEL_UNCONFIRMED',502);
    // Missing post / 404 alone never proves cancellation, including after a lost delete ack.
    return {providerId:id,state:'CANCELLED'};
  }
}
