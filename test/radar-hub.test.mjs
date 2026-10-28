import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../dist/server.js';
test('Radar route is disabled by default and does not change Hub health',async t=>{
 const server=createAppServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 const r=await fetch(base+'/api/radar/capabilities',{method:'POST',body:'{}'});assert.equal(r.status,503);assert.equal((await r.json()).error,'RADAR_DISABLED');
 assert.equal((await (await fetch(base+'/health')).json()).ok,true);
});
test('Radar injected route receives only its own requests',async t=>{
 let calls=0;const server=createAppServer({radar:async(req,res)=>{calls++;res.writeHead(200,{'content-type':'application/json'});res.end('{}');}});await new Promise(ok=>server.listen(0,'127.0.0.1',ok));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 await fetch(base+'/api/radar/list',{method:'POST',body:'{}'});await fetch(base+'/health');assert.equal(calls,1);
});
