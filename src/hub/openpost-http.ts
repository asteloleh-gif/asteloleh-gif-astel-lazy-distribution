import { fail, hash } from './contract.js';
import type { Receipt } from './contract.js';
import type { AdapterCommand, OpenPostPort, ReadContext } from './openpost.js';
export const OPENPOST_RELEASE={version:'v5.2.2',revision:'a6effd0341a7a8cb5c54efe1bc6f4b4c364cfba2'} as const;
export type AccountBinding={projectId:string;accountKey:string;platform:string;format:'text'|'image'|'reel';providerAccountId:string;platformAccountId:string;username:string;contentProfile:string;outputProfile:string};
export type MediaBinding={digest:string;revision:string;mediaId:string};
// Endpoint names and bodies follow the schema read from the installed instance.
// This port is not wired into runtime until the release preflight is certified.
export class OpenPostHttpPort implements OpenPostPort {
  private origin:string;
  constructor(origin:string,private token:string,private workspace:string,private accounts:AccountBinding[],private media:MediaBinding[],private fetcher:typeof fetch=fetch){
    const u=new URL(origin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!token||!workspace)fail('OPENPOST_CONFIG_REQUIRED',503);this.origin=u.origin;
  }
  private binding(c:AdapterCommand){const v=c.plan.variants[c.target.variant];const format=v.asset===undefined?'text':c.plan.assets[v.asset].kind;const b=this.accounts.find(b=>b.projectId===c.plan.projectId&&b.accountKey===c.target.accountKey&&b.platform===c.target.platform&&b.format===format);if(!b)return fail('OPENPOST_ACCOUNT_NOT_BOUND',403);return b;}
  private asset(c:AdapterCommand){const v=c.plan.variants[c.target.variant];if(v.asset===undefined)return undefined;const a=c.plan.assets[v.asset];const m=this.media.find(m=>m.digest===a.digest&&m.revision===a.revision);if(!m)return fail('OPENPOST_MEDIA_NOT_ATTESTED',503);return m;}
  private async api(path:string,method='GET',body?:unknown,key?:string){
    // No redirects, no producer-selected origin, no retries, no raw upstream error/body logging.
    const r=await this.fetcher(this.origin+'/api/v1'+path,{method,headers:{Authorization:`Bearer ${this.token}`,Accept:'application/json','Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok) return fail('OPENPOST_REQUEST_FAILED',502);
    const text=await r.text();if(text.length>1024*1024)return fail('OPENPOST_RESPONSE_TOO_LARGE',502);
    try{return JSON.parse(text);}catch{return fail('OPENPOST_RESPONSE_INVALID',502);}
  }
  async validate(c:AdapterCommand){
    const b=this.binding(c);this.asset(c);
    const release=await this.api('/version');
    if(release.version!==OPENPOST_RELEASE.version||release.revision!==OPENPOST_RELEASE.revision)fail('OPENPOST_VERSION_MISMATCH',503);
    const accounts=await this.api('/accounts?workspace_id='+encodeURIComponent(this.workspace));
    if(!Array.isArray(accounts)||!accounts.some(a=>a.id===b.providerAccountId&&a.account_id===b.platformAccountId&&a.account_username===b.username&&a.platform===b.platform&&a.is_active===true))fail('OPENPOST_IDENTITY_MISMATCH',403);
  }
  private checkPublication(p:any,c:AdapterCommand,allowClearedSchedule=false){
    const b=this.binding(c),v=c.plan.variants[c.target.variant],a=this.asset(c);const r=p?.renditions?.[0];
    if(p.workspace_id!==this.workspace||p.metadata?.ld_delivery_id!==c.deliveryId||p.metadata?.ld_digest!==hash(c)||p.source_text!==v.text||p.renditions?.length!==1||r.social_account_id!==b.providerAccountId||r.platform!==b.platform||r.body!==v.text||r.output_profile!==b.outputProfile||r.format_locked!==true||r.settings?.text_card!=='off'||
      (a ? (r.media?.length!==1||r.media[0].id!==a.mediaId) : (r.media?.length??0)!==0)||(Date.parse(p.scheduled_at)!==Date.parse(c.target.scheduledAt)&&!(allowClearedSchedule&&p.status==='draft'&&(!p.scheduled_at||Date.parse(p.scheduled_at)<0)))||p.random_delay_minutes!==0||!Number.isSafeInteger(p.revision)||p.revision<1)fail('OPENPOST_PUBLICATION_DRIFT',409);
    return r;
  }
  async submit(c:AdapterCommand,checkpoint:(id:string)=>Promise<void>):Promise<Receipt>{
    await this.validate(c);const b=this.binding(c),v=c.plan.variants[c.target.variant],asset=this.asset(c);
    const p=await this.api('/publications','POST',{workspace_id:this.workspace,title:c.plan.contentId,content_profile:b.contentProfile,source_text:v.text,scheduled_at:c.target.scheduledAt,random_delay_minutes:0,
      metadata:{ld_delivery_id:c.deliveryId,ld_digest:hash(c)},renditions:[{social_account_id:b.providerAccountId,body:v.text,output_profile:b.outputProfile,format_locked:true,settings:{text_card:'off'},media:asset?[{media_id:asset.mediaId}]:[]}]},c.deliveryId+':draft');
    if(typeof p.id!=='string'||!p.id) return fail('OPENPOST_PROVIDER_ID_MISSING',502);
    await checkpoint(p.id);this.checkPublication(p,c);
    const valid=await this.api('/publications/'+encodeURIComponent(p.id)+'/validate','POST',{});
    if(valid.valid!==true) return fail('OPENPOST_VALIDATION_FAILED',409);
    const current=await this.api('/publications/'+encodeURIComponent(p.id));this.checkPublication(current,c);
    if(current.revision!==p.revision) return fail('OPENPOST_REVISION_CHANGED',409);
    const accepted=await this.api('/publications/'+encodeURIComponent(p.id)+'/schedule','POST',{expected_revision:current.revision},c.deliveryId+':schedule');
    // Schedule acceptance is not proof of publication. Always use later readback.
    return {state:'PROVIDER_ACCEPTED',providerId:p.id,providerRevision:current.revision,...(typeof accepted.job_id==='string'?{providerJobId:accepted.job_id}:{})};
  }
  async status(id:string,c:AdapterCommand,context:ReadContext={}):Promise<Receipt>{
    const p=await this.api('/publications/'+encodeURIComponent(id));const r=this.checkPublication(p,c,context.cancelRequested);
    if(p.id!==id) return fail('OPENPOST_IDENTITY_MISMATCH',502);
    if(r.status==='published'&&typeof r.external_id==='string'&&r.external_id){
      return {state:'PUBLISHED',providerId:id,platformPostId:r.external_id,...(typeof r.external_url==='string'?{permalink:r.external_url}:{}),confirmedAt:new Date().toISOString()};
    }
    if(context.cancelRequested&&p.status==='draft'&&(!p.scheduled_at||Date.parse(p.scheduled_at)<0)){
      const events=await this.api('/publications/'+encodeURIComponent(id)+'/events?limit=100');
      const event=Array.isArray(events)?events.find(e=>e.type==='cancelled'&&e.status==='succeeded'&&e.publication_id===id&&e.workspace_id===this.workspace&&e.revision===p.revision&&e.superseded!==true&&typeof e.id==='string'&&e.id):undefined;
      if(!event)return fail('OPENPOST_CANCEL_PROOF_MISSING',409);
      return {state:'CANCELLED',providerId:id,providerRevision:p.revision,cancellationEventId:event.id};
    }
    if(r.status==='failed')return {state:'FAILED',providerId:id};
    // A stored draft may mean scheduling never happened. Do not claim accepted or auto-schedule it.
    if(!['scheduled','publishing','published'].includes(p.status))return fail('OPENPOST_OUTCOME_UNCONFIRMED',409);
    return {state:'PROVIDER_ACCEPTED',providerId:id};
  }
  async cancel(id:string,c:AdapterCommand):Promise<Receipt|undefined>{
    const p=await this.api('/publications/'+encodeURIComponent(id));this.checkPublication(p,c,true);
    if(p.status==='draft'&&(!p.scheduled_at||Date.parse(p.scheduled_at)<0))return this.status(id,c,{cancelRequested:true});
    if(p.id!==id)return fail('OPENPOST_IDENTITY_MISMATCH',502);
    if(p.renditions[0].status==='published')return this.status(id,c);
    await this.api('/publications/'+encodeURIComponent(id)+'/cancel','POST',{expected_revision:p.revision},c.deliveryId+':cancel');
    const result=await this.status(id,c,{cancelRequested:true});return result.state==='CANCELLED'||result.state==='PUBLISHED'?result:undefined;
  }
}
