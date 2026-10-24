import test from 'node:test';
import assert from 'node:assert/strict';
import {threadsConfirmer} from '../dist/hub/threads-confirm.js';
const binding={accountKey:'astel.us:threads',userId:'12345',username:'astel.us',token:'fixture-never-real'};
const link='https://www.threads.com/@astel.us/post/ABC123';
const command={target:{platform:'threads',accountKey:binding.accountKey,variant:'text',scheduledAt:'2026-10-24T23:00:00Z'},plan:{assets:[],variants:{text:{text:'Approved text'}}}};
const post={id:'99999',text:'Approved text',permalink:'https://www.threads.net/@astel.us/post/ABC123',username:'astel.us',owner:{id:'12345'},timestamp:'2026-10-24T23:00:00Z',media_type:'TEXT_POST'};
const response=data=>new Response(JSON.stringify(data));
test('platform proof reads identity and exact own post; it never guesses platform ID from Buffer ID/link',async()=>{
 const calls=[];const confirm=threadsConfirmer([binding],async(url,opts)=>{calls.push(url);assert.equal(opts.redirect,'error');assert.equal(new URL(url).origin,'https://graph.threads.net');assert.ok(!url.includes(binding.token));return response(url.includes('/me?')?{id:binding.userId,username:binding.username}:{data:[post]});},()=>Date.parse('2026-10-24T23:05:00Z'));
 assert.deepEqual(await confirm(link,command),{platformPostId:'99999',confirmedAt:'2026-10-24T23:05:00.000Z'});assert.equal(calls.length,2);
});
test('wrong identity, material, owner or old timestamp never produces a confirmed receipt',async()=>{
 for(const patch of [{text:'Changed'},{owner:{id:'other'}},{timestamp:'2020-01-01T00:00:00Z'},{media_type:'IMAGE'}]){
  const c=threadsConfirmer([binding],async url=>response(url.includes('/me?')?{id:'12345',username:'astel.us'}:{data:[{...post,...patch}]}));await assert.rejects(()=>c(link,command),e=>e.code==='THREADS_PROOF_MATERIAL_MISMATCH');
 }
 const c=threadsConfirmer([binding],async()=>response({id:'wrong',username:'astel.us'}));await assert.rejects(()=>c(link,command),e=>e.code==='THREADS_PROOF_IDENTITY_MISMATCH');
});
test('pagination constructs a fixed endpoint and uses cursors; missing evidence stays unconfirmed',async()=>{
 const calls=[];const c=threadsConfirmer([binding],async url=>{calls.push(url);return response(url.includes('/me?')?{id:'12345',username:'astel.us'}:url.includes('after=cursor')?{data:[]}:{data:[],paging:{next:'https://evil.example/steal',cursors:{after:'cursor'}}});});
 assert.equal(await c(link,command),undefined);assert.equal(calls.length,3);assert.ok(calls.every(u=>u.startsWith('https://graph.threads.net/')));
});
test('foreign account/link and upstream failure never send credentials to another host or retry',async()=>{
 let calls=0;const c=threadsConfirmer([binding],async()=>{calls++;throw Error('private body');});
 await assert.rejects(()=>c('https://evil.example/@astel.us/post/ABC123',command));assert.equal(calls,0);
 assert.equal(await c(link,{...command,target:{...command.target,accountKey:'other:threads'}}),undefined);assert.equal(calls,0);
 await assert.rejects(()=>c(link,command),/THREADS_PROOF_UNCONFIRMED/);assert.equal(calls,1);
});
