// Run ONLY inside the already-approved Hub container. No local secret export or new listener.
// No SDK/dependencies, files, mutation, response-body logs, secret length/hash or token output.
export async function checkCloudAsapIdentity(env=process.env,fetcher=fetch){
 const token=env.LD_BUFFER_ASAPTEAM_TOKEN;if(!token)return {status:'BLOCKED_TOKEN_MISSING'};
 const query=async q=>{let r;try{r=await fetcher('https://api.buffer.com',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:q}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw Error('BUFFER_READ_UNAVAILABLE');}const d=await r.json().catch(()=>null);if(!r.ok||!d?.data||d.errors)throw Error('BUFFER_READ_DENIED');return d.data;};
 try{
  const {account}=await query('query{account{id organizations{id}}}');
  if(account?.id!=='6add2e4173a6eff0da11c966')return {status:'FAIL_ACCOUNT_MISMATCH'};
  if(!account.organizations?.some(o=>o.id==='6add2e4173a6eff0da11c968'))return {status:'FAIL_ORGANIZATION_MISMATCH'};
  const {channels}=await query('query{channels(input:{organizationId:"6add2e4173a6eff0da11c968"}){id organizationId service serviceId isDisconnected isLocked isQueuePaused allowedActions}}');
  const expected=[{channelId:'6add2fd6778b240e2fb6336e',serviceId:'17841460541410728'},{channelId:'6add2e8c778b240e2fb61093',serviceId:'17841420257167643'}];
  const checks=expected.map(e=>{const c=channels?.find(c=>c.id===e.channelId);return {channelId:e.channelId,identityMatches:!!c&&c.organizationId==='6add2e4173a6eff0da11c968'&&c.service==='instagram'&&c.serviceId===e.serviceId,ready:!!c&&c.isDisconnected===false&&c.isLocked===false&&c.isQueuePaused===false&&c.allowedActions?.includes('scheduleUpdates')===true};});
  return {status:checks.every(c=>c.identityMatches&&c.ready)?'PASS':'FAIL_CHANNEL_BINDING_OR_READINESS',accountId:account.id,checks};
 }catch{return {status:'BLOCKED_PROVIDER_READ'};}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){const result=await checkCloudAsapIdentity();console.log(JSON.stringify(result));if(result.status!=='PASS')process.exitCode=1;}
