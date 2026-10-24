import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BufferAdapter,FileBufferBudget} from '../dist/hub/buffer.js';
import {FileStore,emptyJournal} from '../dist/hub/store.js';
import {DistributionHub} from '../dist/hub/service.js';
import {reconcileActive} from '../dist/hub/reconciler.js';
process.env={NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT??''};
const c={deliveryId:'delivery',target:{platform:'threads',accountKey:'ua-threads',variant:'text',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'},plan:{contractVersion:1,projectId:'copilot',brandId:'ua',contentId:'content',revision:1,source:{producer:'copilot',reference:'rec-1'},variants:{text:{text:'Prepared'}},assets:[],destinations:[],requestId:'r',idempotencyKey:'k',mode:'live'}};
c.plan.destinations=[c.target];
const binding={accountKey:'ua-threads',platform:'threads',channelId:'ch-threads'};
const remote={id:'buffer-1',channelId:'ch-threads',text:'Prepared',dueAt:c.target.scheduledAt,status:'scheduled',allowedActions:['deletePost']};
const budget={async reserve(){}};
const response=data=>new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
function adapter(fetcher,enabled=true,confirm){return new BufferAdapter('buffer-threads','secret-fixture','account-threads',[binding],budget,enabled,fetcher,confirm);}
test('Buffer create uses exact schedule, automatic delivery, prepared material and one fixed endpoint',async()=>{
 const calls=[];const a=adapter(async(url,options)=>{calls.push(JSON.parse(options.body));assert.equal(url,'https://api.buffer.com');assert.equal(options.redirect,'error');return response({createPost:{__typename:'PostActionSuccess',post:remote}});});
 const ids=[];assert.equal((await a.submit(c,async id=>ids.push(id))).state,'PROVIDER_ACCEPTED');assert.deepEqual(ids,['buffer-1']);
 assert.deepEqual(calls[0].variables.input,{channelId:'ch-threads',text:'Prepared',assets:[],schedulingType:'automatic',mode:'customScheduled',dueAt:c.target.scheduledAt,needsApproval:false,aiAssisted:false});
});
test('Buffer disabled or cross-account binding cannot issue network writes',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('should not run');};
 await assert.rejects(()=>adapter(fetcher,false).submit(c,async()=>{}),e=>e.code==='BUFFER_RELEASE_NOT_ENABLED');
 const foreign=structuredClone(c);foreign.target.accountKey='foreign';await assert.rejects(()=>adapter(fetcher).submit(foreign,async()=>{}));assert.equal(calls,0);
});
test('Instagram single image uses the approved URL; uncertified Reel blocked',async()=>{
 const command=structuredClone(c);command.target.platform='instagram';command.target.accountKey='ua-instagram';
 command.plan.variants.text.asset=0;command.plan.assets=[{kind:'image',url:'https://assets.example.test/p.jpg'}];
 let sent;const a=new BufferAdapter('buffer-instagram','fixture','account-ig',[{platform:'instagram',accountKey:'ua-instagram',channelId:'ch-ig'}],budget,true,async(u,o)=>{sent=JSON.parse(o.body);return response({createPost:{__typename:'PostActionSuccess',post:{...remote,channelId:'ch-ig'}}});});
 await a.submit(command,async()=>{});assert.deepEqual(sent.variables.input.assets,[{image:{url:'https://assets.example.test/p.jpg'}}]);
 command.plan.assets[0].kind='reel';await assert.rejects(()=>a.validate(command),e=>e.code==='BUFFER_IMAGE_ONLY');
});
test('Buffer sent status never substitutes Buffer ID for platform identity',async()=>{
 const a=adapter(async()=>response({post:{...remote,status:'sent',externalLink:'https://www.threads.com/@astel.us/post/example'}}));
 const r=await a.status('buffer-1',c);assert.equal(r.state,'PROVIDER_ACCEPTED');assert.equal(r.platformPostId,undefined);
});
test('Buffer publication needs separate platform confirmation',async()=>{
 const a=adapter(async()=>response({post:{...remote,status:'sent',externalLink:'https://www.threads.com/@astel.us/post/example'}}),true,async()=>({platformPostId:'meta-123',confirmedAt:'2030-01-01T00:01:00Z'}));
 assert.equal((await a.status('buffer-1',c)).platformPostId,'meta-123');
});
test('Buffer cancellation reaches provider; sent posts cannot be deleted through cancel',async()=>{
 const calls=[];let sent=false;
 const a=adapter(async(url,o)=>{const body=JSON.parse(o.body);calls.push(body);return body.query.startsWith('query')?response({post:{...remote,status:sent?'sent':'scheduled'}}):response({deletePost:{__typename:'DeletePostSuccess',id:'buffer-1'}});});
 assert.equal((await a.cancel('buffer-1',c)).state,'CANCELLED');assert.ok(calls[1].query.includes('deletePost'));sent=true;
 await assert.rejects(()=>a.cancel('buffer-1',c),e=>e.code==='BUFFER_CANCEL_NOT_SAFE');assert.equal(calls.length,3);
});
test('missing post and lost cancellation acknowledgement never become confirmed cancellation',async()=>{
 const a=adapter(async(url,o)=>JSON.parse(o.body).query.startsWith('query')?response({post:remote}):Promise.reject(Error('secret transport')));
 await assert.rejects(()=>a.cancel('buffer-1',c),e=>e.code==='BUFFER_TRANSPORT_UNCONFIRMED');
 await assert.rejects(()=>adapter(async()=>response({post:null})).status('buffer-1',c));
});
test('durable API budget survives instance restart and keeps accounts separate',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'buffer-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'buffer-budget.json'),JSON.stringify({version:1,requests:{a:Array.from({length:79},()=>({at:1000,write:false}))}}));
 await new FileBufferBudget(dir,()=>2000).reserve('a',false);
 await assert.rejects(()=>new FileBufferBudget(dir,()=>2000).reserve('a',false),e=>e.code==='BUFFER_LOCAL_BUDGET_EXHAUSTED');
 await new FileBufferBudget(dir,()=>2000).reserve('b',false);assert.equal(JSON.parse(await readFile(join(dir,'buffer-budget.json'),'utf8')).requests.b.length,1);
});
test('Hub restart and repeated schedule never resend a Buffer mutation after lost create response',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'buffer-hub-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'hub-storage-manifest.json'),JSON.stringify({version:1,binding:'buffer-test',durable:true}));
 await writeFile(join(dir,'hub-journal.json'),JSON.stringify(emptyJournal('buffer-test')));
 let calls=0;const a=adapter(async()=>{calls++;throw Error('lost ack');});
 const route={projectId:'copilot',brandId:'ua',platform:'threads',accountKey:'ua-threads',adapter:'buffer-threads',executionOwner:'provider',mode:'live'};
 const make=()=>new DistributionHub(new FileStore(dir,'buffer-test'),[route],[],{'buffer-threads':a},()=> '2029-01-01T00:00:00Z');
 const producer={id:'copilot',role:'producer',projects:['copilot'],scopes:['submit','review','schedule','status']};const owner={id:'oleg',role:'owner',projects:['copilot'],scopes:['approve']};
 let h=make();const p=await h.execute(producer,'submit',{input:c.plan,projectId:'copilot'});const args={projectId:'copilot',planId:p.id};
 const review=await h.execute(producer,'review',args);await h.execute(owner,'approve',{...args,digest:review.digest});
 assert.equal((await h.execute(producer,'schedule',args)).state,'AMBIGUOUS_HOLD');h=make();
 assert.equal((await h.execute(producer,'schedule',args)).state,'AMBIGUOUS_HOLD');assert.equal(calls,1);
});
test('automatic Buffer polling is due-only, fair, and persists one hourly read per account',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'buffer-poll-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const journal=emptyJournal('poll-test');
 for(let i=0;i<3;i++)journal.plans['p'+i]={id:'p'+i,input:{projectId:'copilot'},deliveries:[{id:'d'+i,adapter:'buffer-threads',state:'PROVIDER_ACCEPTED',receipt:{providerId:'b'+i},target:{scheduledAt:i===2?'2099-01-01T00:00:00Z':'2020-01-01T00:00:00Z'}}]};
 await writeFile(join(dir,'hub-storage-manifest.json'),JSON.stringify({version:1,binding:'poll-test',durable:true}));await writeFile(join(dir,'hub-journal.json'),JSON.stringify(journal));
 const calls=[];const hub={store:new FileStore(dir,'poll-test'),async execute(p,a,args){calls.push(args.deliveryId);}};
 await reconcileActive(hub);hub.store=new FileStore(dir,'poll-test');await reconcileActive(hub);assert.equal(calls.length,1);assert.notEqual(calls[0],'d2');
 await hub.store.transaction(async(j,save)=>{j.bufferReconcileAt['buffer-threads']=Date.now()-3600001;await save();});
 await reconcileActive(hub);assert.equal(calls.length,2);assert.notEqual(calls[0],calls[1]);
});
