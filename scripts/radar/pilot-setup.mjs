// Run ONLY inside the existing Hub container using its existing operator credential.
// No worker credentials, registry changes, DB writes, or auto retry on ambiguous errors.
import {radarClient} from './client.mjs';
import {SETUP_QUERY} from './core.mjs';
const mode=process.argv[2];
if(!['inspect','create'].includes(mode))throw Error('USE_INSPECT_OR_CREATE');
const call=radarClient({url:`http://127.0.0.1:${Number(process.env.PORT||8080)}`,token:process.env.LD_KEVIN_HUB_TOKEN});
const payload={account:'astel.u:threads',batch:'manual-login-astel-u-20261028',query:SETUP_QUERY};
try{
 const {tasks}=await call('list',{});
 const matches=tasks.filter(t=>t.account===payload.account&&t.batch===payload.batch&&t.query===payload.query);
 if(matches.length>1)throw Error('AMBIGUOUS_SETUP_TASK');
 const existing=matches[0];
 // Do not resume, claim or replace another task; list may be bounded, create is idempotent.
 if(!existing&&tasks.some(t=>t.account===payload.account&&['RUNNING','HOLD'].includes(t.state)))throw Error('ACCOUNT_BUSY');
 const task=existing??(mode==='create'?await call('create',payload):null);
 console.log(JSON.stringify({mode,task:task?{id:task.id,state:task.state,account:task.account,batch:task.batch}:null}));
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PILOT_SETUP_FAILED');process.exitCode=1;}
