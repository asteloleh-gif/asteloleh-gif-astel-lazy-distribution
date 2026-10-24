import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createKevinReadBridge,openHubReader} from '../scripts/kevin-read-bridge.mjs';
const names=['capabilities','inbox','status','events','metrics'];
test('official SDK discovers exactly five read tools and blocks writes/projects before upstream',async t=>{
 const calls=[];const server=createKevinReadBridge(async(action,args)=>{calls.push({action,args});return {projectId:'copilot',items:[]};});
 const client=new Client({name:'fixture',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.deepEqual(tools.map(t=>t.name),names.map(n=>'distribution_'+n));assert.ok(tools.every(t=>t.annotations.readOnlyHint));
 const result=await client.callTool({name:'distribution_inbox',arguments:{projectId:'copilot'}});assert.equal(result.structuredContent.projectId,'copilot');
 for(const [name,args] of [['distribution_approve',{projectId:'copilot'}],['distribution_inbox',{projectId:'subteam'}],['distribution_status',{projectId:'copilot'}],['distribution_inbox',{projectId:'copilot',url:'https://other.invalid'}]])assert.equal((await client.callTool({name,arguments:args})).isError,true);
 assert.equal(calls.length,1);
});
test('bridge hides upstream failures and never returns an error as successful data',async t=>{
 const server=createKevinReadBridge(async()=>{throw Error('fixture-secret');});const client=new Client({name:'fixture',version:'1'},{capabilities:{}});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(()=>client.close());
 const result=await client.callTool({name:'distribution_inbox',arguments:{projectId:'copilot'}});assert.equal(result.isError,true);assert.ok(!JSON.stringify(result).includes('fixture-secret'));
});
test('reader refuses a broad upstream identity and unsafe key permissions',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'kevin-reader-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'credential.json');await writeFile(path,JSON.stringify({projectId:'copilot',token:'fixture-'.repeat(8)}),{mode:0o600});
 const responses=[{},{tools:[...names.map(n=>({name:'distribution_'+n})),{name:'distribution_approve'}]}];let calls=0;
 await assert.rejects(()=>openHubReader(path,async(url,options)=>{assert.equal(url,'https://lazy-distribution-production.up.railway.app/mcp');assert.equal(options.redirect,'error');return new Response(JSON.stringify({result:responses[calls++]}));}),/UPSTREAM_READ_ONLY_IDENTITY_REQUIRED/);
 await chmod(path,0o644);await assert.rejects(()=>openHubReader(path,async()=>{throw Error('no network');}),/OWNER_ONLY_CREDENTIAL_FILE_REQUIRED/);
});
