import {isolatedTestEnvironment} from './fixtures/test-environment.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {DistributionHub} from '../dist/hub/service.js';
import {emptyJournal} from '../dist/hub/store.js';
import {HubClient,kevinOperator,olegOwner} from '../dist/hub/client.js';
import {createAppServer} from '../dist/server.js';
process.env=isolatedTestEnvironment();
const keyK='fixture-kevin-'.repeat(4),keyO='fixture-oleg-'.repeat(4);
async function fixture(t){
 const journal=emptyJournal('control-test');const store={async transaction(fn){return fn(journal,async()=>{});}};
 const route={projectId:'copilot',brandId:'ua',platform:'threads',accountKey:'ua:threads',adapter:'mock',executionOwner:'provider',mode:'simulation'};
 let writes=0;const mock={id:'mock',simulation:true,capabilities(){return {executionOwner:'provider',schedule:true,cancel:true,live:false};},async validate(){},async submit(){writes++;throw Error('must not publish');}};
 const hub=new DistributionHub(store,[route],[],{mock});const server=createAppServer({hub,credentials:[{token:keyK,principal:kevinOperator(['copilot'])},{token:keyO,principal:olegOwner(['copilot'])}]});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const k=new HubClient(origin,keyK),o=new HubClient(origin,keyO);
 const input={contractVersion:1,projectId:'copilot',brandId:'ua',contentId:'control',revision:1,source:{producer:'copilot',reference:'rec'},variants:{text:{text:'Prepared without AI'}},assets:[],destinations:[{platform:'threads',accountKey:'ua:threads',variant:'text',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'control',idempotencyKey:'control',mode:'simulation'};
 return {journal,k,o,origin,input,writes:()=>writes};
}
test('Kevin operates through HTTP; Oleg receives exact approval card; SDK never publishes without approval',async t=>{
 const f=await fixture(t);const p=await f.k.submit('copilot',f.input);
 await f.k.call('review',{projectId:'copilot',planId:p.id});
 const inbox=await f.o.inbox('copilot');assert.equal(inbox.items[0].variants.text.text,'Prepared without AI');assert.equal(inbox.items[0].canApprove,true);
 await assert.rejects(()=>f.k.approve('copilot',p.id,p.digest),/403/);
 await assert.rejects(()=>f.k.call('schedule',{projectId:'copilot',planId:p.id}),/403/);
 await assert.rejects(()=>f.o.approve('copilot',p.id,'wrong-digest'),/409/);
 await f.o.approve('copilot',p.id,inbox.items[0].digest);
 assert.equal((await f.k.call('schedule',{projectId:'copilot',planId:p.id})).state,'SIMULATED');
 assert.equal(f.writes(),0);assert.equal((await f.o.metrics('copilot')).confirmedSuccess,0);
 const events=await f.o.events('copilot',inbox.eventCursor);assert.ok(events.events.length>0);
 assert.ok(events.events.every(e=>e.aiCalls===0));
});
test('MCP discovery exposes only caller scopes; approval and global pause unavailable to Kevin',async t=>{
 const f=await fixture(t);
 const list=async token=>(await (await fetch(f.origin+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).json()).result.tools;
 const k=await list(keyK),o=await list(keyO);
 assert.ok(k.some(x=>x.name==='distribution_inbox'&&x.annotations.readOnlyHint));
 assert.ok(!k.some(x=>x.name==='distribution_approve'||x.name==='distribution_pause'));
 assert.ok(o.some(x=>x.name==='distribution_approve'));assert.ok(!o.some(x=>x.name==='distribution_schedule'));
 await assert.rejects(()=>f.k.inbox('foreign-project'),/403/);
});
test('inbox pagination is bounded, scoped and does not create plans or credentials',async t=>{
 const f=await fixture(t);await f.k.submit('copilot',f.input);
 assert.equal((await f.o.call('inbox',{projectId:'copilot',limit:1})).items.length,1);
 await assert.rejects(()=>f.o.call('inbox',{projectId:'copilot',limit:101}),/400/);
 assert.equal(Object.keys(f.journal.plans).length,1);
 assert.equal((await f.o.call('inbox',{projectId:'copilot',cursor:'z'})).items.length,0);
});
test('client is server-side only, denies credential-bearing origins and never retries unknown outcomes',async()=>{
 assert.throws(()=>new HubClient('https://user:password@example.test','fixture'),/HUB_ORIGIN_DENIED/);
 let calls=0;const client=new HubClient('https://hub.example.test','fixture',async()=>{calls++;throw Error('provider secret');});
 await assert.rejects(()=>client.call('schedule',{projectId:'copilot',planId:'p'}),/UNCONFIRMED/);assert.equal(calls,1);
});
