import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {mcpDescriptor,validMcpReadArguments} from '../dist/hub/mcp-contract.js';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
import {radarDescriptor,radarOperatorActions} from './radar/contract.mjs';
export const cloudActions=['capabilities','inbox','status','events','metrics','submit','preview','review','approve','schedule','cancel','reconcile','pause','resume','importeditorial'];
const required={submit:['input'],preview:['input'],review:['planId'],approve:['planId','digest'],schedule:['planId'],cancel:['planId'],reconcile:['planId']};
const error=code=>({isError:true,content:[{type:'text',text:code}]});
export const youtubeReadActions=['youtubeaccount','youtubevideos','youtubeanalytics'];
export function createKevinCloudBridge(call,{youtubeRead=false,ownerApprovalRequired=false,radarCall}={}){
 const actions=youtubeRead?[...cloudActions,...youtubeReadActions]:cloudActions;
 const projects=ownerApprovalRequired?['copilot','subteam']:['copilot'];
 const server=new Server({name:'astel-distribution-kevin-cloud',version:'1'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...actions.map(action=>{const descriptor=mcpDescriptor(action);if(required[action])descriptor.inputSchema.required=['projectId',...required[action]];return descriptor;}),...(radarCall?radarOperatorActions.map(radarDescriptor):[])]}));
 server.setRequestHandler(CallToolRequestSchema,async({params})=>{
  if(radarCall&&params.name.startsWith('radar_')){
    const action=params.name.slice(6);if(!radarOperatorActions.includes(action))return error('UNKNOWN_TOOL');
    try{const data=await radarCall(action,params.arguments);return {structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};}catch{return error('RADAR_OPERATION_FAILED');}
  }
  const action=actions.find(a=>params.name==='distribution_'+a),args=params.arguments;
  if(!action)return error('UNKNOWN_TOOL');
  if(!args||!projects.includes(args.projectId)||args.global===true||args.input&&args.input.projectId!==args.projectId)return error('PROJECT_DENIED');
  if(action==='approve'&&args.projectId!=='copilot')return error('PROJECT_DENIED');
  if(!validMcpReadArguments(action,args)||(required[action]??[]).some(k=>args[k]===undefined))return error('INVALID_TOOL_ARGUMENTS');
  try{const data=await call(action,args);if(!data||typeof data!=='object'||Array.isArray(data))return error('INVALID_HUB_RESULT');return {structuredContent:data,content:[{type:'text',text:JSON.stringify(data)}]};}
  catch{return error('HUB_OPERATION_FAILED');}
 });return server;
}
export function cloudHubCall(token,port,fetcher=fetch){
 if(typeof token!=='string'||token.length<40||!Number.isInteger(port)||port<1||port>65535)throw Error('KEVIN_CONFIG_REQUIRED');
 return async(action,args)=>{
  const r=await fetcher(`http://127.0.0.1:${port}/api/distribution/${action}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await r.json();if(!r.ok||data.error)throw Error('HUB_OPERATION_FAILED');return data;
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.env.LD_KEVIN_CLOUD_ENABLED!=='true')throw Error('DISABLED');let radarCall;if(process.env.RADAR_ENABLED==='true'){const {radarClient}=await import('./radar/client.mjs');radarCall=radarClient({url:`http://127.0.0.1:${Number(process.env.PORT||8080)}`,token:process.env.LD_KEVIN_HUB_TOKEN});}await createKevinCloudBridge(cloudHubCall(process.env.LD_KEVIN_HUB_TOKEN,Number(process.env.PORT||8080)),{radarCall,youtubeRead:process.env.LD_YOUTUBE_FAMILY_ENABLED==='true',ownerApprovalRequired:process.env.LD_ASAPTEAM_WORKFLOW_ENABLED==='true'}).connect(new StdioServerTransport());}
 catch{console.error('Kevin cloud bridge startup blocked.');process.exitCode=1;}
}
