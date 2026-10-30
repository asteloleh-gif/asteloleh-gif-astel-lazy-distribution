import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,hash} from '../dist/hub/contract.js';
import {DistributionHub} from '../dist/hub/service.js';
import {BufferAdapter} from '../dist/hub/buffer.js';
const principal={id:'fixture',role:'producer',scopes:['submit'],projects:['p']};
const route={projectId:'p',brandId:'b',platform:'threads',accountKey:'a',adapter:'buffer',executionOwner:'provider',mode:'live'};
const input=(text,topic)=>({contractVersion:1,projectId:'p',brandId:'b',contentId:'fixture',revision:1,source:{producer:'fixture',reference:'local'},variants:{v:{text,...(topic===undefined?{}:{threads:{topic}})}},assets:[],destinations:[{platform:'threads',accountKey:'a',variant:'v',scheduledAt:'2030-01-01T00:00:00Z',timezone:'America/Chicago'}],requestId:'r',idempotencyKey:'k',mode:'live'});
const check=x=>validate(x,principal,[{...route,mode:x.mode}],[]);
const schema={metadata:{inputFields:[{name:'threads'}]},threads:{inputFields:[{name:'topic'}]}};
const response=data=>new Response(JSON.stringify({data}));
function setup(plan,{supported=true,echo=true,error=false}={}){
 const calls=[];const c={deliveryId:'d',plan,target:plan.destinations[0]};
 const a=new BufferAdapter('buffer','fixture','account',[{accountKey:'a',platform:'threads',channelId:'ch'}],{async reserve(){}},true,async(url,o)=>{
  const b=JSON.parse(o.body);calls.push(b);
  if(b.query.includes('metadata:__type'))return response(supported?schema:{});
  const post={id:'post',channelId:'ch',text:plan.variants.v.text,dueAt:c.target.scheduledAt,status:'scheduled',metadata:echo?{topic:plan.variants.v.threads?.topic}:null};
  if(error)return new Response(JSON.stringify({errors:[{message:'unsupported'}]}));
  return response(b.query.startsWith('mutation')?{createPost:{__typename:'PostActionSuccess',post}}:{post});
 });return {a,c,calls};
}
test('Threads counts Unicode code points, including boundaries and combining sequences',()=>{
 for(const unit of ['a','я','ї','🤡']){
  for(const n of [499,500])assert.equal(check(input(unit.repeat(n))).variants.v.text,unit.repeat(n));
  assert.throws(()=>check(input(unit.repeat(501))),e=>e.code==='THREADS_TEXT_ONLY');
 }
 assert.doesNotThrow(()=>check(input('e\u0301'.repeat(250))));
 assert.throws(()=>check(input('e\u0301'.repeat(250)+'x')));
 assert.doesNotThrow(()=>check(input('👩‍💻'.repeat(166)+'ab')));
 assert.throws(()=>check(input('👩‍💻'.repeat(167))));
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
 await assert.rejects(()=>mismatch.a.submit(mismatch.c,async id=>ids.push(id)),e=>e.code==='BUFFER_THREADS_TOPIC_MISMATCH');assert.deepEqual(ids,['post']);
 await assert.rejects(()=>mismatch.a.status('post',mismatch.c),e=>e.code==='BUFFER_THREADS_TOPIC_MISMATCH');
 const failed=setup(plan,{error:true});await assert.rejects(()=>failed.a.submit(failed.c,async()=>assert.fail()),e=>e.code==='BUFFER_GRAPHQL_FAILED');
});
