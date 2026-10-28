import {createInterface} from 'node:readline/promises';
import {radarClient} from './client.mjs';
import {ReadBrowser} from './browser.mjs';
import {runManualLogin} from './login-session.mjs';
// Only after explicit approval; local visible browser login, never credential input here.
if(process.env.RADAR_LOGIN_AUTHORIZED!=='true'||process.env.RADAR_HEADLESS==='true')throw Error('VISIBLE_LOGIN_APPROVAL_REQUIRED');
const taskId=process.argv[2];if(!taskId)throw Error('TASK_ID_REQUIRED');
const abort=new AbortController();
const stop=()=>abort.abort();process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
  const result=await runManualLogin({call:radarClient(),taskId,openBrowser:ReadBrowser.open,signal:abort.signal,
    waitForOperator:async signal=>{
      const rl=createInterface({input:process.stdin,output:process.stdout});rl.on('SIGINT',stop);
      try{console.log('Sign in manually in the browser. Never enter credentials in this terminal.');await rl.question('Press Enter after login, or Ctrl+C to stop. ',{signal});}
      finally{rl.close();}
    }});
  console.log(JSON.stringify({taskId:result.id,state:result.state,account:result.account}));
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'LOGIN_FAILED');process.exitCode=1;}
finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
