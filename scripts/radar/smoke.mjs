// Passive browser smoke test. No coordinator, saved account profile, or social site.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
if(process.env.RADAR_BROWSER_AUTHORIZED!=='true')throw Error('BROWSER_ACCESS_NOT_AUTHORIZED');
const modulePath=process.env.RADAR_PLAYWRIGHT_MODULE;
if(!modulePath?.startsWith('/'))throw Error('APPROVED_PLAYWRIGHT_MODULE_REQUIRED');
const channel=process.env.RADAR_BROWSER_CHANNEL??'chrome';
if(!['chrome','chromium'].includes(channel))throw Error('APPROVED_BROWSER_REQUIRED');
const dir=await mkdtemp(join(tmpdir(),'radar-smoke-'));let context;
try{
 const {chromium}=await import(modulePath);
 context=await chromium.launchPersistentContext(dir,{channel,headless:false,chromiumSandbox:true,acceptDownloads:false});
 const page=context.pages()[0]??await context.newPage();
 await page.setContent('<title>Radar local smoke</title><p>Local browser check</p>');
 if(await page.title()!=='Radar local smoke')throw Error('SMOKE_FAILED');
 await context.close();context=null;
 console.log(JSON.stringify({browser:'PASS',coordinatorCalls:0,socialRequests:0,accountProfilesUsed:0}));
}catch{console.error('BROWSER_SMOKE_FAILED');process.exitCode=1;}
finally{await context?.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
