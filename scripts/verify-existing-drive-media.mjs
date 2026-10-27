// Reads one existing Buffer post and HEAD-checks its source. No mutation/download/storage of video.
import {readFile,writeFile,stat} from 'node:fs/promises';import {homedir} from 'node:os';import {join} from 'node:path';
import {driveMediaProbe} from '../dist/hub/drive-media.js';
const id=process.argv[2];if(!/^[a-f0-9]{24}$/.test(id??''))throw Error('EXISTING_PROVIDER_ID_REQUIRED');
const file=join(homedir(),'.config/astel-distribution/buffer-subteam.key');if((await stat(file)).mode&0o077)throw Error('OWNER_ONLY_KEY_REQUIRED');const token=(await readFile(file,'utf8')).trim();
const r=await fetch('https://api.buffer.com',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query:'query($input:PostInput!){post(input:$input){id channelId status assets{type mimeType source}}}',variables:{input:{id}}}),redirect:'error',signal:AbortSignal.timeout(15000)});
const data=await r.json();if(!r.ok||data.errors||data.data?.post?.id!==id)throw Error('EXISTING_POST_READ_FAILED');const post=data.data.post,asset=post.assets?.[0];if(!asset||asset.type!=='video')throw Error('VIDEO_REQUIRED');
const at=Date.now(),calls=[];const probe=driveMediaProbe(async(u,o)=>{const response=await fetch(u,o);calls.push({host:new URL(u).hostname,method:o.method,http:response.status,mime:response.headers.get('content-type'),bytes:response.headers.get('content-length')});return response;},()=>at);
// A one-minute probe window is ONLY for checking headers now, never a producer expiry attestation.
await probe({url:asset.source,kind:'reel',digest:'sha256:'+'0'.repeat(64),revision:'header-probe-only',availableUntil:new Date(at+60000).toISOString()},new Date(at).toISOString());
const result={at:new Date(at).toISOString(),providerId:id,channelId:post.channelId,status:post.status,headerProbe:'PASS',probeLocation:'Mac, not deployed runtime',futureAvailability:'NOT_ATTESTED',contentDigest:'NOT_CHECKED_HEAD_ONLY',mediaBytesDownloaded:0,mutations:0,calls};if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(result,null,2));console.log(JSON.stringify(result));
