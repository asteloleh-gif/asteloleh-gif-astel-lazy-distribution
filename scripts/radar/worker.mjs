import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {radarClient} from './client.mjs';
import {ReadBrowser} from './browser.mjs';
import { CAROUSEL_ACCOUNT, collectFeedUrls, isCarouselQuery } from './feed-carousel.mjs';

export async function runWorker({call,openBrowser,taskId,candidateUrls}){
  const task=await call('claim',{taskId});const generation=task.generation;
  let browser,stopped=false,timer,pending=Promise.resolve();
  const guard=async()=>{if(stopped)throw Error('LEASE_LOST');try{const t=await call('heartbeat',{taskId,generation});if(t.worker!==task.worker||t.generation!==generation||t.state!=='RUNNING')throw Error('LEASE_LOST');return t;}catch{stopped=true;await browser?.close().catch(()=>{});throw Error('LEASE_LOST');}};
  try{
    const carousel = isCarouselQuery(task.query);
    if (carousel && task.account !== CAROUSEL_ACCOUNT) throw Error('CAROUSEL_ACCOUNT_DENIED');
    if (carousel && candidateUrls !== undefined) throw Error('CAROUSEL_URL_OVERRIDE_DENIED');
    browser=await openBrowser(task.account);
    timer=setInterval(()=>{pending=pending.then(()=>guard()).catch(()=>{});},10000);timer.unref?.();
    await browser.home(guard);
    const visited=new Set(task.checkpoint.visited??[]);
    const urls = carousel
      ? await collectFeedUrls(browser, guard, visited)
      : candidateUrls ?? await browser.search(task.query, guard);
    for(const url of urls.slice(0,10)){
      if(visited.has(url))continue;await guard();
      const evidence=await browser.read(url,guard);await guard();
      await call('record',{taskId,generation,evidence});visited.add(evidence.url);
      await call('checkpoint',{taskId,generation,checkpoint:{stage:'reading',visited:[...visited]}});
    }
    clearInterval(timer);await pending;await browser.close();browser=null;
    await guard();return await call('complete',{taskId,generation});
  }catch(e){
    clearInterval(timer);await pending;await browser?.close().catch(()=>{});browser=null;
    if(!stopped){const reason=['CHALLENGE','LOGIN_REQUIRED','IDENTITY_MISMATCH','IDENTITY_UNAVAILABLE'].includes(e.message)?e.message:'READ_FAILED';await call('hold',{taskId,generation,reason}).catch(()=>{});}
    throw Error(/^[A-Z_]+$/.test(e.message)?e.message:'READ_FAILED');
  }finally{clearInterval(timer);await browser?.close().catch(()=>{});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const taskId=process.argv[2];if(!taskId)throw Error('TASK_ID_REQUIRED');console.log(JSON.stringify(await runWorker({taskId,call:radarClient(),openBrowser:ReadBrowser.open,candidateUrls:process.argv[3]?[process.argv[3]]:undefined}),null,2));}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'WORKER_FAILED');process.exitCode=1;}
}
