import test from 'node:test';import assert from 'node:assert/strict';
import {driveMediaProbe} from '../dist/hub/drive-media.js';
import {BufferAdapter} from '../dist/hub/buffer.js';
import {certifiedBindings,bufferAccounts} from '../dist/hub/buffer-bindings.js';
const url='https://drive.google.com/uc?export=download&id=ABCDEFGHIJK123';
const asset={url,kind:'reel',digest:'sha256:'+'a'.repeat(64),revision:'1',availableUntil:'2035-01-02T00:00:00Z'};
const scheduledAt='2035-01-01T00:00:00Z';
const ok=(mime='video/mp4',size='1000')=>new Response(null,{headers:{'content-type':mime,'content-length':size}});
test('Drive probe checks direct public media via HEAD only and validates each redirect, never downloads or sends credentials',async()=>{
 const calls=[];const probe=driveMediaProbe(async(u,o)=>{calls.push({u,o});return calls.length===1?new Response(null,{status:302,headers:{location:'https://drive.usercontent.google.com/download?export=download&id=ABCDEFGHIJK123'}}):ok();},()=>0);
 await probe(asset,scheduledAt);assert.equal(calls.length,2);for(const {o}of calls){assert.equal(o.method,'HEAD');assert.equal(o.redirect,'manual');assert.equal(o.credentials,'omit');assert.equal(o.headers,undefined);}
});
test('Drive fail-closed: private/login/HTML, wrong MIME, missing length, oversized, expired, redirects to private IP or arbitrary hosts',async()=>{
 for(const response of [()=>ok('text/html'),()=>ok('image/jpeg'),()=>ok('video/mp4',''),()=>ok('video/mp4','99999999999'),()=>new Response(null,{status:403}),()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}),()=>new Response(null,{status:302,headers:{location:'https://accounts.google.com/login'}})])await assert.rejects(()=>driveMediaProbe(async()=>response(),()=>0)(asset,scheduledAt));
 let calls=0;const probe=driveMediaProbe(async()=>{calls++;return ok();});for(const bad of ['https://drive.google.com/file/d/ABCDEFGHIJK123/view','https://evil.test/a','https://drive.google.com/uc?export=download&id=ABCDEFGHIJK123&access_token=secret'])await assert.rejects(()=>probe({...asset,url:bad},scheduledAt));assert.equal(calls,0);
 await assert.rejects(()=>probe({...asset,availableUntil:scheduledAt},scheduledAt),e=>e.code==='DRIVE_MEDIA_EXPIRY_REQUIRED');
});
test('Drive images use their own MIME/size boundary; cyclic redirects and unavailable transport do not retry forever',async()=>{
 await driveMediaProbe(async()=>ok('image/png'),()=>0)({...asset,kind:'image'},scheduledAt);
 await assert.rejects(()=>driveMediaProbe(async()=>ok('video/mp4'),()=>0)({...asset,kind:'image'},scheduledAt));
 let calls=0;await assert.rejects(()=>driveMediaProbe(async()=>{calls++;return new Response(null,{status:302,headers:{location:url}});},()=>0)(asset,scheduledAt),e=>e.code==='DRIVE_MEDIA_REDIRECT_LOOP');assert.equal(calls,1);
 calls=0;await assert.rejects(()=>driveMediaProbe(async()=>{calls++;throw Error('sensitive url');},()=>0)(asset,scheduledAt),e=>e.code==='DRIVE_MEDIA_UNAVAILABLE');assert.equal(calls,1);
});
const known={...bufferAccounts.asapteam.channels[0],organizationId:bufferAccounts.asapteam.organizationId};const command={deliveryId:'delivery',target:{platform:'instagram',accountKey:known.accountKey,variant:'v',scheduledAt,timezone:'America/Chicago'},plan:{projectId:'subteam',brandId:known.brandId,variants:{v:{text:'Prepared Reel',asset:0}},assets:[asset]}};
const channel={id:known.channelId,organizationId:known.organizationId,service:known.platform,serviceId:known.serviceId,isDisconnected:false,isLocked:false,isQueuePaused:false,allowedActions:['scheduleUpdates']};
const remote={id:'provider-1',channelId:known.channelId,text:'Prepared Reel',dueAt:scheduledAt,status:'scheduled'};
const response=data=>new Response(JSON.stringify({data}));
function fixture(options={}){const calls=[];const a=new BufferAdapter('buffer-subteam','fixture',bufferAccounts.asapteam.accountId,[known],{reserve:async()=>{}},true,async(u,o)=>{const b=JSON.parse(o.body);calls.push(b);if(b.query.startsWith('mutation'))return response({createPost:{__typename:'PostActionSuccess',post:remote}});return response({account:{id:options.wrongAccount?'foreign':bufferAccounts.asapteam.accountId},channel:{...channel,...options.channel}});},undefined,undefined,[],{reels:true,verifyIdentity:true,probe:options.probe??(async()=>{})});return {a,calls};}
test('Reel mapping uses certified channel, explicit reel metadata, exact Drive URL and one provider create after media/account checks',async()=>{
 const {a,calls}=fixture();const ids=[];const r=await a.submit(command,async id=>ids.push(id));assert.equal(r.state,'PROVIDER_ACCEPTED');assert.deepEqual(ids,['provider-1']);assert.equal(calls.length,2);assert.deepEqual(calls[1].variables.input.assets,[{video:{url}}]);assert.deepEqual(calls[1].variables.input.metadata,{instagram:{type:'reel',shouldShareToFeed:true}});assert.equal(calls[1].variables.input.channelId,known.channelId);assert.equal(calls[1].variables.input.aiAssisted,false);
});
test('foreign provider account, service ID, disconnected/paused channel, missing permissions or failed media forbid create',async()=>{
 for(const options of [{wrongAccount:true},{channel:{serviceId:'foreign'}},{channel:{organizationId:'foreign'}},{channel:{service:'threads'}},{channel:{isDisconnected:true}},{channel:{isQueuePaused:true}},{channel:{allowedActions:[]}},{probe:async()=>{throw Error('unavailable');}}]){const {a,calls}=fixture(options);await assert.rejects(()=>a.submit(command,async()=>{}));assert.ok(calls.every(c=>!c.query.startsWith('mutation')));}
});
test('explicit account registry rejects swapped brands, projects, platforms, duplicate bindings and mixed Buffer accounts; all eight identities remain distinct',()=>{
 const ids=[];for(const [key,g]of Object.entries(bufferAccounts)){const routes=g.channels.map(c=>({projectId:g.projectId,brandId:c.brandId,accountKey:c.accountKey,platform:c.platform,adapter:g.adapter,executionOwner:'provider',mode:'live'}));const bindings=g.channels.map(c=>({...c}));assert.equal(certifiedBindings(key,g.accountId,bindings,routes).length,g.channels.length);ids.push(...bindings.map(b=>b.channelId));assert.throws(()=>certifiedBindings(key,'foreign',bindings,routes));assert.throws(()=>certifiedBindings(key,g.accountId,[bindings[0],bindings[0]],routes));assert.throws(()=>certifiedBindings(key,g.accountId,bindings,[{...routes[0],brandId:'foreign'}]));assert.throws(()=>certifiedBindings(key,g.accountId,bindings,[{...routes[0],projectId:'foreign'}]));}assert.equal(new Set(ids).size,8);
 const g=bufferAccounts.asapteam;assert.throws(()=>certifiedBindings('asapteam',g.accountId,[bufferAccounts.instagram.channels[0]],[]));
});

test('single-image mapping remains image-only metadata and sent Reel does not invent a platform ID',async()=>{
 const image=structuredClone(command);image.plan.assets[0].kind='image';const {a,calls}=fixture();await a.submit(image,async()=>{});assert.deepEqual(calls.at(-1).variables.input.assets,[{image:{url}}]);assert.equal(calls.at(-1).variables.input.metadata,undefined);
 const b=new BufferAdapter('buffer-subteam','fixture',bufferAccounts.asapteam.accountId,[known],{reserve:async()=>{}},true,async()=>response({post:{...remote,status:'sent',externalLink:'https://www.instagram.com/reel/example'}}));const receipt=await b.status('provider-1',command);assert.equal(receipt.state,'PROVIDER_ACCEPTED');assert.equal(receipt.providerStatus,'sent');assert.equal(receipt.platformPostId,undefined);
});
test('duplicate scheduling owners, route reassignment and swapped service identifiers fail before startup',()=>{
 const g=bufferAccounts.asapteam,b=[g.channels[0]],r={projectId:'subteam',brandId:known.brandId,accountKey:known.accountKey,platform:'instagram',adapter:'buffer-subteam',executionOwner:'provider',mode:'live'};
 assert.throws(()=>certifiedBindings('asapteam',g.accountId,b,[r,r]),e=>e.code==='BUFFER_MULTIPLE_EXECUTORS_DENIED');
 assert.throws(()=>certifiedBindings('asapteam',g.accountId,b,[{...r,adapter:'openpost'}]),e=>e.code==='BUFFER_MULTIPLE_EXECUTORS_DENIED');
 assert.throws(()=>certifiedBindings('asapteam',g.accountId,[{...known,serviceId:'foreign'}],[r]));
});
test('Reel unknown creation outcome remains on durable hold across restart and repeated commands; provider checkpoint survives lost validation',async t=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {DistributionHub}=await import('../dist/hub/service.js'),{FileStore}=await import('../dist/hub/store.js'),{provision}=await import('../dist/hub/provision.js');
 const dir=await mkdtemp(join(tmpdir(),'reels-durable-'));t.after(()=>rm(dir,{recursive:true,force:true}));await provision(dir,'reels');
 const input={contractVersion:1,projectId:'subteam',brandId:known.brandId,contentId:'reel',revision:1,source:{producer:'subteam',reference:'drive-source'},variants:{v:{text:'Prepared Reel',asset:0}},assets:[asset],destinations:[command.target],requestId:'r',idempotencyKey:'k',mode:'live'};
 const route={projectId:'subteam',brandId:known.brandId,accountKey:known.accountKey,platform:'instagram',adapter:'buffer-subteam',executionOwner:'provider',mode:'live'};
 const producer={id:'producer',role:'producer',projects:['subteam'],scopes:['submit','review','schedule','status','reconcile']},owner={id:'owner',role:'owner',projects:['subteam'],scopes:['approve']};
 let creates=0;const a=new BufferAdapter('buffer-subteam','fixture',bufferAccounts.asapteam.accountId,[known],{reserve:async()=>{}},true,async(u,o)=>{const q=JSON.parse(o.body).query;if(q.startsWith('mutation')){creates++;throw Error('lost ack');}return response({account:{id:bufferAccounts.asapteam.accountId},channel});},undefined,undefined,[],{reels:true,verifyIdentity:true,probe:async()=>{}});
 const make=()=>new DistributionHub(new FileStore(dir,'reels'),[route],['drive.google.com'],{'buffer-subteam':a},()=> '2034-12-01T00:00:00Z');let h=make();const p=await h.execute(producer,'submit',{projectId:'subteam',input}),args={projectId:'subteam',planId:p.id};
 await h.execute(producer,'review',args);await h.execute(owner,'approve',{...args,digest:p.digest});assert.equal((await h.execute(producer,'schedule',args)).state,'AMBIGUOUS_HOLD');h=make();assert.equal((await h.execute(producer,'submit',{projectId:'subteam',input})).id,p.id);assert.equal((await h.execute(producer,'schedule',args)).state,'AMBIGUOUS_HOLD');assert.equal((await h.execute(producer,'reconcile',args)).deliveries[0].error,'PROVIDER_ID_MISSING_NO_RETRY');assert.equal(creates,1);
});
test('provider ID is checkpointed before a mismatched Reel acknowledgement, and no false publication is returned',async()=>{
 let mutations=0;const checkpoint=[];
 const a=new BufferAdapter('buffer-subteam','fixture',bufferAccounts.asapteam.accountId,[known],{reserve:async()=>{}},true,async(u,o)=>{const q=JSON.parse(o.body).query;if(q.startsWith('mutation')){mutations++;return response({createPost:{__typename:'PostActionSuccess',post:{...remote,channelId:'foreign'}}});}return response({account:{id:bufferAccounts.asapteam.accountId},channel});},undefined,undefined,[],{reels:true,verifyIdentity:true,probe:async()=>{}});
 await assert.rejects(()=>a.submit(command,async id=>checkpoint.push(id)),e=>e.code==='BUFFER_POST_IDENTITY_MISMATCH');assert.deepEqual(checkpoint,['provider-1']);assert.equal(mutations,1);
});
test('unconfirmed sent Reel cannot return an arbitrary external permalink or fabricated platform ID',async()=>{
 for(const link of ['https://evil.test/reel/a','http://www.instagram.com/reel/a','not-a-url']){
 const a=new BufferAdapter('buffer-subteam','fixture',bufferAccounts.asapteam.accountId,[known],{reserve:async()=>{}},false,async()=>response({post:{...remote,status:'sent',externalLink:link}}));await assert.rejects(()=>a.status('provider-1',command),e=>e.code==='BUFFER_PLATFORM_LINK_DENIED');}
});
