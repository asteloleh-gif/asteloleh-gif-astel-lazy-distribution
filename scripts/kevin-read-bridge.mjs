import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mcpDescriptor,validMcpReadArguments} from '../dist/hub/mcp-contract.js';
const actions=['capabilities','inbox','status','events','metrics'];
const origin='https://lazy-distribution-production.up.railway.app';
const toolError=code=>({isError:true,content:[{type:'text',text:code}]});
// No HTTP listener and no scheduler. The private tunnel owns the stdio channel.
export function createKevinReadBridge(call,projectId='copilot'){
 const server=new Server({name:'astel-lazy-distribution-read-only',version:'1'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:actions.map(mcpDescriptor)}));
 server.setRequestHandler(CallToolRequestSchema,async request=>{
  const name=request.params.name;
  const action=actions.find(a=>name==='distribution_'+a);
  if(!action)return toolError('READ_ONLY_TOOL_REQUIRED');
  const args=request.params.arguments;
  if(!validMcpReadArguments(action,args))return toolError('INVALID_TOOL_ARGUMENTS');
  if(args.projectId!==projectId)return toolError('PROJECT_DENIED');
  try{
   const result=await call(action,args);
   if(!result||typeof result!=='object'||Array.isArray(result))return toolError('INVALID_HUB_RESULT');
   return {structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]};
  }catch{return toolError('HUB_READ_FAILED');}
 });
 return server;
}
export async function openHubReader(keyPath,fetcher=fetch){
 const info=await stat(keyPath);
 if(!info.isFile()||(info.mode&0o077)!==0||info.uid!==process.getuid())throw Error('OWNER_ONLY_CREDENTIAL_FILE_REQUIRED');
 const key=JSON.parse(await readFile(keyPath,'utf8'));
 // Dedicated secret, not Buffer credentials or an owner token.
 if(key.projectId!=='copilot'||typeof key.token!=='string'||key.token.length<32)throw Error('READ_CREDENTIAL_REQUIRED');
 let sequence=0;
 async function rpc(method,params){
  const response=await fetcher(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+key.token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('HUB_READ_FAILED');
  const data=await response.json();if(data.error||!data.result||data.result.isError)throw Error('HUB_READ_FAILED');return data.result;
 }
 await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'kevin-read-bridge',version:'1'}});
 const tools=(await rpc('tools/list')).tools;
 const allowed=actions.map(a=>'distribution_'+a);
 if(!Array.isArray(tools)||tools.length!==allowed.length||new Set(tools.map(t=>t.name)).size!==allowed.length||tools.some(t=>!allowed.includes(t.name)))throw Error('UPSTREAM_READ_ONLY_IDENTITY_REQUIRED');
 return async(action,args)=>{
  if(!actions.includes(action)||args.projectId!=='copilot')throw Error('PROJECT_DENIED');
  const result=await rpc('tools/call',{name:'distribution_'+action,arguments:args});
  return result.structuredContent??JSON.parse(result.content.find(c=>c.type==='text').text);
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const path=process.env.LD_KEVIN_CREDENTIAL_FILE;if(!path)throw Error('CREDENTIAL_FILE_REQUIRED');
  const call=await openHubReader(path);await createKevinReadBridge(call).connect(new StdioServerTransport());
 }catch{console.error('Kevin read bridge startup blocked; verify read-only credential and Hub access.');process.exitCode=1;}
}
