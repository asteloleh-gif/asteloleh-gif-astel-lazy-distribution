import test from 'node:test';
import assert from 'node:assert/strict';
import {AirtableEditorial,editorialMaterial} from '../dist/hub/editorial.js';
import {DistributionHub} from '../dist/hub/service.js';
import {emptyJournal} from '../dist/hub/store.js';
import {BufferAdapter} from '../dist/hub/buffer.js';
import {hash} from '../dist/hub/contract.js';
process.env={NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT??''};
const b={baseId:'appdOfW2woP9FaUX4',tableId:'tblisryw0mqPV4SK3',projectId:'copilot',brandId:'astel.us',accountKey:'astel.us:threads',token:'fixture-only'};
const row=()=>({id:'rec12345678901234',fields:{'Distribution Hub':true,Approval:'Draft',Platform:'Threads',Format:'Text',Caption:'Prepared editorial text',Revision:1,'Scheduled At':'2035-01-01T00:00:00Z','Delivery Mode':'Simulation'}});
const producer={id:'editorial-ua',role:'producer',projects:['copilot'],scopes:['editorial','submit','review','status']};
const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
function fixture(fetcher){const journal=emptyJournal('editorial');const hub=new DistributionHub({transaction:fn=>fn(journal,async()=>{})},[{projectId:'copilot',brandId:'astel.us',platform:'threads',accountKey:'astel.us:threads',mode:'simulation',adapter:'mock',executionOwner:'provider'}],[],{mock:{capabilities:()=>({schedule:true}),validate:async()=>{}}});let now=0;hub.editorial=new AirtableEditorial([b],fetcher,()=>now);return {hub,journal,tick:()=>now+=60001};}
test('editorial opt-in maps prepared text; historical jobs, approvals and uncertified media cannot migrate',()=>{
 assert.equal(editorialMaterial({id:row().id,fields:{}},b),undefined);
 for(const patch of [{Approval:'Approved'},{'Job ID':'legacy'},{'Source Record ID':'old'},{'Source Approval':'Approved'},{Platform:'Instagram'},{'Media URL':'https://example.test/image'},{Revision:0}])assert.throws(()=>editorialMaterial({...row(),fields:{...row().fields,...patch}},b));
 const input=editorialMaterial(row(),b);assert.equal(input.mode,'simulation');assert.equal(input.source.producer,'copilot-airtable');assert.equal(input.destinations[0].accountKey,b.accountKey);
});
test('pagination, writeback, owner approval and repeated sync keep exactly one durable plan without scheduling',async()=>{
 let fields=row().fields;const calls=[];
 const f=fixture(async(url,opts)=>{calls.push({url,method:opts.method});assert.ok(url.startsWith('https://api.airtable.com/v0/'+b.baseId+'/'+b.tableId));assert.equal(opts.redirect,'error');
  if(opts.method==='PATCH'){Object.assign(fields,JSON.parse(opts.body).fields);return response({id:row().id,fields});}
  if(url.includes('?'))return response(url.includes('offset=next')?{records:[{id:row().id,fields}]}:{records:[],offset:'next'});
  return response({id:row().id,fields});});
 let result=await f.hub.execute(producer,'importeditorial',{projectId:'copilot'});assert.equal(result.results[0].state,'NEEDS_APPROVAL');assert.equal(fields['Hub State'],'NEEDS_APPROVAL');assert.equal(fields.Approval,'Draft');
 const plan=Object.values(f.journal.plans)[0];await f.hub.execute({id:'oleg',role:'owner',projects:['copilot'],scopes:['approve']},'approve',{projectId:'copilot',planId:plan.id,digest:plan.digest});
 f.tick();await f.hub.execute(producer,'importeditorial',{projectId:'copilot'});assert.equal(fields['Hub State'],'APPROVED');assert.equal(Object.keys(f.journal.plans).length,1);assert.equal(plan.deliveries[0].attempts,0);
 fields={...fields,Caption:'Changed same revision'};f.tick();result=await f.hub.execute(producer,'importeditorial',{projectId:'copilot'});assert.equal(result.results[0].error,'IDEMPOTENCY_CONFLICT');assert.equal(plan.input.variants.threads.text,'Prepared editorial text');
 await assert.rejects(()=>f.hub.execute(producer,'schedule',{projectId:'copilot',planId:plan.id}),e=>e.status===403);
 assert.equal(calls.filter(c=>c.method==='PATCH').length,2);
});
test('quota stops further API attempts, repeated cursor fails, unknown errors never expose upstream data',async()=>{
 let calls=0;const q=fixture(async()=>{calls++;return new Response('private upstream body',{status:429});});
 await assert.rejects(()=>q.hub.execute(producer,'importeditorial',{projectId:'copilot'}),/EDITORIAL_HTTP_429/);q.tick();await assert.rejects(()=>q.hub.execute(producer,'importeditorial',{projectId:'copilot'}),/EDITORIAL_DISABLED_AFTER_PROVIDER_ERROR/);assert.equal(calls,1);
 const repeat=fixture(async()=>response({records:[],offset:'same'}));await assert.rejects(()=>repeat.hub.execute(producer,'importeditorial',{projectId:'copilot'}),/EDITORIAL_INVALID_CURSOR/);
});
test('foreign project, reader-only caller, and owner cannot import editorial records',async()=>{
 const f=fixture(async()=>{throw Error('no request');});
 await assert.rejects(()=>f.hub.execute(producer,'importeditorial',{projectId:'foreign'}),e=>e.status===403);
 await assert.rejects(()=>f.hub.execute({...producer,scopes:['status']},'importeditorial',{projectId:'copilot'}),e=>e.status===403);
 await assert.rejects(()=>f.hub.execute({...producer,role:'owner'},'importeditorial',{projectId:'copilot'}),e=>e.status===403);
});
test('post-checkpoint Airtable timeout leaves a recoverable plan; restart never duplicates it',async()=>{
 const f=fixture(async(url,opts)=>{if(url.includes('?'))return response({records:[row()]});if(opts.method==='PATCH')throw Error('sensitive transport error');return response(row());});
 let r=await f.hub.execute(producer,'importeditorial',{projectId:'copilot'});assert.equal(r.results[0].error,'EDITORIAL_TRANSPORT_UNCONFIRMED');
 f.hub.editorial=new AirtableEditorial([b],async url=>response(url.includes('?')?{records:[row()]}:row()));
 await f.hub.execute(producer,'importeditorial',{projectId:'copilot'});assert.equal(Object.keys(f.journal.plans).length,1);assert.equal(f.journal.events.length,2);
});
test('Buffer release gate permits only the exact approved material digest before issuing create',async()=>{
 const plan=editorialMaterial(row(),b),c={deliveryId:'d',plan,target:plan.destinations[0]};let calls=0;
 const fetcher=async()=>{calls++;return response({data:{createPost:{__typename:'PostActionSuccess',post:{id:'provider',channelId:'channel',text:plan.variants.threads.text,dueAt:c.target.scheduledAt,status:'scheduled'}}}});};
 const make=digests=>new BufferAdapter('buffer-threads','fixture','account',[{accountKey:b.accountKey,platform:'threads',channelId:'channel'}],{reserve:async()=>{}},true,fetcher,undefined,digests);
 await assert.rejects(()=>make([]).submit(c,async()=>{}),e=>e.code==='BUFFER_MATERIAL_NOT_RELEASED');assert.equal(calls,0);
 await make([hash(plan)]).submit(c,async()=>{});assert.equal(calls,1);
 const edited=structuredClone(c);edited.plan.variants.threads.text='Different';await assert.rejects(()=>make([hash(plan)]).submit(edited,async()=>{}),e=>e.code==='BUFFER_MATERIAL_NOT_RELEASED');assert.equal(calls,1);
});
