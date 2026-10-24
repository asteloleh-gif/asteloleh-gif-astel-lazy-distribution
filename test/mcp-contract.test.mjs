import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createAppServer} from '../dist/server.js';
import {DistributionHub} from '../dist/hub/service.js';
import {emptyJournal} from '../dist/hub/store.js';
const key='offline-read-fixture-'.repeat(3);
async function fixture(t){const j=emptyJournal('test');const hub=new DistributionHub({transaction:fn=>fn(j,async()=>{})},[],[],{});const server=createAppServer({hub,credentials:[{token:key,principal:{id:'reader',role:'producer',projects:['copilot'],scopes:['status']}}]});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));const url=`http://127.0.0.1:${server.address().port}/mcp`;return async(method,params)=>{const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return {http:r.status,body:await r.json()};};}
test('read-only MCP discovery declares exact schemas, read annotations and no write tools',async t=>{
 const call=await fixture(t);const {body}=await call('tools/list');assert.equal(body.result.tools.length,5);
 for(const tool of body.result.tools){assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);assert.equal(tool.annotations.openWorldHint,false);assert.equal(tool.outputSchema.type,'object');assert.equal(tool.inputSchema.additionalProperties,false);}
 const status=body.result.tools.find(t=>t.name==='distribution_status');assert.deepEqual(status.inputSchema.required,['projectId','planId']);
});
test('MCP success includes structuredContent and text; HTTP API retains existing contract',async t=>{
 const call=await fixture(t);const {http,body}=await call('tools/call',{name:'distribution_inbox',arguments:{projectId:'copilot'}});assert.equal(http,200);assert.equal(body.result.structuredContent.projectId,'copilot');assert.deepEqual(JSON.parse(body.result.content[0].text),body.result.structuredContent);
});
test('missing/wrong/extra tool arguments are JSON-RPC invalid-params errors',async t=>{
 const call=await fixture(t);for(const args of [{projectId:'copilot'},{projectId:'copilot',planId:'wrong'},{projectId:'copilot',planId:'0'.repeat(64),extra:true}]){const {http,body}=await call('tools/call',{name:'distribution_status',arguments:args});assert.equal(http,200);assert.equal(body.error.code,-32602);}
});
test('missing plan, denied project and attempted write return safe tool errors, never success or private data',async t=>{
 const call=await fixture(t);for(const [name,args,code] of [['status',{projectId:'copilot',planId:'0'.repeat(64)},'PLAN_NOT_FOUND'],['inbox',{projectId:'foreign'},'FORBIDDEN'],['approve',{projectId:'copilot',planId:'0'.repeat(64)},'FORBIDDEN']]){const {http,body}=await call('tools/call',{name:'distribution_'+name,arguments:args});assert.equal(http,200);assert.equal(body.result.isError,true);assert.equal(body.result.content[0].text,code);assert.equal(body.result.structuredContent,undefined);}
});
