import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredHub} from '../dist/hub/runtime.js';
const base={LD_STORAGE_DIR:'/tmp/subteam-fixture-unused',LD_STORAGE_BINDING:'fixture',LD_BUFFER_ASAPTEAM_TOKEN:'fixture',LD_BUFFER_ASAPTEAM_ACCOUNT_ID:'subteam-account',LD_BUFFER_ASAPTEAM_BINDINGS_JSON:JSON.stringify([{accountKey:'subteam:threads',platform:'threads',channelId:'subteam-channel'}]),LD_BUFFER_ENABLE_WRITES:'true'};
function configure(extra={}){process.env={...base,...extra};return configuredHub();}
test('Subteam remains disabled even when production writes are enabled',()=>{
 const {hub}=configure();assert.deepEqual(hub.adapters['buffer-subteam'].capabilities(),{executionOwner:'provider',schedule:false,cancel:false,live:false});
});
test('Subteam rejects production account, channel, key and project collisions',()=>{
 for(const extra of [
  {LD_BUFFER_THREADS_ACCOUNT_ID:'subteam-account'},
  {LD_BUFFER_THREADS_BINDINGS_JSON:JSON.stringify([{accountKey:'production',platform:'threads',channelId:'subteam-channel'}])},
  {LD_BUFFER_INSTAGRAM_BINDINGS_JSON:JSON.stringify([{accountKey:'subteam:threads',platform:'instagram',channelId:'other'}])},
  {LD_ROUTES_JSON:JSON.stringify([{adapter:'buffer-subteam',projectId:'copilot'}])}
 ])assert.throws(()=>configure(extra),e=>e.code==='BUFFER_SUBTEAM_ISOLATION_REQUIRED');
});
test('Saved token alone does not activate a Subteam adapter',()=>{
 const {hub}=configure({LD_BUFFER_ASAPTEAM_ACCOUNT_ID:''});assert.equal(hub.adapters['buffer-subteam'],undefined);
});
