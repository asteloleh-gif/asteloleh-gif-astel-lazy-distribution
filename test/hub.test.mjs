import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {request} from 'node:http';
import {DistributionHub} from '../dist/hub/service.js';
import {FileStore,emptyJournal} from '../dist/hub/store.js';
import {OpenPostAdapter,inspectOpenPost} from '../dist/hub/openpost.js';
import {fromCopilot} from '../dist/hub/copilot.js';
import {createAppServer} from '../dist/server.js';
process.env={NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT??''};
let networkCalls=0;
globalThis.fetch=async()=>{networkCalls++;throw Error('NETWORK_FORBIDDEN');};
const producer={id:'copilot-agent',role:'producer',projects:['copilot','mock-project'],scopes:['submit','status','review','schedule','cancel','reconcile']};
const owner={id:'oleg',role:'owner',projects:['copilot','mock-project'],scopes:['submit','status','review','approve','schedule','cancel','reconcile','pause']};
const routes=['copilot','mock-project'].flatMap(projectId=>['threads','instagram'].flatMap(platform=>['live','simulation'].map(mode=>({projectId,brandId:'astel.us',platform,accountKey:`astel.us:${platform}`,adapter:'openpost',executionOwner:'provider',mode}))));
const input=()=>({contractVersion:1,projectId:'copilot',brandId:'astel.us',contentId:'prepared-1',revision:1,source:{producer:'copilot',reference:'rec-fixture'},variants:{threads:{text:'Prepared text'},instagram:{text:'Prepared image',asset:0}},assets:[{url:'https://assets.astel.test/master.jpg',kind:'image',digest:'sha256:'+'a'.repeat(64),revision:'v1',availableUntil:'2031-01-01T00:00:00Z'}],destinations:[{platform:'threads',accountKey:'astel.us:threads',variant:'threads',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'req-1',idempotencyKey:'key-1',mode:'live'});
async function fixture(t,behavior={}){
 const dir=await mkdtemp(join(tmpdir(),'ld-hub-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'hub-storage-manifest.json'),JSON.stringify({version:1,binding:'test-isolation',durable:true}));
 await writeFile(join(dir,'hub-journal.json'),JSON.stringify(emptyJournal('test-isolation')));
 const calls=[];let serial=0;
 const port={
  async validate(c){calls.push(['validate',c.deliveryId]);if(behavior.invalid)throw Error('INVALID');},
  async submit(c,checkpoint){calls.push(['submit',c.deliveryId]);const id='provider-'+(++serial);await checkpoint(id);if(behavior.timeout)throw Error('secret transport text');return {providerId:id,state:behavior.failedAccount===c.target.accountKey?'FAILED':'PROVIDER_ACCEPTED'};},
  async status(id,c){calls.push(['status',id]);if(behavior.statusError)throw Error('SECRET');return {providerId:id,state:'PUBLISHED',platformPostId:'platform-'+id,permalink:'https://www.instagram.com/p/fixture/',confirmedAt:'2030-01-01T00:01:00Z'};},
  async cancel(id){calls.push(['cancel',id]);return behavior.cancelUnconfirmed?undefined:{providerId:id,state:'CANCELLED'};}
 };
 const adapter=new OpenPostAdapter(port,{versionPinned:true,storageVerified:true,accountsVerified:true,approvalEditIsolation:true});
 const store=new FileStore(dir,'test-isolation');const hub=new DistributionHub(store,routes,['assets.astel.test'],{openpost:adapter},()=> '2029-01-01T00:00:00Z');
 const run=(action,args={},p=producer)=>hub.execute(p,action,{projectId:'copilot',...args});
 async function approved(x=input()){const plan=await run('submit',{input:x});const review=await run('review',{planId:plan.id});await run('approve',{planId:plan.id,digest:review.digest},owner);return plan;}
 return {dir,calls,hub,store,run,approved,adapter,behavior};
}
const denied=(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('Copilot prepared material → exact owner approval → one provider schedule → confirmed status/events',async t=>{
 const f=await fixture(t);const material=input();delete material.contractVersion;delete material.source;
 const p=await f.approved(fromCopilot({...material,sourceRecordId:'rec-fixture'}));
 const accepted=await f.run('schedule',{planId:p.id});assert.equal(accepted.state,'PROVIDER_ACCEPTED');assert.equal(accepted.deliveries[0].executionOwner,'provider');
 const result=await f.run('reconcile',{planId:p.id});assert.equal(result.state,'PUBLISHED');assert.ok(result.deliveries[0].receipt.platformPostId);
 const events=await f.run('events');assert.ok(events.events.some(e=>e.platformPostId));assert.ok(events.events.every(e=>e.aiCalls===0&&e.cost===null));assert.equal(networkCalls,0);
});
test('cross-project, brand, account and raw secrets rejected',async t=>{
 const f=await fixture(t);
 for(const patch of [{projectId:'other'},{brandId:'other'},{token:'not-authority'},{approved:true},{backendUrl:'http://localhost'}])await assert.rejects(()=>f.run('submit',{input:{...input(),...patch}}));
 const x=input();x.destinations[0].accountKey='foreign';await denied(()=>f.run('submit',{input:x}),'ROUTE_DENIED');
});
test('idempotent identical payload returns original; changed payload conflicts; content revision cannot duplicate with new key',async t=>{
 const f=await fixture(t);const p=await f.run('submit',{input:input()});assert.equal((await f.run('submit',{input:input()})).id,p.id);
 await denied(()=>f.run('submit',{input:{...input(),revision:2}}),'IDEMPOTENCY_CONFLICT');
 await denied(()=>f.run('submit',{input:{...input(),idempotencyKey:'new'}}),'REVISION_ALREADY_EXISTS');
});
test('human approval mandatory; producer cannot approve; owner cannot approve own draft',async t=>{
 const f=await fixture(t);const p=await f.run('submit',{input:input()});await denied(()=>f.run('schedule',{planId:p.id}),'HUMAN_APPROVAL_REQUIRED');
 await denied(()=>f.run('approve',{planId:p.id,digest:p.digest}),'FORBIDDEN');
 const x=input();x.idempotencyKey='owner-key';x.contentId='owner-content';const q=await f.run('submit',{input:x},owner);await f.run('review',{planId:q.id},owner);
 await denied(()=>f.run('approve',{planId:q.id,digest:q.digest},owner),'SELF_APPROVAL_DENIED');
});
test('approval binds canonical exact immutable revision; edit requires new plan and approval',async t=>{
 const f=await fixture(t);const p=await f.approved();await denied(()=>f.run('approve',{planId:p.id,digest:'wrong'},owner),'EXACT_REVIEW_REQUIRED');
 const x=input();x.variants.threads.text='edited';await denied(()=>f.run('submit',{input:x}),'IDEMPOTENCY_CONFLICT');
 x.revision=2;x.idempotencyKey='revision-2';const q=await f.run('submit',{input:x});await denied(()=>f.run('schedule',{planId:q.id}),'HUMAN_APPROVAL_REQUIRED');
});
test('two concurrent schedule requests cannot send twice',async t=>{
 const f=await fixture(t);const p=await f.approved();const results=await Promise.allSettled([f.run('schedule',{planId:p.id}),f.run('schedule',{planId:p.id})]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls.filter(c=>c[0]==='submit').length,1);
 await f.run('schedule',{planId:p.id});assert.equal(f.calls.filter(c=>c[0]==='submit').length,1);
});
test('timeout after acceptance persists ID and holds without fallback; restart reconciles only',async t=>{
 const f=await fixture(t,{timeout:true});const p=await f.approved();assert.equal((await f.run('schedule',{planId:p.id})).state,'AMBIGUOUS_HOLD');
 const restarted=new DistributionHub(new FileStore(f.dir,'test-isolation'),routes,['assets.astel.test'],{openpost:f.adapter});
 await restarted.execute(producer,'schedule',{projectId:'copilot',planId:p.id});assert.equal(f.calls.filter(c=>c[0]==='submit').length,1);
 const result=await restarted.execute(producer,'reconcile',{projectId:'copilot',planId:p.id});assert.equal(result.state,'PUBLISHED');
});
test('crash with intent but no provider ID remains held, never re-submitted after lease age',async t=>{
 const f=await fixture(t);const p=await f.approved();await f.store.transaction(async(j,save)=>{j.plans[p.id].deliveries[0].state='DISPATCHING';j.plans[p.id].deliveries[0].intentAt='2000-01-01T00:00:00Z';await save();});
 await f.run('schedule',{planId:p.id});const result=await f.run('reconcile',{planId:p.id});assert.equal(result.state,'AMBIGUOUS_HOLD');assert.equal(f.calls.filter(c=>c[0]==='submit').length,0);
});
test('stale process lock is not stolen by timeout; missing/corrupt journal fails closed',async t=>{
 const f=await fixture(t);await writeFile(join(f.dir,'hub.lock'),'old process');await denied(()=>f.run('status',{planId:'x'}),'STORAGE_LOCKED_MANUAL_RECOVERY_REQUIRED');await rm(join(f.dir,'hub.lock'));
 await writeFile(join(f.dir,'hub-journal.json'),'{bad');await denied(()=>f.run('submit',{input:input()}),'JOURNAL_RESTORE_REQUIRED');
});
test('partial success never resends successful or failed destinations',async t=>{
 const f=await fixture(t,{failedAccount:'astel.us:instagram'});const x=input();x.destinations.push({platform:'instagram',accountKey:'astel.us:instagram',variant:'instagram',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'});
 const p=await f.approved(x);const result=await f.run('schedule',{planId:p.id});assert.deepEqual(result.deliveries.map(d=>d.state),['PROVIDER_ACCEPTED','FAILED']);
 await f.run('schedule',{planId:p.id});await f.run('reconcile',{planId:p.id});assert.equal(f.calls.filter(c=>c[0]==='submit').length,2);
});
test('cancel before delegation is local; cancel after delegation requires backend confirmation',async t=>{
 const f=await fixture(t,{cancelUnconfirmed:true});const p=await f.approved();assert.equal((await f.run('cancel',{planId:p.id})).state,'CANCELLED');assert.equal(f.calls.filter(c=>c[0]==='cancel').length,0);
 const x=input();x.contentId='second';x.idempotencyKey='second';const q=await f.approved(x);await f.run('schedule',{planId:q.id});assert.equal((await f.run('cancel',{planId:q.id})).state,'CANCEL_REQUESTED');
 f.behavior.cancelUnconfirmed=false;assert.equal((await f.run('cancel',{planId:q.id})).state,'CANCELLED');
});
test('published content cannot be cancelled or falsely reported deleted',async t=>{
 const f=await fixture(t);const p=await f.approved();await f.run('schedule',{planId:p.id});await f.run('reconcile',{planId:p.id});assert.equal((await f.run('cancel',{planId:p.id})).state,'PUBLISHED');assert.equal(f.calls.filter(c=>c[0]==='cancel').length,0);
});
test('scoped pause survives new service instance; mock second project isolated',async t=>{
 const f=await fixture(t);const p=await f.approved();await f.run('pause',{},owner);await denied(()=>f.run('schedule',{planId:p.id}),'ROUTE_PAUSED');
 const second=new DistributionHub(new FileStore(f.dir,'test-isolation'),routes,['assets.astel.test'],{openpost:f.adapter});await denied(()=>second.execute(producer,'schedule',{projectId:'copilot',planId:p.id}),'ROUTE_PAUSED');
 const x=input();x.projectId='mock-project';const q=await f.run('submit',{projectId:'mock-project',input:x});await denied(()=>f.run('status',{planId:q.id}),'PLAN_NOT_FOUND');
 await f.run('resume',{},owner);await f.run('schedule',{planId:p.id});
});
test('simulation never calls submit and never becomes PUBLISHED',async t=>{
 const f=await fixture(t);const p=await f.approved({...input(),mode:'simulation'});assert.equal((await f.run('schedule',{planId:p.id})).state,'SIMULATED');await f.run('reconcile',{planId:p.id});assert.equal(f.calls.filter(c=>c[0]==='submit').length,0);
});
test('preview is deterministic and does not mutate journal or call publishers/AI',async t=>{
 const f=await fixture(t);const before=await readFile(join(f.dir,'hub-journal.json'),'utf8');const r=await f.run('preview',{input:input()});assert.equal(r.aiCalls,0);assert.equal(await readFile(join(f.dir,'hub-journal.json'),'utf8'),before);assert.equal(f.calls.length,0);assert.equal(networkCalls,0);
});
test('media origin/expiry, extra body fields and token-bearing URLs fail closed',async t=>{
 const f=await fixture(t);for(const url of ['http://127.0.0.1/x','https://169.254.169.254/x','https://user:password@assets.astel.test/x','https://assets.astel.test.evil/x']){const x=input();x.assets[0].url=url;await denied(()=>f.run('submit',{input:x}),'MEDIA_ORIGIN_DENIED');}
 const x=input();x.destinations[0]={platform:'instagram',accountKey:'astel.us:instagram',variant:'instagram',scheduledAt:'2032-01-01T00:00:00Z',timezone:'America/Chicago'};await denied(()=>f.run('submit',{input:x}),'ASSET_EXPIRES_BEFORE_DELIVERY');
});
test('unverified installed OpenPost fails closed; read-only account discovery has no writes or redirects',async()=>{
 const a=new OpenPostAdapter();await denied(()=>a.validate({}),'OPENPOST_LIVE_PREFLIGHT_BLOCKED');
 const requests=[];await inspectOpenPost('https://operator.example','fixture-token','workspace',async(url,options)=>{requests.push([url,options]);return new Response('[]');});assert.equal(requests.length,1);assert.equal(requests[0][1].method,undefined);assert.equal(requests[0][1].redirect,'error');
});
test('HTTP + MCP share authorization/service; no credentials/body overflow/direct bypass',async t=>{
 const f=await fixture(t);const token='x'.repeat(40);const server=createAppServer({hub:f.hub,credentials:[{token,principal:producer}]}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const call=(path,body,auth=token,method='POST')=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:server.address().port,path,method,agent:false,headers:{authorization:`Bearer ${auth}`}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(data)}));});req.on('error',reject);req.end(typeof body==='string'?body:JSON.stringify(body));});
 assert.equal((await call('/api/distribution/submit',{projectId:'copilot',input:input()},'wrong')).status,403);
 const submitted=await call('/api/distribution/submit',{projectId:'copilot',input:input()});assert.equal(submitted.status,200);
 const rpc=await call('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'distribution_status',arguments:{projectId:'copilot',planId:submitted.body.id}}});assert.equal(JSON.parse(rpc.body.result.content[0].text).id,submitted.body.id);
 assert.equal((await call('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'distribution_approve',arguments:{projectId:'copilot',planId:submitted.body.id}}})).status,403);
 assert.equal((await call('/api/distribution/submit','x'.repeat(140000))).status,413);
 assert.equal((await call('/api/distribution/status',{},token,'GET')).status,405);
 assert.equal(networkCalls,0);
});
test('global emergency pause is durable and cannot be set by producer',async t=>{
 const f=await fixture(t);const p=await f.approved();await denied(()=>f.run('pause',{global:true}),'FORBIDDEN');await f.run('pause',{global:true},owner);await denied(()=>f.run('schedule',{planId:p.id}),'ROUTE_PAUSED');await f.run('resume',{global:true},owner);await f.run('schedule',{planId:p.id});
 const metrics=await f.run('metrics');assert.equal(metrics.pending,1);assert.equal(metrics.attempts,1);assert.equal(metrics.retries,0);assert.equal(metrics.cost,null);assert.equal(metrics.insights,null);
});
test('caller rate limit is applied before repeated work',async t=>{
 const f=await fixture(t);const token='r'.repeat(40);const server=createAppServer({hub:f.hub,credentials:[{token,principal:producer}]}).listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const call=()=>new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:server.address().port,path:'/api/distribution/capabilities',method:'POST',agent:false,headers:{authorization:`Bearer ${token}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{"projectId":"copilot"}');});
 for(let i=0;i<60;i++)assert.equal(await call(),200);assert.equal(await call(),429);
});
test('bounded active-job reconciliation reads provider receipts without any new submissions',async t=>{
 const {reconcileActive}=await import('../dist/hub/reconciler.js');const f=await fixture(t);const p=await f.approved();await f.run('schedule',{planId:p.id});const result=await reconcileActive(f.hub,1);assert.equal(result.checked,1);assert.equal((await f.run('status',{planId:p.id})).state,'PUBLISHED');assert.equal(f.calls.filter(c=>c[0]==='submit').length,1);assert.equal((await reconcileActive(f.hub)).checked,0);
});

test('runtime allows only our self-hosted origin; Hosted/other origins fail before credentials leave the server',async()=>{
 const {requireSelfHostedOrigin,configuredHub}=await import('../dist/hub/runtime.js');
 for(const origin of ['https://app.openpo.st','https://app.openpo.st/api/v1','https://other.example','http://openpost-production-77ea.up.railway.app','https://openpost-production-77ea.up.railway.app@other.example']){
  assert.throws(()=>requireSelfHostedOrigin(origin),e=>e.code==='SELF_HOSTED_OPENPOST_REQUIRED');
 }
 assert.equal(requireSelfHostedOrigin('https://openpost-production-77ea.up.railway.app/'),'https://openpost-production-77ea.up.railway.app');
 process.env.LD_OPENPOST_ORIGIN='https://app.openpo.st';assert.throws(()=>configuredHub(),e=>e.code==='SELF_HOSTED_OPENPOST_REQUIRED');delete process.env.LD_OPENPOST_ORIGIN;assert.equal(networkCalls,0);
});
