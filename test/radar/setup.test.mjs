import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Radar,SETUP_QUERY} from '../../scripts/radar/core.mjs';
import {runManualLogin} from '../../scripts/radar/login-session.mjs';
function fixture(t){const r=new Radar(':memory:',{primaryGraceMs:0});t.after(()=>r.close());const account='astel.u:threads';const task=r.create({account,batch:'setup',query:SETUP_QUERY},'owner');const call=async(action,a)=>{switch(action){case 'claimsetup':return r.claim(a.taskId,'mac',[account],true,true);case 'heartbeat':return r.heartbeat(a.taskId,'mac',a.generation);case 'setupcomplete':return r.setupcomplete(a.taskId,'mac',a.generation,a.activeAccount,a.browserClosed);case 'hold':return r.hold(a.taskId,'mac',a.generation,a.reason);default:throw Error('UNEXPECTED_ACTION');}};return {r,task,call,account};}
test('setup excluded from daemon and ordinary claims; successful login closes before releasing lock',async t=>{
 const {r,task,call,account}=fixture(t);assert.equal(r.pending([account]).length,0);assert.throws(()=>r.claim(task.id,'mac',[account],true),/TASK_KIND_MISMATCH/);
 let closed=false;const wrapped=async(action,a)=>{if(action==='setupcomplete')assert.equal(closed,true);return call(action,a);};
 const result=await runManualLogin({taskId:task.id,call:wrapped,openBrowser:async()=>({page:{goto:async()=>{}},check:async()=> 'astel.u',close:async()=>{closed=true;}}),waitForOperator:async()=>{}});
 assert.equal(result.state,'SETUP_COMPLETE');assert.equal(r.evidence(task.id).length,0);
 const next=r.create({account,batch:'read',query:'business'},'owner');assert.equal(r.claim(next.id,'mac',[account],true).state,'RUNNING');
});
for(const fault of ['IDENTITY_MISMATCH','CHALLENGE','CLOSE_FAILED','OPERATOR_STOP'])test(`failed login ${fault} retains lock`,async t=>{
 const {r,task,call,account}=fixture(t);
 await assert.rejects(runManualLogin({taskId:task.id,call,openBrowser:async()=>({page:{goto:async()=>{}},check:async()=>{if(['IDENTITY_MISMATCH','CHALLENGE'].includes(fault))throw Error(fault);return 'astel.u';},close:async()=>{if(fault==='CLOSE_FAILED')throw Error(fault);}}),waitForOperator:async()=>{if(fault==='OPERATOR_STOP')throw Error(fault);}}));
 assert.equal(r.status(task.id).state,'HOLD');const next=r.create({account,batch:'read',query:'business'},'owner');assert.throws(()=>r.claim(next.id,'mac',[account],true),/ACCOUNT_BUSY/);
});
test('setup completion rejects wrong identity, missing close, ordinary complete and stale generation',t=>{
 const {r,task,account}=fixture(t);const c=r.claim(task.id,'mac',[account],true,true);
 assert.throws(()=>r.complete(task.id,'mac',c.generation),/TASK_KIND_MISMATCH/);
 assert.throws(()=>r.setupcomplete(task.id,'mac',c.generation,'astel.us',true),/IDENTITY_MISMATCH/);
 assert.throws(()=>r.setupcomplete(task.id,'mac',c.generation,'astel.u',false),/BROWSER_CLOSE_REQUIRED/);
 assert.throws(()=>r.setupcomplete(task.id,'mac',c.generation+1,'astel.u',true),/LEASE_LOST/);
});
test('normalized setup query cannot enter read queue',t=>{const {r,account}=fixture(t);const task=r.create({account,batch:'other',query:'MANUAL  LOGIN setup only'},'owner');assert.equal(r.pending([account]).length,0);assert.throws(()=>r.claim(task.id,'mac',[account],true),/TASK_KIND_MISMATCH/);});
test('HTTP setup endpoints enforce worker role and finish verified setup',async t=>{
 const {createServer}=await import('node:http');const {createRadarApi}=await import('../../scripts/radar/api.mjs');const {radarClient}=await import('../../scripts/radar/client.mjs');
 const {r,task,account}=fixture(t);const ot='o'.repeat(40),wt='w'.repeat(40);
 const server=createServer(createRadarApi({radar:r,credentials:[{token:ot,principal:{id:'owner',role:'owner',projects:['copilot'],scopes:['status','submit']}}],workers:[{id:'mac',token:wt,accounts:[account],primary:true}]}));
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}`;
 const operator=radarClient({url,token:ot}),worker=radarClient({url,token:wt});
 await assert.rejects(operator('claimsetup',{taskId:task.id}),/OPERATOR_ACTION_DENIED/);
 await assert.rejects(worker('claim',{taskId:task.id}),/TASK_KIND_MISMATCH/);
 const c=await worker('claimsetup',{taskId:task.id});
 await assert.rejects(operator('setupcomplete',{taskId:task.id,generation:c.generation,activeAccount:'astel.u',browserClosed:true}),/OPERATOR_ACTION_DENIED/);
 await assert.rejects(worker('setupcomplete',{taskId:task.id,generation:c.generation,activeAccount:'astel.u',browserClosed:'true'}),/BROWSER_CLOSE_REQUIRED/);
 assert.equal((await worker('setupcomplete',{taskId:task.id,generation:c.generation,activeAccount:'astel.u',browserClosed:true})).state,'SETUP_COMPLETE');
});
