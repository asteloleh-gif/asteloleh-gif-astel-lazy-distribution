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
  if(process.env.LD_KEVIN_CLOUD_ENABLED==='true'){
    const token=process.env.LD_KEVIN_HUB_TOKEN;
    if(!token||token.length<40||credentials.some(c=>c.token===token||c.principal.id==='kevin-cloud'))fail('KEVIN_CLOUD_CREDENTIAL_REQUIRED',503);
    credentials.push({token:token!,principal:{id:'kevin-cloud',role:'owner',delegatedApproval:true,projects:['copilot'],scopes:['submit','status','review','approve','schedule','cancel','reconcile','pause','editorial']}});
  }

  const directory=process.env.LD_STORAGE_DIR,binding=process.env.LD_STORAGE_BINDING;
  const verified=JSON.parse(process.env.LD_OPENPOST_CERTIFICATION_JSON??'null');
  const origin=process.env.LD_OPENPOST_ORIGIN,token=process.env.LD_OPENPOST_TOKEN,workspace=process.env.LD_OPENPOST_WORKSPACE;
  if(origin)requireSelfHostedOrigin(origin);
  const port=verified&&origin&&token&&workspace?new OpenPostHttpPort(origin,token,workspace,JSON.parse(process.env.LD_OPENPOST_ACCOUNTS_JSON??'[]'),JSON.parse(process.env.LD_OPENPOST_MEDIA_JSON??'[]')):undefined;
  const adapters:Record<string,PublishingAdapter>={openpost:new OpenPostAdapter(port,verified)};
  // Tokens stay server-side; separate identities/budgets for the two existing Buffer accounts.
  for(const platform of ['instagram','threads'] as const){
    const prefix=`LD_BUFFER_${platform.toUpperCase()}`;
    const token=process.env[`${prefix}_TOKEN`],account=process.env[`${prefix}_ACCOUNT_ID`];
    const bindings:BufferBinding[]=JSON.parse(process.env[`${prefix}_BINDINGS_JSON`]??'[]');
    if(bindings.some(b=>b.platform!==platform))fail('BUFFER_CROSS_ACCOUNT_BINDING',503);
    if(directory&&token&&account)adapters[`buffer-${platform}`]=new BufferAdapter(`buffer-${platform}`,token,account,bindings,
      new FileBufferBudget(directory),process.env.LD_BUFFER_ENABLE_WRITES==='true',fetch,
      platform==='threads'?threadsConfirmer(JSON.parse(process.env.LD_THREADS_READ_BINDINGS_JSON??'[]')):undefined,
      JSON.parse(process.env.LD_BUFFER_RELEASE_DIGESTS_JSON??'[]'),process.env.LD_KEVIN_CLOUD_ENABLED==='true'?['kevin-cloud']:[]);
  }
  // Subteam is a separate read/validation-only connector until its own release.
  // The global production write switch never enables this account.
  const subteamToken=process.env.LD_BUFFER_ASAPTEAM_TOKEN;
  const subteamAccount=process.env.LD_BUFFER_ASAPTEAM_ACCOUNT_ID;
  const subteamBindings:BufferBinding[]=JSON.parse(process.env.LD_BUFFER_ASAPTEAM_BINDINGS_JSON??'[]');
  if(subteamToken&&subteamAccount&&directory){
    const existing=['INSTAGRAM','THREADS'].flatMap(p=>JSON.parse(process.env[`LD_BUFFER_${p}_BINDINGS_JSON`]??'[]') as BufferBinding[]);
    if(['INSTAGRAM','THREADS'].some(p=>process.env[`LD_BUFFER_${p}_ACCOUNT_ID`]===subteamAccount)||
      subteamBindings.some(b=>!['threads','instagram'].includes(b.platform)||!b.accountKey||!b.channelId||existing.some(e=>e.accountKey===b.accountKey||e.channelId===b.channelId))||
      new Set(subteamBindings.map(b=>b.channelId)).size!==subteamBindings.length||
      new Set(subteamBindings.map(b=>b.accountKey)).size!==subteamBindings.length||
      routes.some(r=>r.adapter==='buffer-subteam'&&r.projectId!=='subteam'))fail('BUFFER_SUBTEAM_ISOLATION_REQUIRED',503);
    adapters['buffer-subteam']=new BufferAdapter('buffer-subteam',subteamToken,subteamAccount,subteamBindings,new FileBufferBudget(directory),false);
  }
  const hub=directory&&binding?new DistributionHub(new FileStore(directory,binding),routes,JSON.parse(process.env.LD_MEDIA_HOSTS_JSON??'[]'),adapters):undefined;
  if(hub&&process.env.LD_EDITORIAL_ENABLED==='true')hub.editorial=new AirtableEditorial(JSON.parse(process.env.LD_EDITORIAL_BINDINGS_JSON??'[]'));
  return {hub,credentials};
}
