import test from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createKevinCloudBridge,cloudHubCall,cloudActions} from '../scripts/kevin-cloud-bridge.mjs';
import {tunnelConfig} from '../scripts/cloud-entrypoint.mjs';
import {configuredHub} from '../dist/hub/runtime.js';
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
