import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function radarClient({url=process.env.RADAR_URL,token=process.env.RADAR_TOKEN}={}){
  const u=new URL(url);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('HTTPS_COORDINATOR_REQUIRED');
  if(!token||token.length<32)throw Error('RADAR_TOKEN_REQUIRED');
  return async(action,args)=>{if(!/^[a-z]+$/.test(action))throw Error('INVALID_ACTION');const r=await fetch(new URL('/api/radar/'+action,u),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});const data=await r.json();if(!r.ok)throw Error(data.error??'RADAR_UNAVAILABLE');return data;};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const action=process.argv[2];const args=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(await radarClient()(action,args),null,2));}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'RADAR_CLIENT_FAILED');process.exitCode=1;}
}
