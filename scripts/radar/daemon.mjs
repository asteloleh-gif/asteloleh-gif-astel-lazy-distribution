import {setTimeout as delay} from 'node:timers/promises';
import {radarClient} from './client.mjs';
import {runWorker} from './worker.mjs';
import {ReadBrowser} from './browser.mjs';
if(process.env.RADAR_BROWSER_AUTHORIZED!=='true'||!process.env.RADAR_PLAYWRIGHT_MODULE||!process.env.RADAR_PROFILE_ROOT)throw Error('BROWSER_WORKER_NOT_AUTHORIZED_OR_CONFIGURED');
const call=radarClient();let stopped=false;
process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});
// One task per process; accounts are also locked centrally across all processes.
while(!stopped){
  try{const {tasks}=await call('pending',{});for(const task of tasks){if(stopped)break;
    try{await runWorker({taskId:task.id,call,openBrowser:ReadBrowser.open});}
    catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'WORKER_FAILED');}
  }}catch{console.error('COORDINATOR_UNAVAILABLE_WAITING');}
  if(!stopped)await delay(30000);
}
