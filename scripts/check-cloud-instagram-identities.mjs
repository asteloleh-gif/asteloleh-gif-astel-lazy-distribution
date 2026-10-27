// Read-only inside the existing Hub container; never exports credentials or reads posts/queues.
export async function checkCloudInstagramIdentities(env=process.env,fetcher=fetch){
 const groups=[{key:'INSTAGRAM',account:'6a976cf614d65def87288c29',organization:'6a976cf614d65def87288c34',channels:[['astel.us:instagram','6add103a778b240e2fb3b052','17841473220032439'],['astel.u:instagram','6add0fca778b240e2fb3a9e6','17841473267485723'],['leoakastel:instagram','6a976d44065799be466ec3b6','17841448996132476']]},{key:'ASAPTEAM',account:'6add2e4173a6eff0da11c966',organization:'6add2e4173a6eff0da11c968',channels:[['asapleo.ai:instagram','6add2fd6778b240e2fb6336e','17841460541410728'],['wtffounder:instagram','6add2e8c778b240e2fb61093','17841420257167643']]}];
 const results=[];
 try{for(const g of groups){const token=env['LD_BUFFER_'+g.key+'_TOKEN'];if(!token)return {status:'BLOCKED_TOKEN_MISSING',group:g.key};
 const query='query($input:ChannelInput!){account{id} channel(input:$input){id organizationId service serviceId type scopes isDisconnected isLocked isQueuePaused hasActiveMemberDevice allowedActions}}';
 for(const [accountKey,id,serviceId]of g.channels){const r=await fetcher('https://api.buffer.com',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{input:{id}}}),redirect:'error',signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok||d.errors||!d.data)return {status:'BLOCKED_PROVIDER_READ'};const c=d.data.channel;
 const identityMatches=d.data.account?.id===g.account&&c?.id===id&&c.organizationId===g.organization&&c.service==='instagram'&&c.serviceId===serviceId;
 const ready=identityMatches&&c.isDisconnected===false&&c.isLocked===false&&c.isQueuePaused===false&&c.allowedActions?.includes('scheduleUpdates')===true&&c.scopes?.some(s=>['instagram_business_content_publish','instagram_content_publish'].includes(s))===true;
 results.push({accountKey,identityMatches,ready,automaticStories:ready&&c.type==='business',notificationDevice:c?.hasActiveMemberDevice===true,facebookFeatures:c?.scopes?.includes('instagram_basic')===true});
 }}return {status:results.every(r=>r.ready)?'PASS':'FAIL_BINDING_OR_READINESS',results};}catch{return {status:'BLOCKED_PROVIDER_READ'};}
}
