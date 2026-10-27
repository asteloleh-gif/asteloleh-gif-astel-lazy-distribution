// Read-only verification using existing owner-only keys; never submits, cancels or updates.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {homedir} from 'node:os';import {join} from 'node:path';
import {BufferAdapter} from '../dist/hub/buffer.js';
import {bufferAccounts,certifiedBindings} from '../dist/hub/buffer-bindings.js';
const results=[];
for(const [group,g]of Object.entries(bufferAccounts)){
 const label=group==='asapteam'?'subteam':group;const file=join(homedir(),'.config/astel-distribution',`buffer-${label}.key`);
 try{
  if((await stat(file)).mode&0o077)throw Error('OWNER_ONLY_KEY_REQUIRED');const token=(await readFile(file,'utf8')).trim();
  const bindings=certifiedBindings(group,g.accountId,g.channels,[]);
  const adapter=new BufferAdapter(g.adapter,token,g.accountId,bindings,{reserve:async()=>{}},false,fetch,undefined,undefined,[],{verifyIdentity:true});
  for(const c of bindings){
   const target={platform:c.platform,accountKey:c.accountKey,variant:'prepared',scheduledAt:new Date(Date.now()+3600000).toISOString(),timezone:'America/Chicago'};
   // This material is never submitted; a dummy image only exercises binding checks, not media validation.
   const plan={variants:{prepared:{text:'Read-only identity check',...(c.platform==='instagram'?{asset:0}:{})}},assets:[{kind:'image'}]};
   try{await adapter.validate({deliveryId:'read-only',plan,target});results.push({group,accountKey:c.accountKey,channelId:c.channelId,serviceId:c.serviceId,status:'PASS_REMOTE_IDENTITY_ONLY'});}catch(e){results.push({group,accountKey:c.accountKey,status:'FAIL',error:e.code??'READ_FAILED'});}
  }
 }catch{results.push({group,status:'BLOCKED_KEY_OR_ACCESS'});}
}
const evidence={at:new Date().toISOString(),mutations:0,source:'Live Buffer API using existing keys from Mac; not deployed runtime proof',results};
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));if(results.some(r=>!r.status.startsWith('PASS')))process.exitCode=1;
