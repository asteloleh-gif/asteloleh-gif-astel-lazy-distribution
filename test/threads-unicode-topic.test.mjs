import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileStore} from '../dist/hub/store.js';
import {provision} from '../dist/hub/provision.js';
import {validate,hash} from '../dist/hub/contract.js';
import {DistributionHub} from '../dist/hub/service.js';
import {BufferAdapter} from '../dist/hub/buffer.js';
const principal={id:'fixture',role:'producer',scopes:['submit'],projects:['p']};
const route={projectId:'p',brandId:'b',platform:'threads',accountKey:'a',adapter:'buffer',executionOwner:'provider',mode:'live'};
const input=(text,topic)=>({contractVersion:1,projectId:'p',brandId:'b',contentId:'fixture',revision:1,source:{producer:'fixture',reference:'local'},variants:{v:{text,...(topic===undefined?{}:{threads:{topic}})}},assets:[],destinations:[{platform:'threads',accountKey:'a',variant:'v',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'r',idempotencyKey:'k',mode:'live'});
const check=x=>validate(x,principal,[{...route,mode:x.mode}],[]);
const schema={metadata:{inputFields:[{name:'threads'}]},threads:{inputFields:[{name:'topic'}]}};
const response=data=>new Response(JSON.stringify({data}));
function setup(plan,{supported=true,echo=true,error=false,partial=false,topicResolverError=false}={}){
 const calls=[];const c={deliveryId:'d',plan,target:plan.destinations[0]};
 const a=new BufferAdapter('buffer','fixture','account',[{accountKey:'a',platform:'threads',channelId:'ch'}],{async reserve(){}},true,async(url,o)=>{
  const b=JSON.parse(o.body);calls.push(b);
  if(b.query.includes('metadata:__type'))return response(supported?schema:{});
  const post={id:'post',channelId:'ch',text:plan.variants.v.text,dueAt:c.target.scheduledAt,status:'scheduled',allowedActions:['deletePost'],metadata:echo?{topic:typeof echo==='string'?echo:plan.variants.v.threads?.topic}:null};
  if(topicResolverError&&b.query.includes('ThreadsPostMetadata{topic}'))return new Response(JSON.stringify({data:{post},errors:[{message:'topic resolver failed'}]}));
  if(b.query.includes('deletePost(input:'))return response({deletePost:{__typename:'DeletePostSuccess',id:'post'}});
  if(partial&&b.query.startsWith('mutation'))return new Response(JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post}},errors:[{message:'metadata unavailable'}]}));
  if(error)return new Response(JSON.stringify({errors:[{message:'unsupported'}]}));
  return response(b.query.startsWith('mutation')?{createPost:{__typename:'PostActionSuccess',post}}:{post});
 });return {a,c,calls};
}
test('Threads counts UTF-16 units, including emoji, Cyrillic and combining boundaries',()=>{
 for(const unit of ['a','я','ї']){
  for(const n of [499,500])assert.equal(check(input(unit.repeat(n))).variants.v.text,unit.repeat(n));
  assert.throws(()=>check(input(unit.repeat(501))),e=>e.code==='THREADS_TEXT_ONLY');
 }
 assert.doesNotThrow(()=>check(input('e\u0301'.repeat(250))));
 assert.throws(()=>check(input('e\u0301'.repeat(250)+'x')));
 for(const text of ['🤡'.repeat(250),'я'.repeat(498)+'🤡','ї'.repeat(250)+'🤡'.repeat(125),'👩‍💻'.repeat(100)]){
  assert.equal(text.length,500);assert.equal(check(input(text)).variants.v.text,text);
  assert.throws(()=>check(input(text+'x')),e=>e.code==='THREADS_TEXT_ONLY');
 }
 assert.throws(()=>check(input('🤡'.repeat(500))),e=>e.code==='THREADS_TEXT_ONLY');
});
test('topic is strict, platform scoped, immutable and included in approval digest',()=>{
 const x=input('текст','AI');assert.deepEqual(check(x),x);assert.notEqual(hash(x),hash(input('текст','UGC')));
 for(const topic of ['', '   ',null,5])assert.throws(()=>check(input('text',topic)));
 const bad=input('text','AI');bad.variants.v.threads.extra=true;assert.throws(()=>check(bad));
 const ig=input('text','AI');ig.destinations[0].platform='instagram';assert.throws(()=>validate(ig,principal,[{...route,platform:'instagram'}],[]),e=>e.code==='THREADS_TOPIC_PLATFORM_MISMATCH');
 const legacy=input('legacy');assert.deepEqual(check(legacy),legacy);
 const simulation={...x,mode:'simulation'};assert.deepEqual(check(simulation),simulation);
});
test('all 18 exact approved texts pass and map native topics through mocked Buffer',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/threads-approved-v1.json',import.meta.url),'utf8'));
 assert.equal(fixture.records.length,18);
 for(const row of fixture.records){
  assert.equal(row.nativeTopicVerified,false);
  const original=input(row.text,row.nativeTopicCandidate);
  const hub=new DistributionHub({transaction(){assert.fail('preview must not write');}},[route],[],{});
  const preview=await hub.execute(principal,'preview',{projectId:'p',input:original});
  assert.equal(preview.mutations,0);assert.deepEqual(preview.input,original);
  const plan=preview.input;const {a,c,calls}=setup(plan);const ids=[];
  await a.submit(c,async id=>ids.push(id));assert.deepEqual(ids,['post']);
  const sent=calls.find(x=>x.query.startsWith('mutation')).variables.input;
  assert.equal(sent.text,row.text);assert.equal(sent.metadata.threads.topic,row.nativeTopicCandidate);
  assert.match(calls[1].query,/ThreadsPostMetadata\{topic\}/);
  await a.status('post',c);
  if(row.id==='RU2'){assert.equal(Array.from(row.text).length,384);assert.equal(Buffer.byteLength(row.text),693);}
 }
});
test('unsupported topic stops before any mutation; mismatch checkpoints and fails closed',async()=>{
 const plan=check(input('Текст','AI'));const blocked=setup(plan,{supported:false});
 await assert.rejects(()=>blocked.a.submit(blocked.c,async()=>assert.fail()),e=>e.code==='BUFFER_THREADS_TOPIC_UNSUPPORTED');assert.equal(blocked.calls.length,1);
 const mismatch=setup(plan,{echo:false});const ids=[];
 await assert.rejects(()=>mismatch.a.submit(mismatch.c,async id=>ids.push(id)),e=>e.code==='BUFFER_THREADS_TOPIC_UNCONFIRMED');assert.deepEqual(ids,['post']);
 await assert.rejects(()=>mismatch.a.status('post',mismatch.c),e=>e.code==='BUFFER_THREADS_TOPIC_UNCONFIRMED');
 const failed=setup(plan,{error:true});await assert.rejects(()=>failed.a.submit(failed.c,async()=>assert.fail()),e=>e.code==='BUFFER_GRAPHQL_FAILED');
});

test('Hub restart and schedule retries never duplicate a create with unconfirmed topic or partial response',async t=>{
 for(const partial of [false,true]){
  const dir=await mkdtemp(join(tmpdir(),'threads-checkpoint-'));t.after(()=>rm(dir,{recursive:true,force:true}));await provision(dir,'fixture');
  const plan=check(input('Текст','AI')),options={echo:false,partial};const {a,calls}=setup(plan,options);
  const producer={...principal,scopes:['submit','review','schedule','reconcile','status']};
  const owner={id:'owner',role:'owner',projects:['p'],scopes:['approve']};
  const make=()=>new DistributionHub(new FileStore(dir,'fixture'),[route],[],{buffer:a},()=> '2029-01-01T00:00:00Z');
  let hub=make();const p=await hub.execute(producer,'submit',{projectId:'p',input:plan});const args={projectId:'p',planId:p.id};
  await hub.execute(producer,'review',args);await hub.execute(owner,'approve',{...args,digest:p.digest});
  let result=await hub.execute(producer,'schedule',args);
  assert.equal(result.state,'AMBIGUOUS_HOLD');assert.equal(result.deliveries[0].receipt.providerId,'post');
  hub=make();result=await hub.execute(producer,'schedule',args);assert.equal(result.deliveries[0].attempts,1);
  await hub.execute(producer,'reconcile',args);await hub.execute(producer,'schedule',args);
  assert.equal(calls.filter(c=>c.query.startsWith('mutation')).length,1);
  assert.ok(calls.some(c=>c.query.startsWith('query($input:PostInput')&&c.variables.input.id==='post'));
 }
});
test('only a concrete unequal returned topic is a mismatch',async()=>{
 const {a,c}=setup(check(input('Текст','AI')),{echo:'UGC'});const ids=[];
 await assert.rejects(()=>a.submit(c,async id=>ids.push(id)),e=>e.code==='BUFFER_THREADS_TOPIC_MISMATCH');assert.deepEqual(ids,['post']);
});

test('unconfirmed or mismatching topic does not prevent safe cancellation of an identified scheduled post',async()=>{
 for(const echo of [false,'UGC']){
  const {a,c,calls}=setup(check(input('Текст','AI')),{echo,topicResolverError:true});
  assert.equal((await a.cancel('post',c)).state,'CANCELLED');
  assert.ok(calls.every(call=>!call.query.includes('ThreadsPostMetadata')));
  assert.equal(calls.filter(c=>c.query.includes('deletePost(input:')).length,1);
  await assert.rejects(()=>a.cancel('different-id',c),e=>e.code==='BUFFER_POST_IDENTITY_MISMATCH');
  assert.equal(calls.filter(c=>c.query.includes('deletePost(input:')).length,1);
 }
});

test('topic limits use UTF-16 and documented forbidden characters without byte restrictions',async()=>{
 for(const topic of ['я'.repeat(50),'🤡'.repeat(25),'AI','E-commerce','Social Media','Startups','Small Business','UGC','Online Shopping','Content Creation']){
  const plan=check(input('Текст',topic));assert.equal(plan.variants.v.threads.topic,topic);
  const {a,c,calls}=setup(plan);await a.submit(c,async()=>{});
  assert.equal(calls.find(r=>r.query.startsWith('mutation')).variables.input.metadata.threads.topic,topic);
 }
 for(const topic of ['x'.repeat(51),'🤡'.repeat(25)+'x','A&B','AI.','.', '&', '', '   ',null,5]){
  assert.throws(()=>check(input('Текст',topic)),e=>e.code==='INVALID_THREADS_TOPIC');
  const {a,c,calls}=setup(input('Текст',topic));
  await assert.rejects(()=>a.submit(c,async()=>assert.fail()),e=>e.code==='INVALID_THREADS_TOPIC');assert.equal(calls.length,0);
 }
 const {a,c,calls}=setup(input('🤡'.repeat(251),'AI'));
 await assert.rejects(()=>a.submit(c,async()=>assert.fail()),e=>e.code==='BUFFER_THREADS_TEXT_ONLY');assert.equal(calls.length,0);
});
