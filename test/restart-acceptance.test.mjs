import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyJournal} from '../dist/hub/store.js';
process.env={NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT??''};
test('isolated HTTP scenario: process restart retains delegated queue; replay does not duplicate; cancel reaches backend and survives second restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ld-process-acceptance-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await writeFile(join(dir,'hub-storage-manifest.json'),JSON.stringify({version:1,binding:'restart-fixture',durable:true}));await writeFile(join(dir,'hub-journal.json'),JSON.stringify(emptyJournal('restart-fixture')));
 let publication,creates=0,schedules=0,cancels=0;
 const backend=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const text=Buffer.concat(chunks).toString();const body=text?JSON.parse(text):{};const path=new URL(req.url,'http://localhost').pathname;
  const send=x=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(x));};
  if(path.endsWith('/version'))return send({version:'v5.2.2',revision:'a6effd0341a7a8cb5c54efe1bc6f4b4c364cfba2'});
  if(path.endsWith('/accounts'))return send([{id:'account-1',account_id:'platform-account',account_username:'astel.us',platform:'threads',is_active:true}]);
  if(path.endsWith('/publications')&&req.method==='POST'){creates++;publication={...body,id:'publication-1',revision:1,status:'draft',renditions:body.renditions.map(r=>({...r,platform:'threads',media:[],status:'draft'}))};return send(publication);}
  if(path.endsWith('/validate'))return send({valid:true,issues:[]});
  if(path.endsWith('/schedule')){schedules++;publication.status='scheduled';return send({job_id:'job-1',message:'queued'});}
  if(path.endsWith('/cancel')){cancels++;publication.status='draft';publication.scheduled_at='0001-01-01T00:00:00Z';publication.revision++;return send({message:'cancelled'});}
  if(path.endsWith('/events'))return send([{id:'cancel-event-1',type:'cancelled',status:'succeeded',revision:publication.revision,workspace_id:'workspace-1',publication_id:'publication-1',superseded:false}]);
  if(path.endsWith('/publication-1'))return send(publication);
  res.writeHead(404);res.end('{}');
 }).listen(0,'127.0.0.1');await once(backend,'listening');t.after(()=>backend.close());
 const children=[];t.after(()=>children.forEach(c=>c.kill('SIGKILL')));
 const start=async()=>{const child=fork(new URL('./fixtures/hub-server.mjs',import.meta.url),[],{env:{},stdio:['ignore','ignore','pipe','ipc']});children.push(child);child.send({directory:dir,providerOrigin:'http://127.0.0.1:'+backend.address().port});const [{port}]=await once(child,'message');return {child,port};};
 const stop=async c=>{const exited=once(c,'exit');c.kill('SIGTERM');await exited;};
 let server=await start();
 const call=async(action,args,owner=false)=>{const response=await fetch(`http://127.0.0.1:${server.port}/api/distribution/${action}`,{method:'POST',headers:{Authorization:'Bearer '+(owner?'owner-fixture-':'producer-fixture-').repeat(3),'Content-Type':'application/json'},body:JSON.stringify({projectId:'copilot',...args})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
 const input={contractVersion:1,projectId:'copilot',brandId:'astel.us',contentId:'restart-acceptance',revision:1,source:{producer:'copilot',reference:'fixture'},variants:{main:{text:'Offline prepared material'}},assets:[],destinations:[{platform:'threads',accountKey:'astel.us:threads',variant:'main',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'req-1',idempotencyKey:'key-1',mode:'live'};
 const plan=await call('submit',{input});await call('review',{planId:plan.id});await call('approve',{planId:plan.id,digest:plan.digest},true);assert.equal((await call('schedule',{planId:plan.id})).state,'PROVIDER_ACCEPTED');
 await stop(server.child);server=await start();const restored=await call('status',{planId:plan.id});assert.equal(restored.deliveries[0].receipt.providerId,'publication-1');assert.equal(publication.status,'scheduled');
 assert.equal((await call('submit',{input})).id,plan.id);await call('schedule',{planId:plan.id});assert.equal(creates,1);assert.equal(schedules,1);
 const cancelled=await call('cancel',{planId:plan.id});assert.equal(cancelled.state,'CANCELLED');assert.equal(cancelled.deliveries[0].receipt.cancellationEventId,'cancel-event-1');assert.equal(cancels,1);assert.equal(publication.status,'draft');
 await stop(server.child);server=await start();assert.equal((await call('status',{planId:plan.id})).state,'CANCELLED');assert.equal(JSON.parse(await readFile(join(dir,'hub-journal.json'),'utf8')).plans[plan.id].state,'CANCELLED');
 await stop(server.child);
});
