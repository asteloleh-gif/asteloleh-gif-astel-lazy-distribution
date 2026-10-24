import {configuredHub} from './runtime.js';
// One immutable private approval card. Simulation can never publish to Buffer.
if(process.env.LD_CONNECTOR_CANARY!=='true')throw Error('EXPLICIT_CONNECTOR_CANARY_REQUIRED');
const {hub}=configuredHub();if(!hub)throw Error('HUB_NOT_CONFIGURED');
const producer={id:'connector-canary',role:'producer' as const,projects:['copilot'],scopes:['submit','review'] as ('submit'|'review')[]};
const input={contractVersion:1 as const,projectId:'copilot',brandId:'astel.us',contentId:'telegram-fallback-check-v1',revision:1,
  source:{producer:'connector-canary',reference:'telegram-fallback-release-20261024'},variants:{threads:{text:'Проверка запасного канала Astel. Это тест согласования. Публикация в соцсетях отключена.'}},assets:[],
  destinations:[{platform:'threads' as const,accountKey:'astel.us:threads',variant:'threads',scheduledAt:'2035-01-01T00:00:00Z',timezone:'America/Chicago'}],
  requestId:'telegram-fallback-check-v1',idempotencyKey:'telegram-fallback-check-v1',mode:'simulation' as const};
const plan=await hub.execute(producer,'submit',{projectId:'copilot',input}) as {id:string;state:string};
if(plan.state==='DRAFT')await hub.execute(producer,'review',{projectId:'copilot',planId:plan.id});
console.log('CONNECTOR_CANARY_READY_SIMULATION_ONLY');
