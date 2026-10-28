import {timingSafeEqual} from 'node:crypto';
import {Radar,RadarError,accounts,deny} from './core.mjs';
import {schemas,workerActions,radarOperatorActions as operatorActions} from './contract.mjs';
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function createRadarApi({radar,credentials=[],workers=[]}){
  const rates=new Map();
  return async(req,res)=>{
    const json=(code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
    try{
      if(req.method!=='POST')deny('POST_REQUIRED',405);
      const token=String(req.headers.authorization??'').replace(/^Bearer /,'');
      const worker=workers.find(w=>typeof w.token==='string'&&w.token.length>=32&&equal(token,w.token));
      const credential=credentials.find(c=>typeof c.token==='string'&&c.token.length>=32&&equal(token,c.token));
      const p=credential?.principal;
      if(!worker&&(!p?.projects?.includes('copilot')))deny('FORBIDDEN',403);
      const actor=worker?.id??p.id,rateKey=(worker?'worker:':'operator:')+actor,now=Date.now();
      const rate=rates.get(rateKey);if(!rate||now-rate.at>60000)rates.set(rateKey,{at:now,n:1});else if(++rate.n>120)deny('RATE_LIMITED',429);
      const action=new URL(req.url,'http://localhost').pathname.split('/').at(-1);
      if(!schemas[action])deny('UNKNOWN_ACTION',404);
      if(worker&&!workerActions.includes(action))deny('WORKER_ACTION_DENIED',403);
      if(!worker){if(action==='resume'){if(p.role!=='owner'||p.delegatedApproval===true)deny('OWNER_REQUIRED',403);}else if(!operatorActions.includes(action))deny('OPERATOR_ACTION_DENIED',403);
        if(!p.scopes.includes(['create','draft'].includes(action)?'submit':'status'))deny('SCOPE_DENIED',403);}
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>128*1024)deny('BODY_TOO_LARGE',413);chunks.push(chunk);}
      let a;try{a=JSON.parse(Buffer.concat(chunks).toString());}catch{deny('INVALID_JSON',400);}
      if(!a||Array.isArray(a)||typeof a!=='object'||Object.keys(a).some(k=>!schemas[action].includes(k))||schemas[action].some(k=>a[k]===undefined))deny('INVALID_ARGUMENTS',400);
      if(a.taskId!==undefined&&(typeof a.taskId!=='string'||a.taskId.length>100))deny('INVALID_TASK_ID',400);
      if(worker&&a.taskId&&!worker.accounts.includes(radar.status(a.taskId).account))deny('WORKER_ACCOUNT_DENIED',403);
      let result;
      switch(action){
        case 'capabilities':result={version:1,mode:'READ_AND_LOCAL_DRAFTS',accounts,actions:operatorActions,sending:false,videoViewingCertified:false,coordinator:'single-instance sqlite',failover:'HOLD requires owner confirmation that previous worker stopped'};break;
        case 'create':result=radar.create(a,actor);break;
        case 'list':result={tasks:radar.list()};break;
        case 'pending':result={tasks:radar.pending(worker.accounts)};break;
        case 'status':result=radar.status(a.taskId);break;
        case 'evidence':result={items:radar.evidence(a.taskId)};break;
        case 'drafts':result={items:radar.drafts(a.taskId)};break;
        case 'draft':result=radar.draft(a.taskId,a,actor);break;
        case 'resume':result=radar.resume(a.taskId,actor,a);break;
        case 'claim':result=radar.claim(a.taskId,actor,worker.accounts,worker.primary===true);break;
        case 'heartbeat':result=radar.heartbeat(a.taskId,actor,a.generation);break;
        case 'checkpoint':result=radar.checkpoint(a.taskId,actor,a.generation,a.checkpoint);break;
        case 'record':result=radar.record(a.taskId,actor,a.generation,a.evidence);break;
        case 'complete':result=radar.complete(a.taskId,actor,a.generation);break;
        case 'hold':result=radar.hold(a.taskId,actor,a.generation,a.reason);break;
      }
      json(200,result);
    }catch(e){json(e instanceof RadarError?e.status:500,{error:e instanceof RadarError?e.code:'RADAR_OPERATION_FAILED'});}
  };
}
export function configuredRadar(credentials){
  if(process.env.RADAR_ENABLED!=='true')return undefined;
  const file=process.env.RADAR_DB_PATH;if(!file||!file.startsWith('/'))throw Error('RADAR_ABSOLUTE_DB_PATH_REQUIRED');
  const workers=JSON.parse(process.env.RADAR_WORKERS_JSON??'[]');
  if(!Array.isArray(workers)||workers.some(w=>typeof w.id!=='string'||!Array.isArray(w.accounts)||w.accounts.some(a=>!accounts[a])||typeof w.token!=='string'||w.token.length<32)||new Set(workers.map(w=>w.id)).size!==workers.length||new Set(workers.map(w=>w.token)).size!==workers.length||workers.filter(w=>w.primary===true).length>1)throw Error('RADAR_WORKER_CONFIG_INVALID');
  if(workers.some(w=>credentials.some(c=>c.token===w.token)))throw Error('RADAR_WORKER_TOKEN_MUST_BE_DISTINCT');
  const radar=new Radar(file);return createRadarApi({radar,credentials,workers});
}
