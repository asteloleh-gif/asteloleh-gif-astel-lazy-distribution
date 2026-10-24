import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve} from 'node:path';
export function tunnelConfig(command,tunnelId){
 if(!/^tunnel_[a-f0-9]{32}$/.test(tunnelId))throw Error('TUNNEL_ID_REQUIRED');
 return `config_version: 1\ncontrol_plane:\n  base_url: "https://api.openai.com"\n  tunnel_id: ${JSON.stringify(tunnelId)}\n  api_key: "env:LD_KEVIN_TUNNEL_RUNTIME_KEY"\nhealth:\n  listen_addr: "127.0.0.1:8091"\nadmin_ui:\n  open_browser: false\nlog:\n  level: error\n  format: json\nmcp:\n  commands:\n    - channel: main\n      command: ${JSON.stringify(command)}\n`;
}
async function run(){
 // Preserve the existing ordered provisioning and canary before opening Hub.
 for(const file of ['dist/hub/provision.js','dist/hub/connector-canary.js'])await new Promise((ok,bad)=>{const child=spawn(process.execPath,[file],{stdio:'inherit'});child.on('error',bad);child.on('exit',code=>code===0?ok():bad(Error('PREFLIGHT_FAILED')));});
 const hubEnv={...process.env};delete hubEnv.LD_KEVIN_TUNNEL_RUNTIME_KEY;
 const hub=spawn(process.execPath,['dist/index.js'],{stdio:'inherit',env:hubEnv});let tunnel,stopping=false,restarts=0;
 function stop(signal='SIGTERM'){stopping=true;tunnel?.kill(signal);hub.kill(signal);}
 process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop('SIGINT'));
 hub.on('error',()=>{stop();process.exitCode=1;});hub.on('exit',code=>{stop();process.exitCode=code??1;});
 if(process.env.LD_KEVIN_CLOUD_ENABLED!=='true')return;
 if(!process.env.LD_KEVIN_TUNNEL_RUNTIME_KEY){stop();throw Error('TUNNEL_KEY_REQUIRED');}
 await mkdir('/tmp/astel-kevin',{recursive:true,mode:0o700});
 const config='/tmp/astel-kevin/tunnel.yaml';await writeFile(config,tunnelConfig(`${process.execPath} ${resolve('scripts/kevin-cloud-bridge.mjs')}`,process.env.LD_KEVIN_TUNNEL_ID),{mode:0o600});
 for(let i=0;i<60;i++){if(stopping)return;try{const r=await fetch(`http://127.0.0.1:${Number(process.env.PORT||8080)}/health`,{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}await delay(500);if(i===59)throw Error('HUB_NOT_READY');}
 function startTunnel(){if(stopping)return;tunnel=spawn('/usr/local/bin/tunnel-client',['run','--config',config],{stdio:'ignore',env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:process.env.PORT||'8080',LD_KEVIN_CLOUD_ENABLED:'true',LD_YOUTUBE_FAMILY_ENABLED:process.env.LD_YOUTUBE_FAMILY_ENABLED==='true'?'true':'false',LD_KEVIN_HUB_TOKEN:process.env.LD_KEVIN_HUB_TOKEN,LD_KEVIN_TUNNEL_RUNTIME_KEY:process.env.LD_KEVIN_TUNNEL_RUNTIME_KEY}});tunnel.on('error',()=>{console.error('Kevin tunnel could not start; Hub remains running.');});tunnel.on('exit',()=>{if(!stopping&&restarts++<5){console.error('Kevin tunnel stopped; bounded restart pending.');setTimeout(startTunnel,5000);}else if(!stopping)console.error('Kevin tunnel unavailable; Hub remains running.');});}
 startTunnel();
 let announced=false;const probe=setInterval(async()=>{if(stopping){clearInterval(probe);return;}try{const r=await fetch('http://127.0.0.1:8091/readyz',{signal:AbortSignal.timeout(2000)});if(r.ok&&!announced){console.log('Kevin cloud tunnel ready; transport is independent of Mac.');announced=true;}}catch{}},10000);probe.unref();
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname))run().catch(()=>{console.error('Cloud connector startup blocked; inspect configuration.');process.exitCode=1;});
