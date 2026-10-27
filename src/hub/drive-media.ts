import {fail} from './contract.js';
import type {Asset} from './contract.js';
// No cookies, tokens, media body, filesystem or arbitrary-origin redirects.
const hosts=new Set(['drive.google.com','drive.usercontent.google.com']);
function checked(raw:string){
 let u:URL;try{u=new URL(raw);}catch{return fail('DRIVE_MEDIA_URL_DENIED',400);}
 if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!hosts.has(u.hostname))return fail('DRIVE_MEDIA_URL_DENIED',400);
 const path=u.hostname==='drive.google.com'?'/uc':'/download';
 if(u.pathname!==path||u.searchParams.get('export')!=='download'||!/^[-\w]{10,200}$/.test(u.searchParams.get('id')??'')||
    [...u.searchParams.keys()].some(k=>!['id','export','confirm','uuid'].includes(k)))return fail('DRIVE_MEDIA_DIRECT_URL_REQUIRED',400);
 return u;
}
export type MediaProbe=(asset:Asset,scheduledAt:string)=>Promise<void>;
export function driveMediaProbe(fetcher:typeof fetch=fetch,now=()=>Date.now()):MediaProbe{
 return async(asset,scheduledAt)=>{
  if(!Number.isFinite(Date.parse(scheduledAt))||!Number.isFinite(Date.parse(asset.availableUntil))||Date.parse(asset.availableUntil)<=Math.max(now(),Date.parse(scheduledAt)))return fail('DRIVE_MEDIA_EXPIRY_REQUIRED',400);
  let u=checked(asset.url);const seen=new Set<string>();
  for(let i=0;i<4;i++){
   if(seen.has(u.href))return fail('DRIVE_MEDIA_REDIRECT_LOOP',502);seen.add(u.href);
   let r:Response;try{r=await fetcher(u.href,{method:'HEAD',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});}catch{return fail('DRIVE_MEDIA_UNAVAILABLE',502);}
   if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');if(!location)return fail('DRIVE_MEDIA_UNAVAILABLE',502);let next:URL;try{next=new URL(location,u);}catch{return fail('DRIVE_MEDIA_URL_DENIED',400);}
    u=checked(next.href);continue;}
   if(!r.ok)return fail('DRIVE_MEDIA_UNAVAILABLE',502);
   const mime=(r.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
   if(!(asset.kind==='reel'?mime==='video/mp4':['image/jpeg','image/png'].includes(mime)))return fail('DRIVE_MEDIA_TYPE_MISMATCH',400);
   const raw=r.headers.get('content-length')??'';const size=Number(raw),max=asset.kind==='reel'?512*1024*1024:16*1024*1024;
   // Operational resource caps, not a substitute for platform format requirements.
   if(!/^\d+$/.test(raw)||!Number.isSafeInteger(size)||size<1||size>max)return fail('DRIVE_MEDIA_SIZE_DENIED',400);
   return;
  }
  return fail('DRIVE_MEDIA_REDIRECT_LIMIT',502);
 };
}
