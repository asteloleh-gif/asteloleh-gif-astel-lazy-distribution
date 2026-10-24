import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenPostHttpPort} from '../dist/hub/openpost-http.js';
import {hash} from '../dist/hub/contract.js';
process.env={NODE_TEST_CONTEXT:process.env.NODE_TEST_CONTEXT??''};
const command=()=>({deliveryId:'delivery-1',plan:{projectId:'copilot',contentId:'prepared',variants:{main:{text:'Prepared text'}},assets:[]},target:{accountKey:'astel.us:threads',platform:'threads',variant:'main',scheduledAt:'2030-01-01T00:00:00Z'}});
function fixture(options={}){
 const c=command(),calls=[];let publication;
 if(options.format){c.target.platform='instagram';c.target.accountKey='astel.us:instagram';c.plan.variants.main.asset=0;c.plan.assets=[{kind:options.format,digest:'sha256:'+'a'.repeat(64),revision:'v1',url:'https://assets.astel.test/master',availableUntil:'2031-01-01T00:00:00Z'}];}
 const fetcher=async(url,opts)=>{
  calls.push({path:new URL(url).pathname,method:opts.method,body:opts.body&&JSON.parse(opts.body),redirect:opts.redirect});
  const path=new URL(url).pathname;
  if(path.endsWith('/version'))return Response.json({version:options.wrongVersion?'v0':'v5.2.2',revision:'a6effd0341a7a8cb5c54efe1bc6f4b4c364cfba2'});
  if(path.endsWith('/accounts'))return Response.json([{id:'account-1',account_id:options.wrongIdentity?'other':'platform-account',account_username:'astel.us',platform:c.target.platform,is_active:true}]);
  if(path.endsWith('/publications')&&opts.method==='POST'){
   const b=JSON.parse(opts.body);publication={...b,id:'publication-1',revision:1,status:'draft',renditions:b.renditions.map(r=>({...r,platform:c.target.platform,media:r.media.map(m=>({id:m.media_id})),status:'pending'}))};return Response.json(publication);
  }
  if(path.endsWith('/validate'))return Response.json({valid:!options.invalid,issues:[]});
  if(path.endsWith('/schedule')){publication.status='scheduled';if(options.timeout)throw Error('private bearer token diagnostic');return Response.json({job_id:'job-1',message:'accepted'});}
  if(path.endsWith('/cancel')){if(!options.cancelUnconfirmed){publication.status='draft';publication.scheduled_at='0001-01-01T00:00:00Z';publication.revision++;}return Response.json({message:'accepted'});}
  if(path.endsWith('/events'))return Response.json(options.noCancelEvent?[]:[{id:'event-cancel',type:'cancelled',status:'succeeded',workspace_id:'workspace-1',publication_id:'publication-1',revision:publication.revision,superseded:false}]);
  if(path.endsWith('/publication-1')){const p=structuredClone(publication);if(options.drift)p.source_text='edited';if(options.published){p.status='published';p.renditions[0].status='published';if(!options.missingPostId)p.renditions[0].external_id='platform-post-1';}return Response.json(p);}
  throw Error('Unexpected endpoint');
 };
 const port=new OpenPostHttpPort('https://installed.example','fixture-secret','workspace-1',[{projectId:'copilot',accountKey:c.target.accountKey,platform:c.target.platform,format:options.format??'text',providerAccountId:'account-1',platformAccountId:'platform-account',username:'astel.us',contentProfile:'short_text',outputProfile:options.format==='reel'?'instagram.reel':options.format==='image'?'instagram.feed':'threads.post'}],options.format?[{digest:c.plan.assets[0].digest,revision:'v1',mediaId:'media-1'}]:[],fetcher);
 return {port,c,calls,options};
}
test('installed-schema HTTP port creates one exact draft, validates, schedules once; job ID never becomes platform ID',async()=>{
 const f=fixture();let checkpoint;const r=await f.port.submit(f.c,async id=>{checkpoint=id;});assert.equal(checkpoint,'publication-1');assert.deepEqual(r,{state:'PROVIDER_ACCEPTED',providerId:'publication-1',providerJobId:'job-1',providerRevision:1});
 assert.equal(f.calls.filter(c=>c.path.endsWith('/schedule')).length,1);assert.ok(f.calls.every(c=>c.redirect==='error'));
 const sent=f.calls.find(c=>c.path.endsWith('/publications')).body;assert.equal(sent.metadata.ld_digest,hash(f.c));assert.equal(sent.random_delay_minutes,0);assert.equal(sent.renditions[0].settings.text_card,'off');
 f.options.published=true;assert.equal((await f.port.status('publication-1',f.c)).platformPostId,'platform-post-1');
});
test('HTTP port rejects identity mismatch before any provider mutation',async()=>{
 const f=fixture({wrongIdentity:true});await assert.rejects(()=>f.port.submit(f.c,async()=>{}),e=>e.code==='OPENPOST_IDENTITY_MISMATCH');assert.equal(f.calls.length,2);
});
test('HTTP port retains checkpoint on schedule timeout; does not retry or use publish-now',async()=>{
 const f=fixture({timeout:true});let id;await assert.rejects(()=>f.port.submit(f.c,async v=>{id=v;}));assert.equal(id,'publication-1');assert.equal(f.calls.filter(c=>c.path.endsWith('/schedule')).length,1);assert.ok(!f.calls.some(c=>c.path.endsWith('/publish-now')));
});
test('HTTP port cannot schedule invalid draft or drifted version',async()=>{
 for(const options of [{invalid:true},{drift:true}]){const f=fixture(options);await assert.rejects(()=>f.port.submit(f.c,async()=>{}));assert.ok(!f.calls.some(c=>c.path.endsWith('/schedule')));}
});
test('unattested media cannot be imported or fetched; no arbitrary URL import route',async()=>{
 const f=fixture({format:'image'});f.c.plan.assets[0].revision='unattested-revision';f.c.plan.assets[0].url='https://private.example/file';await assert.rejects(()=>f.port.validate(f.c),e=>e.code==='OPENPOST_MEDIA_NOT_ATTESTED');assert.equal(f.calls.length,0);
});
test('cancellation is confirmed by readback; acceptance alone stays unconfirmed',async()=>{
 const f=fixture({cancelUnconfirmed:true});await f.port.submit(f.c,async()=>{});assert.equal(await f.port.cancel('publication-1',f.c),undefined);f.options.cancelUnconfirmed=false;assert.equal((await f.port.cancel('publication-1',f.c)).state,'CANCELLED');
});
test('published status without platform ID is not publication proof',async()=>{
 const f=fixture({published:true,missingPostId:true});await f.port.submit(f.c,async()=>{});assert.equal((await f.port.status('publication-1',f.c)).state,'PROVIDER_ACCEPTED');
});

test('Instagram image and Reel use attested media IDs and format-bound operator profile, never URL import',async()=>{
 for(const format of ['image','reel']){const f=fixture({format});const receipt=await f.port.submit(f.c,async()=>{});assert.equal(receipt.state,'PROVIDER_ACCEPTED');const body=f.calls.find(c=>c.path.endsWith('/publications')).body;assert.deepEqual(body.renditions[0].media,[{media_id:'media-1'}]);assert.equal(body.renditions[0].output_profile,format==='reel'?'instagram.reel':'instagram.feed');assert.equal(JSON.stringify(body).includes('https://assets.'),false);}
});

test('installed version drift blocks writes before draft creation',async()=>{
 const f=fixture({wrongVersion:true});await assert.rejects(()=>f.port.submit(f.c,async()=>{}),e=>e.code==='OPENPOST_VERSION_MISMATCH');assert.equal(f.calls.length,1);
});
test('v5.2.2 cancellation needs cleared schedule and matching lifecycle event; draft alone is not proof',async()=>{
 const f=fixture({noCancelEvent:true});await f.port.submit(f.c,async()=>{});await assert.rejects(()=>f.port.cancel('publication-1',f.c),e=>e.code==='OPENPOST_CANCEL_PROOF_MISSING');
 f.options.noCancelEvent=false;const result=await f.port.status('publication-1',f.c,{cancelRequested:true});assert.equal(result.state,'CANCELLED');assert.equal(result.cancellationEventId,'event-cancel');
 await assert.rejects(()=>f.port.status('publication-1',f.c),e=>e.code==='OPENPOST_PUBLICATION_DRIFT');
});
