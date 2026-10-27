import {fail} from './contract.js';
import type {Route} from './contract.js';
import type {BufferBinding} from './buffer.js';
// Observed 2026-10-27 via read-only Buffer account/channels API, not display-name joins.
export const bufferAccounts={
 instagram:{accountId:'6a976cf614d65def87288c29',organizationId:'6a976cf614d65def87288c34',projectId:'copilot',adapter:'buffer-instagram',channels:[
  {brandId:'astel.us',accountKey:'astel.us:instagram',platform:'instagram',channelId:'6add103a778b240e2fb3b052',serviceId:'17841473220032439'},
  {brandId:'astel.u',accountKey:'astel.u:instagram',platform:'instagram',channelId:'6add0fca778b240e2fb3a9e6',serviceId:'17841473267485723'},
  {brandId:'leoakastel',accountKey:'leoakastel:instagram',platform:'instagram',channelId:'6a976d44065799be466ec3b6',serviceId:'17841448996132476'}]},
 threads:{accountId:'6a7664e36fab588124f27411',organizationId:'6a7664e36fab588124f27413',projectId:'copilot',adapter:'buffer-threads',channels:[
  {brandId:'astel.us',accountKey:'astel.us:threads',platform:'threads',channelId:'6a76664c99afb44349216b3e',serviceId:'28182549434712528'},
  {brandId:'astel.u',accountKey:'astel.u:threads',platform:'threads',channelId:'6a76657f99afb44349215706',serviceId:'27842552208772075'},
  {brandId:'leoakastel',accountKey:'leoakastel:threads',platform:'threads',channelId:'6a7666c399afb44349217593',serviceId:'27234663629542439'}]},
 asapteam:{accountId:'6add2e4173a6eff0da11c966',organizationId:'6add2e4173a6eff0da11c968',projectId:'subteam',adapter:'buffer-subteam',channels:[
  {brandId:'asapleo.ai',accountKey:'asapleo.ai:instagram',platform:'instagram',channelId:'6add2fd6778b240e2fb6336e',serviceId:'17841460541410728'},
  {brandId:'wtffounder',accountKey:'wtffounder:instagram',platform:'instagram',channelId:'6add2e8c778b240e2fb61093',serviceId:'17841420257167643'}]}
} as const;
export function certifiedBindings(group:keyof typeof bufferAccounts,accountId:string,bindings:BufferBinding[],routes:Route[]){
 const expected=bufferAccounts[group];
 if(accountId!==expected.accountId||!bindings.length||new Set(bindings.map(b=>b.accountKey)).size!==bindings.length||new Set(bindings.map(b=>b.channelId)).size!==bindings.length)return fail('BUFFER_CERTIFIED_BINDING_REQUIRED',503);
 const result=bindings.map(b=>{const known=expected.channels.find(k=>k.accountKey===b.accountKey&&k.channelId===b.channelId&&k.platform===b.platform);if(!known||b.serviceId&&b.serviceId!==known.serviceId||b.organizationId&&b.organizationId!==expected.organizationId)return fail('BUFFER_CERTIFIED_BINDING_REQUIRED',503);return {...b,serviceId:known.serviceId,organizationId:expected.organizationId};});
 const selected=new Set<string>();
 for(const r of routes.filter(r=>expected.channels.some(k=>k.accountKey===r.accountKey))){
  const key=r.accountKey+':'+r.mode;
  if(selected.has(key)||r.adapter!==expected.adapter)return fail('BUFFER_MULTIPLE_EXECUTORS_DENIED',503);selected.add(key);
 }
 for(const r of routes.filter(r=>r.adapter===expected.adapter)){
  const known=expected.channels.find(k=>k.accountKey===r.accountKey&&k.brandId===r.brandId&&k.platform===r.platform);
  if(r.projectId!==expected.projectId||!known||!result.some(b=>b.accountKey===r.accountKey)||r.executionOwner!=='provider')return fail('BUFFER_CERTIFIED_ROUTE_REQUIRED',503);
 }
 return result;
}
