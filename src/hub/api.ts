import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticate, fail, HubError, actionScopes } from './contract.js';
import type { Credential } from './contract.js';
import type { DistributionHub } from './service.js';
import {mcpDescriptor,validMcpReadArguments} from './mcp-contract.js';
export const actions=Object.keys(actionScopes);
export async function readBoundedJson(req:IncomingMessage){
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;if(size>128*1024)fail('BODY_TOO_LARGE',413);chunks.push(Buffer.from(chunk));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail('INVALID_JSON',400);}
}
export function hubApi(hub:DistributionHub|undefined,credentials:Credential[]){
  const rates=new Map<string,{since:number;count:number}>();
  return async(req:IncomingMessage,res:ServerResponse)=>{
    const json=(status:number,data:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    try{
      const p=authenticate(req.headers.authorization,credentials);
      if(!hub)return fail('HUB_STORAGE_NOT_CONFIGURED',503);
      const now=Date.now();const r=rates.get(p.id);
      if(!r||now-r.since>=60000)rates.set(p.id,{since:now,count:1});else if(++r.count>60)return fail('RATE_LIMITED',429);
      if(req.method!=='POST')return json(405,{error:'POST_REQUIRED'});
      const body=await readBoundedJson(req);
      const path=new URL(req.url??'/', 'http://localhost').pathname;
      if(path==='/mcp'){
        if(body.jsonrpc!=='2.0')return json(400,{error:'INVALID_RPC'});
        if(body.method==='initialize')return json(200,{jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'astel-distribution-hub',version:'1'}}});
        if(body.method==='notifications/initialized'){res.writeHead(202);res.end();return;}
        if(body.method==='tools/list')return json(200,{jsonrpc:'2.0',id:body.id,result:{tools:actions.filter(a=>(!a.startsWith('youtube')||(!!hub?.youtube||Object.keys(hub.youtubeAccounts).length>0))&&p.scopes.includes(actionScopes[a])&&(!['approve','pause','resume'].includes(a)||p.role==='owner')).map(mcpDescriptor)}});
        if(body.method!=='tools/call')return json(200,{jsonrpc:'2.0',id:body.id,error:{code:-32601,message:'METHOD_NOT_FOUND'}});
        const name=body.params?.name;
        if(typeof name!=='string'||!name.startsWith('distribution_')||!actions.includes(name.slice(13)))return json(200,{jsonrpc:'2.0',id:body.id,error:{code:-32602,message:'UNKNOWN_TOOL'}});
        const action=name.slice(13);
        if(!validMcpReadArguments(action,body.params.arguments))return json(200,{jsonrpc:'2.0',id:body.id,error:{code:-32602,message:'INVALID_TOOL_ARGUMENTS'}});
        try{
          const result=await hub.execute(p,action,body.params.arguments);
          return json(200,{jsonrpc:'2.0',id:body.id,result:{structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}]}});
        }catch(e){
          const code=e instanceof HubError?e.code:'HUB_OPERATION_FAILED';
          return json(200,{jsonrpc:'2.0',id:body.id,result:{isError:true,content:[{type:'text',text:code}]}});
        }
      }
      const action=path.slice('/api/distribution/'.length);
      return json(200,await hub.execute(p,action,body));
    }catch(e){return json(e instanceof HubError?e.status:500,{error:e instanceof HubError?e.code:'HUB_OPERATION_FAILED'});}
  };
}
