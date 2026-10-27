import {bufferMediaScope} from './buffer-media-scope.js';
import {driveMediaProbe} from './drive-media.js';
import {certifiedBindings} from './buffer-bindings.js';
import { YouTubeConnection,FAMILY_CHANNEL_ID,ASAP_TEAM_CHANNEL_ID } from './youtube-connection.js';
import { DistributionHub } from './service.js';
import { AirtableEditorial } from './editorial.js';
import { threadsConfirmer } from './threads-confirm.js';
import { FileStore } from './store.js';
import { OpenPostAdapter } from './openpost.js';
import { OpenPostHttpPort } from './openpost-http.js';
import { BufferAdapter, FileBufferBudget } from './buffer.js';
import type { PublishingAdapter } from './openpost.js';
import type { BufferBinding } from './buffer.js';
import { fail } from './contract.js';
import type { Credential, Route } from './contract.js';
export const SELF_HOSTED_OPENPOST_ORIGIN='https://openpost-production-77ea.up.railway.app';
export function requireSelfHostedOrigin(origin:string){
  let u:URL;try{u=new URL(origin);}catch{return fail('SELF_HOSTED_OPENPOST_REQUIRED',503);}
  if(u.origin!==SELF_HOSTED_OPENPOST_ORIGIN||u.pathname!=='/'||u.search||u.hash||u.username||u.password)return fail('SELF_HOSTED_OPENPOST_REQUIRED',503);
  return u.origin;
}
// All configuration is operator-side; callers cannot supply bindings or credentials.
export function configuredHub(){
  const credentials:Credential[]=JSON.parse(process.env.LD_CALLERS_JSON??'[]');
  const routes:Route[]=JSON.parse(process.env.LD_ROUTES_JSON??'[]');
  const workflow=process.env.LD_ASAPTEAM_WORKFLOW_ENABLED==='true';
  const humanActors=workflow?['oleg']:[];
  if(workflow){
    for(const id of ['oleg','astel-telegram-reader']){
      const c=credentials.find(c=>c.principal.id===id);
      if(!c||!c.principal.projects.includes('copilot')||(id==='oleg'&&(c.principal.role!=='owner'||!c.principal.scopes.includes('approve'))))fail('ASAPTEAM_OWNER_REQUIRED',503);
      c!.principal.projects=[...new Set([...c!.principal.projects,'subteam'])];
    }
    for(const [brandId,accountKey] of [['asapleo.ai','asapleo.ai:instagram'],['wtffounder','wtffounder:instagram']])for(const mode of ['simulation','live'] as const){
      const existing=routes.filter(r=>r.projectId==='subteam'&&r.accountKey===accountKey&&r.mode===mode);
      if(existing.length>1||existing.some(r=>r.brandId!==brandId||r.platform!=='instagram'||r.adapter!=='buffer-subteam'||r.executionOwner!=='provider'))fail('ASAPTEAM_ROUTE_CONFLICT',503);
      if(!existing.length)routes.push({projectId:'subteam',brandId,accountKey,platform:'instagram',adapter:'buffer-subteam',executionOwner:'provider',mode});
    }
  }
  if(process.env.LD_KEVIN_CLOUD_ENABLED==='true'){
    const token=process.env.LD_KEVIN_HUB_TOKEN;
    if(!token||token.length<40||credentials.some(c=>c.token===token||c.principal.id==='kevin-cloud'))fail('KEVIN_CLOUD_CREDENTIAL_REQUIRED',503);
    credentials.push({token:token!,principal:{id:'kevin-cloud',role:'owner',delegatedApproval:true,projects:workflow?['copilot','subteam']:['copilot'],scopes:workflow?['submit','status','review','schedule','cancel','reconcile','pause','editorial']:['submit','status','review','approve','schedule','cancel','reconcile','pause','editorial']}});
  }

  const directory=process.env.LD_STORAGE_DIR,binding=process.env.LD_STORAGE_BINDING;
  const verified=JSON.parse(process.env.LD_OPENPOST_CERTIFICATION_JSON??'null');
  const origin=process.env.LD_OPENPOST_ORIGIN,token=process.env.LD_OPENPOST_TOKEN,workspace=process.env.LD_OPENPOST_WORKSPACE;
  if(origin)requireSelfHostedOrigin(origin);
  const port=verified&&origin&&token&&workspace?new OpenPostHttpPort(origin,token,workspace,JSON.parse(process.env.LD_OPENPOST_ACCOUNTS_JSON??'[]'),JSON.parse(process.env.LD_OPENPOST_MEDIA_JSON??'[]')):undefined;
  const adapters:Record<string,PublishingAdapter>={openpost:new OpenPostAdapter(port,verified)};
  const mediaEnabled=process.env.LD_BUFFER_DRIVE_MEDIA_ENABLED==='true';
  const reels=process.env.LD_BUFFER_REELS_ENABLED==='true';
  if(reels&&!mediaEnabled)fail('BUFFER_REELS_PREFLIGHT_REQUIRED',503);
  const strict=mediaEnabled||process.env.LD_BUFFER_STRICT_BINDINGS==='true';
  const mediaAccountKeys=bufferMediaScope(process.env.LD_BUFFER_MEDIA_ACCOUNT_KEYS_JSON);
  if((mediaEnabled||strict||reels)&&!mediaAccountKeys.length)fail('BUFFER_MEDIA_SCOPE_REQUIRED',503);
  const mediaProbe=mediaEnabled?driveMediaProbe():undefined;
  // Tokens stay server-side; separate identities/budgets for the two existing Buffer accounts.
  for(const platform of ['instagram','threads'] as const){
    const prefix=`LD_BUFFER_${platform.toUpperCase()}`;
    const token=process.env[`${prefix}_TOKEN`],account=process.env[`${prefix}_ACCOUNT_ID`];
    let bindings:BufferBinding[]=JSON.parse(process.env[`${prefix}_BINDINGS_JSON`]??'[]');
    if(bindings.some(b=>b.platform!==platform))fail('BUFFER_CROSS_ACCOUNT_BINDING',503);
    if(strict&&token&&account&&bindings.some(b=>mediaAccountKeys.includes(b.accountKey)))bindings=certifiedBindings(platform,account,bindings,routes);
    if(directory&&token&&account)adapters[`buffer-${platform}`]=new BufferAdapter(`buffer-${platform}`,token,account,bindings,
      new FileBufferBudget(directory),process.env.LD_BUFFER_ENABLE_WRITES==='true',fetch,
      platform==='threads'?threadsConfirmer(JSON.parse(process.env.LD_THREADS_READ_BINDINGS_JSON??'[]')):undefined,
      JSON.parse(process.env.LD_BUFFER_RELEASE_DIGESTS_JSON??'[]'),workflow?humanActors:process.env.LD_KEVIN_CLOUD_ENABLED==='true'?['kevin-cloud']:[],{reels,probe:mediaProbe,verifyIdentity:strict,accountKeys:mediaAccountKeys});
  }
  // Subteam stays read/validation-only unless its own explicit write release is enabled.
  // The global production write switch never enables this account.
  const subteamToken=process.env.LD_BUFFER_ASAPTEAM_TOKEN;
  const subteamAccount=process.env.LD_BUFFER_ASAPTEAM_ACCOUNT_ID;
  let subteamBindings:BufferBinding[]=JSON.parse(process.env.LD_BUFFER_ASAPTEAM_BINDINGS_JSON??'[]');
  const subteamWrites=process.env.LD_BUFFER_ASAPTEAM_ENABLE_WRITES==='true';
  if(subteamWrites&&(!subteamToken||!subteamAccount||!directory||!strict||!mediaEnabled||!subteamBindings.length||subteamBindings.some(b=>!mediaAccountKeys.includes(b.accountKey))))fail('BUFFER_ASAPTEAM_PREFLIGHT_REQUIRED',503);
  if(subteamToken&&subteamAccount&&directory){
    if((strict&&subteamBindings.some(b=>mediaAccountKeys.includes(b.accountKey)))||subteamWrites)subteamBindings=certifiedBindings('asapteam',subteamAccount,subteamBindings,routes);
    const existing=['INSTAGRAM','THREADS'].flatMap(p=>JSON.parse(process.env[`LD_BUFFER_${p}_BINDINGS_JSON`]??'[]') as BufferBinding[]);
    if(['INSTAGRAM','THREADS'].some(p=>process.env[`LD_BUFFER_${p}_ACCOUNT_ID`]===subteamAccount)||
      subteamBindings.some(b=>!['threads','instagram'].includes(b.platform)||!b.accountKey||!b.channelId||existing.some(e=>e.accountKey===b.accountKey||e.channelId===b.channelId))||
      new Set(subteamBindings.map(b=>b.channelId)).size!==subteamBindings.length||
      new Set(subteamBindings.map(b=>b.accountKey)).size!==subteamBindings.length||
      routes.some(r=>r.adapter==='buffer-subteam'&&r.projectId!=='subteam'))fail('BUFFER_SUBTEAM_ISOLATION_REQUIRED',503);
    adapters['buffer-subteam']=new BufferAdapter('buffer-subteam',subteamToken,subteamAccount,subteamBindings,new FileBufferBudget(directory),subteamWrites,fetch,undefined,JSON.parse(process.env.LD_BUFFER_ASAPTEAM_RELEASE_DIGESTS_JSON??'[]'),humanActors,{reels,probe:mediaProbe,verifyIdentity:strict,accountKeys:mediaAccountKeys});
  }
  const mediaHosts:string[]=JSON.parse(process.env.LD_MEDIA_HOSTS_JSON??'[]');
  if(workflow)mediaHosts.push(...['drive.google.com','drive.usercontent.google.com'].filter(h=>!mediaHosts.includes(h)));
  const hub=directory&&binding?new DistributionHub(new FileStore(directory,binding),routes,mediaHosts,adapters):undefined;
  if(process.env.LD_YOUTUBE_FAMILY_ENABLED==='true'){
    let saved;try{saved=JSON.parse(process.env.LD_YOUTUBE_FAMILY_CONNECTION_JSON??'null');}catch{return fail('YOUTUBE_CONNECTION_REQUIRED',503);}
    if(!hub||saved?.version!==1||saved.credentials?.channelId!==FAMILY_CHANNEL_ID)return fail('YOUTUBE_FAMILY_BINDING_REQUIRED',503);
    hub.youtube=new YouTubeConnection(saved.credentials);
  }
  if(process.env.LD_YOUTUBE_ASAP_TEAM_ENABLED==='true'){
    let saved;try{saved=JSON.parse(process.env.LD_YOUTUBE_ASAP_TEAM_CONNECTION_JSON??'null');}catch{return fail('YOUTUBE_CONNECTION_REQUIRED',503);}
    if(!hub||saved?.version!==1||saved.credentials?.channelId!==ASAP_TEAM_CHANNEL_ID)return fail('YOUTUBE_ASAP_TEAM_BINDING_REQUIRED',503);
    hub.youtubeAccounts['asap-team']=new YouTubeConnection(saved.credentials);
  }
  if(hub&&process.env.LD_EDITORIAL_ENABLED==='true')hub.editorial=new AirtableEditorial(JSON.parse(process.env.LD_EDITORIAL_BINDINGS_JSON??'[]'));
  return {hub,credentials};
}
