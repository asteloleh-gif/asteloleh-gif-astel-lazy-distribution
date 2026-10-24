// One-time owner OAuth. Run only after explicit approval of this client and scopes.
// Client JSON is downloaded from the owner's Google Cloud project into owner-only storage.
// Never prints tokens, client secret, Google response bodies, or authorization code.
import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import {YouTubeConnection,FAMILY_CHANNEL_ID,YOUTUBE_READ_SCOPES} from '../dist/hub/youtube-connection.js';
export function oauthRequest(clientId,redirectUri,state,verifier){
 const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:YOUTUBE_READ_SCOPES.join(' '),access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))u.searchParams.set(k,v);
 return u;
}
export function validCallback(url,state){const values=url.searchParams.getAll('state'),a=Buffer.from(values[0]??''),b=Buffer.from(state);return url.pathname==='/oauth/callback'&&values.length===1&&a.length===b.length&&timingSafeEqual(a,b)&&url.searchParams.getAll('code').length===1&&!url.searchParams.has('error');}
export async function connect(clientFile,outputFile,linkFile){
 for(const p of [outputFile,linkFile]){await mkdir(dirname(p),{recursive:true,mode:0o700});const s=await stat(dirname(p));if((s.mode&0o077)!==0)throw Error('OWNER_ONLY_DESTINATION_REQUIRED');}
 const s=await stat(clientFile);if((s.mode&0o077)!==0)throw Error('OWNER_ONLY_CLIENT_FILE_REQUIRED');
 const raw=JSON.parse(await readFile(clientFile,'utf8')),client=raw.installed;
 if(!client?.client_id||!client?.client_secret)throw Error('GOOGLE_DESKTOP_CLIENT_REQUIRED');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 const server=createServer();let settled=false;let timeout;let rejectPending;
 const result=new Promise((resolveResult,rejectResult)=>{
  rejectPending=rejectResult;
  server.on('request',async(req,res)=>{
   if(req.method!=='GET'||!req.url||req.url.length>8192){res.writeHead(400).end();return;}
   const url=new URL(req.url,'http://127.0.0.1');
   if(settled||!validCallback(url,state)){res.writeHead(400,{'Cache-Control':'no-store'}).end('Invalid authorization response.');return;}
   settled=true;clearTimeout(timeout);
   try{
    const redirectUri=`http://127.0.0.1:${server.address().port}/oauth/callback`;
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,code:url.searchParams.get('code'),code_verifier:verifier,redirect_uri:redirectUri,grant_type:'authorization_code'}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('OAUTH_EXCHANGE_FAILED');const tokens=await r.json();
    if(!tokens.refresh_token||!YOUTUBE_READ_SCOPES.every(s=>(tokens.scope??'').split(' ').includes(s)))throw Error('OFFLINE_READ_SCOPES_REQUIRED');
    const credentials={clientId:client.client_id,clientSecret:client.client_secret,refreshToken:tokens.refresh_token,channelId:FAMILY_CHANNEL_ID};
    const account=await new YouTubeConnection(credentials).account();
    const temporary=outputFile+'.'+randomBytes(8).toString('hex')+'.tmp';
    await writeFile(temporary,JSON.stringify({version:1,credentials,scopes:YOUTUBE_READ_SCOPES,connectedAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});await rename(temporary,outputFile);
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).end('Astel Family connected for read-only verification. You may close this window.');resolveResult({channelId:account.channelId,title:account.title});
   }catch{res.writeHead(400,{'Cache-Control':'no-store'}).end('Connection not saved. Check the selected channel and granted permissions.');rejectResult(Error('YOUTUBE_CONNECTION_NOT_SAVED'));}
   finally{server.close();}
  });
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 await writeFile(linkFile,oauthRequest(client.client_id,`http://127.0.0.1:${server.address().port}/oauth/callback`,state,verifier).href,{mode:0o600});
 timeout=setTimeout(()=>{settled=true;server.close();rejectPending(Error('OAUTH_EXPIRED'));},600000);
 server.once('close',()=>{if(!settled)settled=true;});
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==5){console.error('Usage: connect-youtube.mjs OWNER_ONLY_CLIENT_JSON OWNER_ONLY_CONNECTION_JSON OWNER_ONLY_AUTH_LINK');process.exitCode=1;}
 else try{console.log(JSON.stringify(await connect(...process.argv.slice(2))));}catch{console.error('YouTube connection blocked. No secrets printed.');process.exitCode=1;}
}
