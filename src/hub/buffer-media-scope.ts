import {fail} from './contract.js';
import {bufferAccounts} from './buffer-bindings.js';
// All three gates share one explicit account allowlist. No implicit global rollout.
export function bufferMediaScope(raw:string|undefined){
 let value:unknown;try{value=JSON.parse(raw??'[]');}catch{return fail('BUFFER_MEDIA_SCOPE_INVALID',503);}
 const allowed=new Set<string>(Object.values(bufferAccounts).flatMap(g=>g.channels.filter(c=>c.platform==='instagram').map(c=>c.accountKey)));
 if(!Array.isArray(value)||value.some(k=>typeof k!=='string'||!allowed.has(k))||new Set(value).size!==value.length)return fail('BUFFER_MEDIA_SCOPE_INVALID',503);
 return value as string[];
}
