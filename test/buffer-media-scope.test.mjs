import test from 'node:test';import assert from 'node:assert/strict';
import {bufferMediaScope} from '../dist/hub/buffer-media-scope.js';
import {bufferAccounts} from '../dist/hub/buffer-bindings.js';
import {BufferAdapter} from '../dist/hub/buffer.js';
import {configuredHub} from '../dist/hub/runtime.js';
const asap=['asapleo.ai:instagram','wtffounder:instagram'];
test('media scope is an explicit known Instagram allowlist, rejects foreign/Threads/duplicate and malformed values',()=>{
 assert.deepEqual(bufferMediaScope(undefined),[]);assert.deepEqual(bufferMediaScope(JSON.stringify(asap)),asap);
 for(const raw of ['invalid','null','{}','["foreign"]','["astel.us:threads"]',JSON.stringify([asap[0],asap[0]])])assert.throws(()=>bufferMediaScope(raw),e=>e.code==='BUFFER_MEDIA_SCOPE_INVALID');
});
function runtime(scope){const saved=process.env;process.env={LD_STORAGE_DIR:'/tmp/media-scope-no-io',LD_STORAGE_BINDING:'fixture',LD_BUFFER_DRIVE_MEDIA_ENABLED:'true',LD_BUFFER_STRICT_BINDINGS:'true',LD_BUFFER_REELS_ENABLED:'true',LD_BUFFER_MEDIA_ACCOUNT_KEYS_JSON:JSON.stringify(scope)};
 for(const [name,g]of Object.entries(bufferAccounts)){const prefix='LD_BUFFER_'+(name==='asapteam'?'ASAPTEAM':name.toUpperCase());process.env[prefix+'_TOKEN']='fixture';process.env[prefix+'_ACCOUNT_ID']=g.accountId;process.env[prefix+'_BINDINGS_JSON']=JSON.stringify(g.channels);}
 try{return configuredHub().hub;}finally{process.env=saved;}}
const command=(b,kind='image')=>({deliveryId:'read-only',target:{platform:b.platform,accountKey:b.accountKey,variant:'v',scheduledAt:'2035-01-01T00:00:00Z',timezone:'America/Chicago'},plan:{variants:{v:{text:'Existing prepared material',...(b.platform==='instagram'?{asset:0}:{})}},assets:[{kind,availableUntil:'2035-01-02T00:00:00Z',url:'https://buffer-updates-media-backfill-bucket.s3.amazonaws.com/fixture.jpg'}]}});
test('ASAP-only flags leave all three Copilot images and all three Threads validation unchanged, with zero network reads/writes',async()=>{
 const saved=globalThis.fetch;let reads=0;globalThis.fetch=async()=>{reads++;throw Error('MUST_NOT_FETCH');};try{
 const hub=runtime(asap);
 for(const b of bufferAccounts.instagram.channels){await hub.adapters['buffer-instagram'].validate(command(b));await assert.rejects(()=>hub.adapters['buffer-instagram'].validate(command(b,'reel')),e=>e.code==='BUFFER_REELS_NOT_ENABLED');}
 for(const b of bufferAccounts.threads.channels)await hub.adapters['buffer-threads'].validate(command(b));assert.equal(reads,0);
 }finally{globalThis.fetch=saved;}
});
test('selected ASAP blocks non-Drive source; unselected Copilot remains untouched; partial scope never enables all ASAP writes',async()=>{
 const hub=runtime(asap);await assert.rejects(()=>hub.adapters['buffer-subteam'].validate(command(bufferAccounts.asapteam.channels[0],'reel')),e=>e.code==='DRIVE_MEDIA_URL_DENIED');
 const saved=process.env;try{process.env={LD_STORAGE_DIR:'/tmp/noio',LD_STORAGE_BINDING:'x',LD_BUFFER_DRIVE_MEDIA_ENABLED:'true'};assert.throws(()=>configuredHub(),e=>e.code==='BUFFER_MEDIA_SCOPE_REQUIRED');
 process.env={...process.env,LD_BUFFER_MEDIA_ACCOUNT_KEYS_JSON:JSON.stringify([asap[0]]),LD_BUFFER_ASAPTEAM_ENABLE_WRITES:'true',LD_BUFFER_ASAPTEAM_TOKEN:'fixture',LD_BUFFER_ASAPTEAM_ACCOUNT_ID:bufferAccounts.asapteam.accountId,LD_BUFFER_ASAPTEAM_BINDINGS_JSON:JSON.stringify(bufferAccounts.asapteam.channels)};assert.throws(()=>configuredHub(),e=>e.code==='BUFFER_ASAPTEAM_PREFLIGHT_REQUIRED');
 }finally{process.env=saved;}
});
test('per-account scope applies Drive and Reel checks only to selected account even within the same adapter',async()=>{
 let probes=0,reads=0;const [a,b]=bufferAccounts.instagram.channels;
 const adapter=new BufferAdapter('buffer-instagram','fixture','fixture-account',[a,b],{reserve:async()=>{}},false,async()=>{reads++;throw Error('NO_NETWORK');},undefined,undefined,[],{reels:true,verifyIdentity:true,accountKeys:[a.accountKey],probe:async()=>{probes++;throw Error('SELECTED_PREFLIGHT');}});
 await adapter.validate(command(b));assert.equal(probes,0);assert.equal(reads,0);
 await assert.rejects(()=>adapter.validate(command(a)),/SELECTED_PREFLIGHT/);assert.equal(probes,1);assert.equal(reads,0);
});
test('cloud identity checker is read-only and never returns secret values or raw provider errors',async()=>{
 const {checkCloudAsapIdentity}=await import('../scripts/check-cloud-asap-identity.mjs');const secret='fixture-sensitive-token';let calls=0;
 const fail=await checkCloudAsapIdentity({LD_BUFFER_ASAPTEAM_TOKEN:secret},async(u,o)=>{calls++;assert.equal(u,'https://api.buffer.com');assert.equal(o.redirect,'error');assert.ok(JSON.parse(o.body).query.startsWith('query'));return new Response(JSON.stringify({errors:[{message:secret}]}));});assert.deepEqual(fail,{status:'BLOCKED_PROVIDER_READ'});assert.ok(!JSON.stringify(fail).includes(secret));assert.equal(calls,1);
 assert.deepEqual(await checkCloudAsapIdentity({}),{status:'BLOCKED_TOKEN_MISSING'});
});
