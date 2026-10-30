import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createKevinCloudBridge,cloudHubCall,cloudActions} from '../scripts/kevin-cloud-bridge.mjs';
import {tunnelConfig} from '../scripts/cloud-entrypoint.mjs';
import {configuredHub} from '../dist/hub/runtime.js';
test('Radar is opt-in on the existing bridge and exposes no worker, recovery or send tool',async t=>{
 const calls=[];const server=createKevinCloudBridge(async()=>{throw Error('DISTRIBUTION_NOT_EXPECTED');},{radarCall:async(action,args)=>{calls.push([action,args]);return {mode:'READ_AND_LOCAL_DRAFTS'};}});
 const client=new Client({name:'radar-fixture',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.equal(tools.filter(t=>t.name.startsWith('radar_')).length,7);
 for(const name of ['claim','resume','publish','send','login','like'])assert.ok(!tools.some(t=>t.name==='radar_'+name));
 assert.equal((await client.callTool({name:'radar_capabilities',arguments:{}})).structuredContent.mode,'READ_AND_LOCAL_DRAFTS');
 assert.equal((await client.callTool({name:'radar_publish',arguments:{}})).isError,true);assert.equal(calls.length,1);
});
test('cloud bridge exposes authorized operations and never accepts other projects or global mutations',async t=>{
 const calls=[];const server=createKevinCloudBridge(async(action,args)=>{calls.push({action,args});return {ok:true};});const client=new Client({name:'fixture',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.equal(tools.length,15);assert.deepEqual(tools.find(t=>t.name==='distribution_approve').inputSchema.required,['projectId','planId','digest']);
 const planId='a'.repeat(64);assert.ok(!(await client.callTool({name:'distribution_approve',arguments:{projectId:'copilot',planId,digest:planId}})).isError);
 for(const args of [{projectId:'foreign',planId,digest:planId},{projectId:'copilot',planId},{projectId:'copilot',global:true}])assert.equal((await client.callTool({name:'distribution_approve',arguments:args})).isError,true);
 assert.equal((await client.callTool({name:'distribution_arbitrary',arguments:{projectId:'copilot'}})).isError,true);assert.equal(calls.length,1);
});
test('cloud bridge uses authenticated loopback only and does not follow redirects',async()=>{
 const call=cloudHubCall('fixture-'.repeat(8),8080,async(url,options)=>{assert.equal(url,'http://127.0.0.1:8080/api/distribution/status');assert.equal(options.redirect,'error');return new Response(JSON.stringify({ok:true}));});assert.deepEqual(await call('status',{projectId:'copilot'}),{ok:true});
 assert.throws(()=>cloudHubCall('short',8080),/CONFIG/);
});
test('cloud identity is explicitly configured, separate and scoped; no accidental activation',()=>{
 const previous=process.env;try{process.env={};assert.equal(configuredHub().credentials.length,0);process.env={LD_KEVIN_CLOUD_ENABLED:'true'};assert.throws(()=>configuredHub(),e=>e.code==='KEVIN_CLOUD_CREDENTIAL_REQUIRED');process.env.LD_KEVIN_HUB_TOKEN='fixture-'.repeat(8);const {credentials}=configuredHub();assert.equal(credentials.length,1);assert.deepEqual(credentials[0].principal.projects,['copilot']);assert.equal(credentials[0].principal.delegatedApproval,true);assert.equal(credentials[0].principal.role,'owner');}finally{process.env=previous;}
});
test('tunnel config contains secret references, stdio command and loopback health only',()=>{
 const config=tunnelConfig('node /app/scripts/kevin-cloud-bridge.mjs','tunnel_'+'a'.repeat(32));assert.ok(config.includes('commands:'));assert.ok(config.includes('127.0.0.1:8091'));assert.ok(config.includes('env:LD_KEVIN_TUNNEL_RUNTIME_KEY'));assert.ok(!config.includes('sk-'));assert.throws(()=>tunnelConfig('node','bad'));
});
test('cloud SDK lifecycle uses one durable Hub: delegated approval, repeat, cancel and recreated runtime',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {DistributionHub}=await import('../dist/hub/service.js');const {FileStore}=await import('../dist/hub/store.js');const {provision}=await import('../dist/hub/provision.js');
 const directory=await mkdtemp(join(tmpdir(),'kevin-cloud-isolated-'));t.after(()=>rm(directory,{recursive:true,force:true}));await provision(directory,'isolated');
 const principal={id:'kevin-cloud',role:'owner',delegatedApproval:true,projects:['copilot'],scopes:['submit','status','review','approve','schedule','cancel','reconcile','pause']};
 const route={projectId:'copilot',brandId:'fixture',platform:'threads',accountKey:'fixture:threads',adapter:'fixture',executionOwner:'provider',mode:'simulation'};
 const adapter={id:'fixture',simulation:true,capabilities:()=>({executionOwner:'provider',schedule:true,cancel:true,live:false}),validate:async()=>{}};
 const makeHub=()=>new DistributionHub(new FileStore(directory,'isolated'),[route],[],{fixture:adapter},()=> '2029-01-01T00:00:00Z');let hub=makeHub();
 const server=createKevinCloudBridge((action,args)=>hub.execute(principal,action,args));const client=new Client({name:'isolated-lifecycle',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const call=async(action,args)=>{const r=await client.callTool({name:'distribution_'+action,arguments:{projectId:'copilot',...args}});assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent;};
 const input={contractVersion:1,projectId:'copilot',brandId:'fixture',contentId:'isolated',revision:1,source:{producer:'fixture',reference:'offline'},variants:{text:{text:'Offline simulation only'}},assets:[],destinations:[{platform:'threads',accountKey:'fixture:threads',variant:'text',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'r',idempotencyKey:'k',mode:'simulation'};
 const plan=await call('submit',{input});const review=await call('review',{planId:plan.id});await call('approve',{planId:plan.id,digest:review.digest});
 const once=await call('schedule',{planId:plan.id});const repeat=await call('schedule',{planId:plan.id});assert.equal(once.state,'SIMULATED');assert.deepEqual(once.deliveries,repeat.deliveries);
 hub=makeHub();assert.equal((await call('status',{planId:plan.id})).state,'SIMULATED');
 const other=await call('submit',{input:{...input,contentId:'cancel',requestId:'r2',idempotencyKey:'k2'}});assert.equal((await call('cancel',{planId:other.id})).state,'CANCELLED');
});
test('YouTube read tools are opt-in, SDK-valid and cannot cross projects or accept write parameters',async t=>{
 const calls=[];const server=createKevinCloudBridge(async(action,args)=>{calls.push({action,args});return {channelId:'fixture-channel'};},{youtubeRead:true});const client=new Client({name:'youtube-read-fixture',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.equal(tools.length,18);for(const name of ['youtubeaccount','youtubevideos','youtubeanalytics'])assert.equal(tools.find(t=>t.name==='distribution_'+name).annotations.readOnlyHint,true);
 const result=await client.callTool({name:'distribution_youtubeanalytics',arguments:{projectId:'copilot',startDate:'2026-10-01',endDate:'2026-10-23'}});assert.equal(result.structuredContent.channelId,'fixture-channel');
 for(const args of [{projectId:'foreign'},{projectId:'copilot',upload:true}])assert.equal((await client.callTool({name:'distribution_youtubeaccount',arguments:args})).isError,true);
 assert.equal((await client.callTool({name:'distribution_youtubeanalytics',arguments:{projectId:'copilot',startDate:'bad',endDate:'2026-10-23'}})).isError,true);assert.equal(calls.length,1);
});
test('workflow allows Copilot approval but denies Subteam approval and input project switching',async t=>{
 const calls=[];const server=createKevinCloudBridge(async(a,b)=>{calls.push([a,b]);return {ok:true};},{ownerApprovalRequired:true,youtubeRead:true});
 const client=new Client({name:'owner-required',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.equal(tools.length,18);assert.ok(tools.some(t=>t.name==='distribution_approve'));
 assert.equal((await client.callTool({name:'distribution_approve',arguments:{projectId:'copilot',planId:'a'.repeat(64),digest:'b'.repeat(64)}})).isError,undefined);
 assert.equal((await client.callTool({name:'distribution_inbox',arguments:{projectId:'subteam'}})).isError,undefined);
 for(const [name,args] of [['approve',{projectId:'subteam',planId:'a'.repeat(64),digest:'b'.repeat(64)}],['submit',{projectId:'subteam',input:{projectId:'copilot'}}],['inbox',{projectId:'foreign'}]])assert.equal((await client.callTool({name:'distribution_'+name,arguments:args})).isError,true);
 assert.equal(calls.length,2);
});
test('workflow server grants Telegram existing identities and preserves routes while restricting Kevin approval to Copilot at authorization boundary',async()=>{
 const {authorize}=await import('../dist/hub/contract.js');const previous=process.env;
 try{process.env={LD_ASAPTEAM_WORKFLOW_ENABLED:'true',LD_KEVIN_CLOUD_ENABLED:'true',LD_KEVIN_HUB_TOKEN:'fixture-'.repeat(8),LD_STORAGE_DIR:'/tmp/noio',LD_STORAGE_BINDING:'fixture',LD_CALLERS_JSON:JSON.stringify([{token:'owner-'.repeat(8),principal:{id:'oleg',role:'owner',projects:['copilot'],scopes:['status','approve']}},{token:'reader-'.repeat(8),principal:{id:'astel-telegram-reader',role:'producer',projects:['copilot'],scopes:['status']}}]),LD_ROUTES_JSON:JSON.stringify([{projectId:'copilot',brandId:'fixture',accountKey:'fixture:threads',platform:'threads',adapter:'fixture',mode:'simulation',executionOwner:'provider'}])};
 const {hub,credentials}=configuredHub();assert.equal(hub.routes.length,5);assert.equal(hub.routes[0].projectId,'copilot');assert.deepEqual(hub.mediaHosts,['drive.google.com','drive.usercontent.google.com']);
 const kevin=credentials.find(c=>c.principal.id==='kevin-cloud').principal;authorize(kevin,'submit','subteam');authorize(kevin,'schedule','subteam');assert.throws(()=>authorize(kevin,'approve','subteam'),e=>e.code==='FORBIDDEN');authorize(kevin,'approve','copilot');assert.throws(()=>authorize(kevin,'approve','foreign'),e=>e.code==='FORBIDDEN');
 const owner=credentials.find(c=>c.principal.id==='oleg').principal;authorize(owner,'approve','subteam');assert.ok(!owner.scopes.includes('schedule'));
 delete process.env.LD_CALLERS_JSON;assert.throws(()=>configuredHub(),e=>e.code==='ASAPTEAM_OWNER_REQUIRED');
 }finally{process.env=previous;}
});
test('owner workflow cannot dispatch before separate human approval and repeats only one provider job after restart',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const {DistributionHub}=await import('../dist/hub/service.js'),{FileStore}=await import('../dist/hub/store.js'),{provision}=await import('../dist/hub/provision.js'),{BufferAdapter}=await import('../dist/hub/buffer.js');
 const directory=await mkdtemp(join(tmpdir(),'owner-workflow-'));t.after(()=>rm(directory,{recursive:true,force:true}));await provision(directory,'fixture');let creates=0;
 const input={contractVersion:1,projectId:'subteam',brandId:'fixture',contentId:'private-offline',revision:1,source:{producer:'kevin',reference:'offline'},variants:{v:{text:'Offline only',asset:0}},assets:[{kind:'image',url:'https://drive.google.com/uc?export=download&id=ABCDEFGHIJK123',digest:'sha256:'+'a'.repeat(64),revision:'1',availableUntil:'2035-01-02T00:00:00Z'}],destinations:[{platform:'instagram',accountKey:'fixture:instagram',variant:'v',scheduledAt:'2035-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'r',idempotencyKey:'k',mode:'live'};
 const actor={id:'kevin-cloud',role:'owner',delegatedApproval:true,projects:['copilot','subteam'],approvalProjects:['copilot'],scopes:['submit','review','approve','schedule','status']},owner={id:'oleg',role:'owner',projects:['subteam'],scopes:['approve']};
 const adapter=new BufferAdapter('buffer-subteam','fixture','fixture',[{accountKey:'fixture:instagram',platform:'instagram',channelId:'channel'}],{reserve:async()=>{}},true,async()=>{creates++;return new Response(JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post:{id:'one-job',channelId:'channel',text:'Offline only',dueAt:input.destinations[0].scheduledAt,status:'scheduled'}}}}));},undefined,[],['oleg']);
 const routes=[{projectId:'subteam',brandId:'fixture',accountKey:'fixture:instagram',platform:'instagram',adapter:'buffer-subteam',executionOwner:'provider',mode:'live'}];const make=()=>new DistributionHub(new FileStore(directory,'fixture'),routes,['drive.google.com'],{'buffer-subteam':adapter},()=> '2034-01-01T00:00:00Z');let hub=make();const plan=await hub.execute(actor,'submit',{projectId:'subteam',input}),args={projectId:'subteam',planId:plan.id};await hub.execute(actor,'review',args);
 assert.equal((await hub.execute(actor,'inbox',{projectId:'subteam'})).items[0].canApprove,false);
 await assert.rejects(()=>hub.execute(actor,'approve',{...args,digest:plan.digest}),e=>e.code==='FORBIDDEN');await assert.rejects(()=>hub.execute(actor,'schedule',args),e=>e.code==='HUMAN_APPROVAL_REQUIRED');assert.equal(creates,0);
 await hub.execute(owner,'approve',{...args,digest:plan.digest});assert.equal((await hub.execute(actor,'schedule',args)).state,'PROVIDER_ACCEPTED');hub=make();await hub.execute(actor,'schedule',args);assert.equal(creates,1);
});
test('configured Copilot connector approval binds exact material, persists audit and requires separate schedule',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {provision}=await import('../dist/hub/provision.js'),{hash}=await import('../dist/hub/contract.js');
 const directory=await mkdtemp(join(tmpdir(),'copilot-approval-'));t.after(()=>rm(directory,{recursive:true,force:true}));await provision(directory,'fixture');
 const previous=process.env,previousFetch=globalThis.fetch;let creates=0;
 const input={contractVersion:1,projectId:'copilot',brandId:'fixture',contentId:'offline',revision:1,source:{producer:'fixture',reference:'offline'},variants:{text:{text:'Offline only'}},assets:[],destinations:[{platform:'threads',accountKey:'fixture:threads',variant:'text',scheduledAt:'2035-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'r',idempotencyKey:'k',mode:'live'};
 try{
 process.env={LD_ASAPTEAM_WORKFLOW_ENABLED:'true',LD_KEVIN_CLOUD_ENABLED:'true',LD_KEVIN_HUB_TOKEN:'fixture-'.repeat(8),LD_STORAGE_DIR:directory,LD_STORAGE_BINDING:'fixture',LD_CALLERS_JSON:JSON.stringify([{token:'owner-'.repeat(8),principal:{id:'oleg',role:'owner',projects:['copilot'],scopes:['status','approve']}},{token:'reader-'.repeat(8),principal:{id:'astel-telegram-reader',role:'producer',projects:['copilot'],scopes:['status']}}]),LD_ROUTES_JSON:JSON.stringify([{projectId:'copilot',brandId:'fixture',accountKey:'fixture:threads',platform:'threads',adapter:'buffer-threads',mode:'live',executionOwner:'provider'}]),LD_BUFFER_ENABLE_WRITES:'true',LD_BUFFER_THREADS_TOKEN:'offline-fixture',LD_BUFFER_THREADS_ACCOUNT_ID:'fixture',LD_BUFFER_THREADS_BINDINGS_JSON:JSON.stringify([{accountKey:'fixture:threads',platform:'threads',channelId:'channel'}])};
 globalThis.fetch=async()=>{creates++;return new Response(JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post:{id:'offline-job',channelId:'channel',text:'Offline only',dueAt:input.destinations[0].scheduledAt,status:'scheduled'}}}}));};
 let {hub,credentials}=configuredHub();const principal=credentials.find(c=>c.principal.id==='kevin-cloud').principal;
 const server=createKevinCloudBridge((action,args)=>hub.execute(principal,action,args),{ownerApprovalRequired:true});
 const client=new Client({name:'copilot-approval',version:'1'},{capabilities:{}}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const call=(action,args={})=>client.callTool({name:'distribution_'+action,arguments:{projectId:'copilot',...args}});
 const plan=(await call('submit',{input})).structuredContent,args={planId:plan.id};
 assert.equal((await call('approve',{...args,digest:plan.digest})).isError,true);
 await call('review',args);assert.equal((await call('schedule',args)).isError,true);
 for(const change of [p=>p.revision++,p=>p.variants.text.text+=' changed',p=>p.destinations[0].accountKey='other:threads',p=>p.destinations[0].scheduledAt='2035-01-02T00:00:00Z']){
  const altered=structuredClone(input);change(altered);assert.equal((await call('approve',{...args,digest:hash(altered)})).isError,true);
 }
 assert.equal((await call('approve',{planId:'0'.repeat(64),digest:plan.digest})).isError,true);
 assert.equal((await call('approve',{...args,projectId:'subteam',digest:plan.digest})).isError,true);
 assert.equal((await call('inbox')).structuredContent.items[0].canApprove,true);
 const approved=(await call('approve',{...args,digest:plan.digest})).structuredContent;
 assert.equal(approved.state,'APPROVED');assert.equal(approved.approval.actor,'kevin-cloud');assert.equal(approved.approval.digest,plan.digest);assert.ok(approved.approval.reference);assert.ok(approved.approval.at);
 assert.deepEqual(approved.input,input);assert.equal(approved.deliveries[0].attempts,0);assert.equal(creates,0);
 hub=configuredHub().hub;assert.deepEqual((await call('status',args)).structuredContent.approval,approved.approval);
 assert.equal((await call('approve',{...args,digest:plan.digest})).isError,true);
 assert.equal((await call('schedule',args)).structuredContent.state,'PROVIDER_ACCEPTED');
 hub=configuredHub().hub;await call('schedule',args);assert.equal(creates,1);
 }finally{process.env=previous;globalThis.fetch=previousFetch;}
});
