import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {emptyJournal} from '../dist/hub/store.js';
import {DistributionHub} from '../dist/hub/service.js';
import {VideoWorkspace,verifyVideoBytes} from '../dist/hub/video-workspace.js';
const producer={id:'editor',role:'producer',projects:['copilot'],scopes:['editorial','submit','review','status']};
const owner={id:'owner',role:'owner',projects:['copilot'],scopes:['editorial','status','review','approve']};
const bytes=Buffer.from('exact MP4 fixture'),sha=createHash('sha256').update(bytes).digest('hex');
const card=(id=randomUUID(),revision=1)=>({schemaVersion:1,type:'astel.video.review',id,artifact_job_id:randomUUID(),revision,digest:createHash('sha256').update(id+revision).digest('hex'),title:'Warehouse',script:'Reviewable script',artifact:{sha256:sha,bytes:bytes.length,duration:1,mime:'video/mp4'}});
function fixture(){
 const j=emptyJournal('video'),calls=[];
 const hub=new DistributionHub({transaction:fn=>fn(j,async()=>{})},[{projectId:'copilot',brandId:'astel.us',platform:'instagram',accountKey:'astel.us:instagram',adapter:'fixture',executionOwner:'provider',mode:'simulation'}],['drive.google.com'],{fixture:{capabilities:()=>({}),validate:async()=>{calls.push('validate')},submit:async()=>{throw Error('PUBLISH_FORBIDDEN')}}});
 const fetcher=async(url,options)=>{calls.push(['fetch',url,options]);return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':String(bytes.length)}});};
 const video=new VideoWorkspace(hub,fetcher);
 async function register(c){const input={contractVersion:1,projectId:'copilot',brandId:'astel.us',contentId:'video:'+c.id,revision:c.revision,source:{producer:'astel-video-workspace',reference:c.id},variants:{reel:{text:'Draft',asset:0,instagram:{type:'reel'}}},assets:[{url:'https://drive.google.com/uc?export=download&id=fixture123456789',kind:'reel',digest:'sha256:'+sha,revision:String(c.revision),availableUntil:'2035-01-01T00:00:00Z'}],destinations:[{platform:'instagram',accountKey:'astel.us:instagram',variant:'reel',scheduledAt:'2034-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'test:'+c.id+':'+c.revision,idempotencyKey:'test:'+c.id+':'+c.revision,mode:'simulation'};
 const plan=await hub.execute(producer,'submit',{projectId:'copilot',input});const args={projectId:'copilot',planId:plan.id,digest:c.digest};
 await video.execute(producer,'register',{...args,inputDigest:plan.digest,card:c});return {plan,args};}
 return {j,hub,video,calls,register};
}
test('exact server bytes precede review, owner approval and no dispatch',async()=>{
 const f=fixture(),c=card(),{plan,args}=await f.register(c);
 await assert.rejects(()=>f.hub.execute(producer,'review',args),e=>e.code==='VIDEO_SERVER_PREFLIGHT_REQUIRED');
 const proof=await f.video.execute(producer,'preflight',args);assert.equal(proof.sha256,sha);assert.equal(f.calls[0][2].credentials,'omit');
 assert.equal((await f.video.execute(producer,'review',args)).state,'NEEDS_APPROVAL');
 const approved=await f.hub.execute(owner,'approve',{...args,digest:plan.digest});assert.equal(approved.state,'APPROVED');assert.equal(approved.deliveries[0].attempts,0);assert.equal(approved.deliveries[0].receipt,undefined);
});
test('new revision invalidates old owner decision and media proof',async()=>{
 const f=fixture(),c=card(),first=await f.register(c);await f.video.execute(producer,'preflight',first.args);await f.video.execute(producer,'review',first.args);
 await f.register(card(c.id,2));
 await assert.rejects(()=>f.hub.execute(owner,'approve',{...first.args,digest:first.plan.digest}),e=>e.code==='VIDEO_REVISION_STALE');
 await assert.rejects(()=>f.video.execute(producer,'status',first.args),e=>e.code==='VIDEO_REVISION_STALE');
});
test('request changes is owner-only, exact and replay-safe, and blocks approval',async()=>{
 const f=fixture(),{plan,args}=await f.register(card());await f.video.execute(producer,'preflight',args);await f.video.execute(producer,'review',args);
 const request={...args,requestId:randomUUID(),decision:'changes_requested',note:'Tighten the ending'};
 await assert.rejects(()=>f.video.execute(producer,'feedback',request),e=>e.code==='OWNER_REQUIRED');
 const first=await f.video.execute(owner,'feedback',request);assert.deepEqual(await f.video.execute(owner,'feedback',request),first);
 await assert.rejects(()=>f.video.execute(owner,'feedback',{...request,note:'changed'}),e=>e.code==='VIDEO_REVIEW_CONFLICT');
 await assert.rejects(()=>f.hub.execute(owner,'approve',{...args,digest:plan.digest}),e=>e.code==='VIDEO_CHANGES_REQUESTED');
});
test('hash mismatch, HTML, redirects to arbitrary origin and size limits fail closed',async()=>{
 const f=fixture(),{plan}=await f.register(card());
 const c=card();
 for(const fetcher of [async()=>new Response('not the bytes',{headers:{'content-type':'video/mp4'}}),async()=>new Response('<html>login',{headers:{'content-type':'text/html'}}),async()=>new Response(null,{status:302,headers:{location:'https://example.com/file.mp4'}}),async()=>new Response(bytes,{headers:{'content-type':'video/mp4','content-length':'999999999'}})])await assert.rejects(()=>verifyVideoBytes(plan,c,fetcher));
});
test('network transfer is outside the existing journal transaction',async()=>{
 const f=fixture(),{args}=await f.register(card());let inTransaction=false;const original=f.hub.store.transaction;
 f.hub.store.transaction=async fn=>{assert.equal(inTransaction,false);inTransaction=true;try{return await original(fn);}finally{inTransaction=false;}};
 const video=new VideoWorkspace(f.hub,async()=>{assert.equal(inTransaction,false);return new Response(bytes,{headers:{'content-type':'video/mp4'}});});await video.execute(producer,'preflight',args);
});
