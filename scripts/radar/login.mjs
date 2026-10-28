import {createInterface} from 'node:readline/promises';
import {radarClient} from './client.mjs';
import {ReadBrowser} from './browser.mjs';
// Only after explicit approval; local visible browser login, never credential input here.
if(process.env.RADAR_LOGIN_AUTHORIZED!=='true'||process.env.RADAR_HEADLESS==='true')throw Error('VISIBLE_LOGIN_APPROVAL_REQUIRED');
const call=radarClient(),taskId=process.argv[2];if(!taskId)throw Error('TASK_ID_REQUIRED');
const task=await call('claim',{taskId});let browser,timer,lost=false;
try{
  browser=await ReadBrowser.open(task.account);
  timer=setInterval(()=>{call('heartbeat',{taskId,generation:task.generation}).catch(()=>{lost=true;void browser.close();});},10000);
  await browser.page.goto(task.accountProfile.platform==='threads'?'https://www.threads.com/':'https://www.instagram.com/',{waitUntil:'domcontentloaded'});
  const rl=createInterface({input:process.stdin,output:process.stdout});
  console.log('Sign in manually in the browser. Do not enter credentials in this terminal.');
  await rl.question('Press Enter after login, or Ctrl+C to stop. ');rl.close();
  if(lost)throw Error('LEASE_LOST');await browser.check();console.log('Expected account verified. Session stays in this executor profile.');
}finally{clearInterval(timer);await browser?.close();await call('hold',{taskId,generation:task.generation,reason:'OPERATOR_STOP'}).catch(()=>{});}
