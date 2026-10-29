import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {authenticate,authorize,fail,hash,HubError} from './contract.js';
import type {Credential,Plan,Principal} from './contract.js';
import type {Journal} from './store.js';
import type {DistributionHub} from './service.js';
import {readBoundedJson} from './api.js';
import {planStory} from './video-planner.js';

type Card={schemaVersion:1;type:'astel.video.review';id:string;artifact_job_id:string;revision:number;digest:string;title:string;script:string;artifact:{sha256:string;bytes:number;duration:number;mime:string};[key:string]:unknown};
type RecordEntry={card:Card;planId:string;inputDigest:string;registeredAt:string;proof?:{state:'verified'|'failed';at:string;sha256?:string;bytes?:number;mime?:string};reviews:{id:string;digest:string;decision:string;note:string;actor:string;at:string}[]};
export type VideoJournal={plans:Record<string,RecordEntry>;latest:Record<string,{revision:number;digest:string}>};
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const data=(j:Journal)=>j.videoWorkspace??={plans:{},latest:{}};
const root=(p:Plan,c:Card)=>p.input.projectId+':'+c.id;
function entry(j:Journal,plan:Plan){const v=data(j),e=v.plans[plan.id];if(!e||e.inputDigest!==plan.digest||e.card.digest!==v.latest[root(plan,e.card)]?.digest)return fail('VIDEO_REVISION_STALE',409);return e;}

// Applied inside the existing Hub transaction, including a later schedule.
// Other producers and all existing publisher configuration stay unchanged.
export function videoReviewGate(j:Journal,plan:Plan,action:string,now=Date.now()){
 if(plan.input.source?.producer!=='astel-video-workspace'||!['review','approve','schedule'].includes(action))return;
 const e=entry(j,plan),p=e.proof;
 if(!p||p.state!=='verified'||p.sha256!==e.card.artifact.sha256||now-Date.parse(p.at)>86400000)return fail('VIDEO_SERVER_PREFLIGHT_REQUIRED',409);
 if(e.reviews.at(-1)?.decision==='changes_requested')return fail('VIDEO_CHANGES_REQUESTED',409);
}

function direct(raw:string){
 let u:URL;try{u=new URL(raw);}catch{return fail('VIDEO_MEDIA_ORIGIN_DENIED',400);}
 const host=u.hostname,path=host==='drive.google.com'?'/uc':'/download';
 if(u.protocol!=='https:'||!['drive.google.com','drive.usercontent.google.com'].includes(host)||u.pathname!==path||u.port||u.username||u.password||u.hash||u.searchParams.get('export')!=='download'||!/^[-\w]{10,200}$/.test(u.searchParams.get('id')??'')||[...u.searchParams.keys()].some(k=>!['id','export','confirm','uuid'].includes(k)))return fail('VIDEO_MEDIA_ORIGIN_DENIED',400);
 return u;
}

export async function verifyVideoBytes(plan:Plan,card:Card,fetcher:typeof fetch=fetch){
 const asset=plan.input.assets[0];if(!asset||asset.digest!=='sha256:'+card.artifact.sha256||Date.parse(asset.availableUntil)<=Date.now())return fail('VIDEO_ASSET_CHANGED',409);
 let u=direct(asset.url);const seen=new Set<string>();const signal=AbortSignal.timeout(60000);
 for(let redirects=0;redirects<4;redirects++){
  if(seen.has(u.href))return fail('VIDEO_REDIRECT_LOOP',502);seen.add(u.href);
  const response=await fetcher(u.href,{method:'GET',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal,headers:{'Accept-Encoding':'identity'}});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();u=direct(new URL(response.headers.get('location')??'',u).href);continue;}
  const mime=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
  if(response.status!==200||mime!=='video/mp4'||!response.body){await response.body?.cancel();return fail('VIDEO_MEDIA_NOT_MP4',409);}
  const claimed=response.headers.get('content-length');if(claimed!==null&&Number(claimed)!==card.artifact.bytes){await response.body.cancel();return fail('VIDEO_MEDIA_SIZE_MISMATCH',409);}
  const reader=response.body.getReader(),digest=createHash('sha256');let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>card.artifact.bytes||size>300*1024*1024)return fail('VIDEO_MEDIA_TOO_LARGE',413);digest.update(part.value);}}
  finally{await reader.cancel();}
  const actual=digest.digest('hex');if(size!==card.artifact.bytes||actual!==card.artifact.sha256)return fail('VIDEO_MEDIA_HASH_MISMATCH',409);
  return {state:'verified' as const,at:new Date().toISOString(),sha256:actual,bytes:size,mime};
 }
 return fail('VIDEO_REDIRECT_LIMIT',502);
}

export class VideoWorkspace {
 readonly busy=new Set<string>();
 constructor(readonly hub:DistributionHub,readonly fetcher:typeof fetch=fetch){}
 async execute(p:Principal,action:string,args:any):Promise<unknown>{
  if(!args||args.projectId!=='copilot')return fail('VIDEO_PROJECT_DENIED',403);
  if(action==='feedback'&&p.role!=='owner')return fail('OWNER_REQUIRED',403);
  authorize(p,action==='inbox'||action==='status'?'status':action==='feedback'?'approve':'editorial',args.projectId);
  if(action==='plan')return planStory(this.hub,p,args.brief);
  if(action==='inbox')return this.hub.store.transaction(async j=>({items:Object.values(data(j).plans).filter(e=>j.plans[e.planId]?.input.projectId===args.projectId).slice(-100).reverse().map(e=>({...structuredClone(e),state:j.plans[e.planId].state,latest:data(j).latest[root(j.plans[e.planId],e.card)]?.digest===e.card.digest})),publishingEnabled:false}));
  if(!sha(args.planId))return fail('VIDEO_PLAN_ID_REQUIRED',400);
  if(action==='register')return this.hub.store.transaction(async(j,save)=>{
   const plan=j.plans[args.planId],c=args.card as Card;
   if(!plan||plan.input.projectId!==args.projectId||plan.input.mode!=='simulation'||plan.input.source?.producer!=='astel-video-workspace'||args.inputDigest!==plan.digest||hash(plan.input)!==plan.digest)return fail('VIDEO_PLAN_BINDING_DENIED',409);
   if(!c||c.schemaVersion!==1||c.type!=='astel.video.review'||!uuid(c.id)||!uuid(c.artifact_job_id)||!sha(c.digest)||!Number.isSafeInteger(c.revision)||c.revision<1||typeof c.title!=='string'||c.title.length>160||typeof c.script!=='string'||c.script.length>3000||!c.artifact||!sha(c.artifact.sha256)||!Number.isSafeInteger(c.artifact.bytes)||c.artifact.bytes<1||c.artifact.bytes>300*1024*1024||!Number.isFinite(c.artifact.duration)||c.artifact.duration<=0||c.artifact.mime!=='video/mp4')return fail('VIDEO_CARD_INVALID',400);
   if(plan.input.source.reference!==c.id||plan.input.assets.length!==1||plan.input.assets[0].digest!=='sha256:'+c.artifact.sha256||plan.input.assets[0].revision!==String(c.revision))return fail('VIDEO_ARTIFACT_BINDING_DENIED',409);
   const v=data(j),old=v.plans[plan.id],latest=v.latest[root(plan,c)];
   if(old){if(hash(old.card)!==hash(c))return fail('VIDEO_REGISTRATION_CONFLICT',409);return structuredClone(old);}
   if(latest&&(c.revision<latest.revision||(c.revision===latest.revision&&c.digest!==latest.digest)))return fail('VIDEO_REVISION_STALE',409);
   if(Object.keys(v.plans).length>=1000)return fail('VIDEO_REVIEW_CAPACITY',409);
   const e:RecordEntry={card:structuredClone(c),planId:plan.id,inputDigest:plan.digest,registeredAt:new Date().toISOString(),reviews:[]};
   v.plans[plan.id]=e;v.latest[root(plan,c)]={revision:c.revision,digest:c.digest};await save();return structuredClone(e);
  });
  const bound=await this.hub.store.transaction(async j=>{const plan=j.plans[args.planId];if(!plan||plan.input.projectId!==args.projectId)return fail('VIDEO_PLAN_NOT_FOUND',404);return {plan:structuredClone(plan),record:structuredClone(entry(j,plan))};});
  if(action==='status')return bound.record;
  if(args.digest!==bound.record.card.digest)return fail('VIDEO_REVISION_STALE',409);
  if(action==='preflight'){
   if(this.busy.has(p.id))return fail('VIDEO_PREFLIGHT_BUSY',429);this.busy.add(p.id);
   try{
    let proof:RecordEntry['proof'];let error:unknown;
    try{proof=await verifyVideoBytes(bound.plan,bound.record.card,this.fetcher);}catch(e){proof={state:'failed',at:new Date().toISOString()};error=e;}
    await this.hub.store.transaction(async(j,save)=>{const e=entry(j,j.plans[args.planId]);e.proof=proof;await save();});
    if(error)throw error;return proof;
   }finally{this.busy.delete(p.id);}
  }
  if(action==='feedback'){
   if(p.role!=='owner')return fail('OWNER_REQUIRED',403);
   if(!uuid(args.requestId)||!['changes_requested','draft_accepted'].includes(args.decision)||typeof args.note!=='string'||args.note.length>2000||(args.decision==='changes_requested'&&!args.note.trim()))return fail('VIDEO_REVIEW_INVALID',400);
   return this.hub.store.transaction(async(j,save)=>{const e=entry(j,j.plans[args.planId]),prior=e.reviews.find(r=>r.id===args.requestId);if(prior){if(prior.digest!==args.digest||prior.decision!==args.decision||prior.note!==args.note||prior.actor!==p.id)return fail('VIDEO_REVIEW_CONFLICT',409);return prior;}
    if(e.reviews.length>=100)return fail('VIDEO_REVIEW_CAPACITY',409);
    const review={id:args.requestId,digest:args.digest,decision:args.decision,note:args.note,actor:p.id,at:new Date().toISOString()};e.reviews.push(review);await save();return review;});
  }
  if(action==='review')return this.hub.execute(p,'review',{projectId:args.projectId,planId:args.planId});
  return fail('VIDEO_ACTION_DENIED',404);
 }
}

export function videoWorkspaceApi(service:VideoWorkspace|undefined,credentials:Credential[]){
 const rates=new Map<string,{at:number;count:number}>();
 return async(req:IncomingMessage,res:ServerResponse)=>{
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{const p=authenticate(req.headers.authorization,credentials);if(!service)return fail('VIDEO_WORKSPACE_DISABLED',503);if(req.method!=='POST')return fail('POST_REQUIRED',405);
   const now=Date.now(),r=rates.get(p.id);if(!r||now-r.at>60000)rates.set(p.id,{at:now,count:1});else if(++r.count>30)return fail('RATE_LIMITED',429);
   const action=new URL(req.url??'/','http://localhost').pathname.slice('/api/video-workspace/'.length);
   if(!['inbox','status','register','preflight','feedback','review','plan'].includes(action))return fail('VIDEO_ACTION_DENIED',404);
   return json(200,await service.execute(p,action,await readBoundedJson(req)));
  }catch(e){return json(e instanceof HubError?e.status:502,{error:e instanceof HubError?e.code:'VIDEO_WORKSPACE_UNAVAILABLE'});}
 };
}
