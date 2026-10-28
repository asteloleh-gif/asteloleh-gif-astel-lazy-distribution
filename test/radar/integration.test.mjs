import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {Radar} from '../../scripts/radar/core.mjs';
import {createRadarApi} from '../../scripts/radar/api.mjs';
import {createServer} from 'node:http';
import {radarClient} from '../../scripts/radar/client.mjs';

test('three simultaneous executor processes get exactly one task lease',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'radar-race-'));const file=join(dir,'radar.sqlite');const r=new Radar(file);t.after(()=>{r.close();rmSync(dir,{recursive:true,force:true});});
 const task=r.create({account:'astel.u:threads',batch:'race',query:'AI'},'owner');
 const moduleUrl=new URL('../../scripts/radar/core.mjs',import.meta.url).href;
 const script=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {Radar}=await import(workerData.moduleUrl);const r=new Radar(workerData.file);try{r.claim(workerData.id,workerData.worker,['astel.u:threads'],true);parentPort.postMessage('CLAIMED');}catch(e){parentPort.postMessage(e.code||'FAILED');}finally{r.close();}})();`;
 const results=await Promise.all(['kevin','mac','codex'].map(worker=>new Promise((ok,bad)=>{const w=new Worker(script,{eval:true,workerData:{moduleUrl,file,id:task.id,worker}});w.on('message',ok);w.on('error',bad);})));assert.equal(results.filter(x=>x==='CLAIMED').length,1);assert.equal(results.filter(x=>x==='TASK_NOT_READY').length,2);
});
test('delegated Kevin owner cannot confirm human recovery through direct HTTP',async t=>{
 const r=new Radar(':memory:');t.after(()=>r.close());const task=r.create({account:'astel.u:threads',batch:'auth',query:'AI'},'owner');const c=r.claim(task.id,'cloud',[task.account],true);r.hold(task.id,'cloud',c.generation,'OPERATOR_STOP');
 const token='k'.repeat(40),owner='h'.repeat(40);const api=createRadarApi({radar:r,credentials:[{token,principal:{id:'kevin-cloud',role:'owner',delegatedApproval:true,projects:['copilot'],scopes:['submit','status']}},{token:owner,principal:{id:'oleg',role:'owner',projects:['copilot'],scopes:['status']}}]});
 const server=createServer(api);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());const url=`http://127.0.0.1:${server.address().port}`;
 await assert.rejects(radarClient({url,token})('resume',{taskId:task.id,previousWorkerStopped:true}),/OWNER_REQUIRED/);
 assert.equal((await radarClient({url,token:owner})('resume',{taskId:task.id,previousWorkerStopped:true})).state,'READY');
});
