import {existsSync} from 'node:fs';
const [major,minor]=process.versions.node.split('.').map(Number);
const result={nodeSupported:major>22||major===22&&minor>=13,
 coordinatorConfigured:!!process.env.RADAR_URL,
 workerCredentialConfigured:(process.env.RADAR_TOKEN?.length??0)>=32,
 browserAuthorized:process.env.RADAR_BROWSER_AUTHORIZED==='true',
 playwrightInstalledAtApprovedPath:!!process.env.RADAR_PLAYWRIGHT_MODULE&&existsSync(process.env.RADAR_PLAYWRIGHT_MODULE),
 privateProfileRootConfigured:process.env.RADAR_PROFILE_ROOT?.startsWith('/')??false,
 socialSessionVerified:false,browserLaunched:false,networkRequests:0};
console.log(JSON.stringify(result,null,2));
if(!Object.entries(result).filter(([k])=>!['socialSessionVerified','browserLaunched','networkRequests'].includes(k)).every(([,v])=>v))process.exitCode=2;
