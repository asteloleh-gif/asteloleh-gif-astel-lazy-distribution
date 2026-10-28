// Fixed manual-login lifecycle; no credentials or social writes are accepted here.
export async function runManualLogin({call,openBrowser,taskId,waitForOperator,signal}){
  const task=await call('claimsetup',{taskId});
  const generation=task.generation;
  let browser,timer,lost=false,pending=Promise.resolve();
  const guard=async()=>{
    if(lost||signal?.aborted)throw Error('OPERATOR_STOP');
    try{const t=await call('heartbeat',{taskId,generation});
      if(t.state!=='RUNNING'||t.worker!==task.worker||t.generation!==generation)throw Error('LEASE_LOST');
    }catch{lost=true;await browser?.close().catch(()=>{});throw Error('LEASE_LOST');}
  };
  try{
    browser=await openBrowser(task.account);
    timer=setInterval(()=>{pending=pending.then(guard).catch(()=>{});},10000);
    await guard();
    await browser.page.goto(task.accountProfile.platform==='threads'?'https://www.threads.com/':'https://www.instagram.com/',{waitUntil:'domcontentloaded'});
    await waitForOperator(signal);
    await guard();const activeAccount=await browser.check();
    clearInterval(timer);await pending;await guard();
    // Only successful close releases the account lock. Ambiguous outcomes stay held.
    await browser.close();browser=null;
    await guard();
    return await call('setupcomplete',{taskId,generation,activeAccount,browserClosed:true});
  }catch(e){
    clearInterval(timer);await pending;await browser?.close().catch(()=>{});browser=null;
    const reason=['CHALLENGE','LOGIN_REQUIRED','IDENTITY_MISMATCH','IDENTITY_UNAVAILABLE'].includes(e.message)?e.message:'OPERATOR_STOP';
    await call('hold',{taskId,generation,reason}).catch(()=>{});
    throw Error(/^[A-Z_]+$/.test(e.message)?e.message:'OPERATOR_STOP');
  }finally{clearInterval(timer);}
}
