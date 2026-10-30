import {instagramVariant,assetIndices} from './instagram-format.js';
import type {InstagramOptions} from './instagram-format.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
export class HubError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const fail = (code: string, status = 409): never => { throw new HubError(status, code); };
export type Scope = 'submit'|'status'|'review'|'approve'|'schedule'|'cancel'|'reconcile'|'pause'|'editorial';
export const actionScopes:Record<string,Scope>={youtubeaccount:'status',youtubevideos:'status',youtubeanalytics:'status',importeditorial:'editorial',capabilities:'status',inbox:'status',submit:'submit',preview:'submit',review:'review',approve:'approve',schedule:'schedule',status:'status',cancel:'cancel',reconcile:'reconcile',pause:'pause',resume:'pause',events:'status',metrics:'status'};
export type Principal = { approvalProjects?: string[]; delegatedApproval?: boolean; id: string; role: 'producer'|'owner'; scopes: Scope[]; projects: string[] };
export type Credential = { token: string; principal: Principal };
export type Route = { projectId: string; brandId: string; platform: 'threads'|'instagram'; accountKey: string;
  adapter: string; executionOwner: 'provider'; mode: 'simulation'|'live' };
export type Asset = { url: string; kind: 'image'|'reel'|'video'; altText?:string; thumbnailOffset?:number; userTags?:{handle:string;x:number;y:number}[]; digest: string; revision: string; availableUntil: string };
export type Target = { platform: 'threads'|'instagram'; accountKey: string; variant: string; scheduledAt: string; timezone: string };
export type Variant={text:string;asset?:number;assetIndices?:number[];instagram?:InstagramOptions;threads?:{topic:string}};
export type PlanInput = { contractVersion: 1; projectId: string; brandId: string; contentId: string; revision: number;
  source: { producer: string; reference: string }; variants: Record<string,Variant>;
  assets: Asset[]; destinations: Target[]; requestId: string; idempotencyKey: string; mode: 'simulation'|'live' };
export type State = 'DRAFT'|'NEEDS_APPROVAL'|'APPROVED'|'SCHEDULED'|'DISPATCHING'|'PROVIDER_ACCEPTED'|'PUBLISHED'|'FAILED'|'AMBIGUOUS_HOLD'|'CANCEL_REQUESTED'|'CANCELLED'|'SIMULATED';
export type Receipt = { providerStatus?:'scheduled'|'sending'|'sent'|'error'; state: 'PROVIDER_ACCEPTED'|'PUBLISHED'|'FAILED'|'CANCELLED'; providerId: string; providerJobId?: string; providerRevision?: number; cancellationEventId?: string;
  platformPostId?: string; permalink?: string; confirmedAt?: string };
export type Delivery = { id: string; target: Target; adapter: string; executionOwner: 'provider'; state: State;
  attempts: number; intentAt?: string; receipt?: Receipt; error?: string };
export type Plan = { id: string; digest: string; input: PlanInput; submittedBy: string; state: State;
  approval?: { reference: string; digest: string; actor: string; at: string }; deliveries: Delivery[] };
export type Event = { sequence: number; at: string; projectId: string; brandId: string; contentId: string; revision: number;
  planId: string; deliveryId?: string; accountKey?: string; platform?: string; attempts?: number; executionOwner?: string; state: State; providerId?: string; providerJobId?: string; providerRevision?: number; cancellationEventId?: string; platformPostId?: string;
  permalink?: string; confirmedAt?: string; aiCalls: 0; cost: null };
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value === 'object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export function authorize(p: Principal, scope: Scope, project: string) {
  if (!p.scopes.includes(scope) || !p.projects.includes(project)) fail('FORBIDDEN',403);
  if (scope==='approve' && p.approvalProjects && !p.approvalProjects.includes(project)) fail('FORBIDDEN',403);
  if (scope==='approve' && p.role!=='owner') fail('HUMAN_APPROVAL_REQUIRED',403);
}
export function authenticate(header: string|undefined, credentials: Credential[]): Principal {
  if (!credentials.length) return fail('AUTH_NOT_CONFIGURED',503);
  const value = header?.startsWith('Bearer ') ? header.slice(7) : '';
  for (const c of credentials) {
    if (c.token.length<32) continue;
    const a=Buffer.from(value),b=Buffer.from(c.token);
    if(a.length===b.length && timingSafeEqual(a,b)) return c.principal;
  }
  return fail('FORBIDDEN',403);
}
function keys(o: any, allowed: string[]) {
  if (!o || typeof o!=='object' || Array.isArray(o) || Object.keys(o).some(k=>!allowed.includes(k))) fail('INVALID_FIELDS',400);
}
function str(v: any, max=200): asserts v is string { if(typeof v!=='string'||!v.length||v.length>max) fail('INVALID_STRING',400); }
// Buffer API Character Limits: UTF-16 units; topics cannot contain & or .
export function validateThreadsTopic(topic: unknown): asserts topic is string {
  if(typeof topic!=='string'||!topic.trim()||topic.length>50||/[&.]/.test(topic))fail('INVALID_THREADS_TOPIC',400);
}
function date(v: any) { str(v); if(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))) fail('INVALID_TIME',400); }
export function validate(input: unknown, p: Principal, routes: Route[], mediaHosts: string[]): PlanInput {
  const x=input as PlanInput;
  keys(x,['contractVersion','projectId','brandId','contentId','revision','source','variants','assets','destinations','requestId','idempotencyKey','mode']);
  for(const k of ['projectId','brandId','contentId','requestId','idempotencyKey'] as const) str(x[k]);
  authorize(p,'submit',x.projectId);
  if(x.contractVersion!==1||!Number.isSafeInteger(x.revision)||x.revision<1||!['simulation','live'].includes(x.mode)) fail('INVALID_VERSION_OR_MODE',400);
  keys(x.source,['producer','reference']);str(x.source.producer);str(x.source.reference,2000);
  if(!Array.isArray(x.assets)||x.assets.length>10||!Array.isArray(x.destinations)||!x.destinations.length||x.destinations.length>10) fail('INVALID_TARGETS',400);
  if(!x.variants||typeof x.variants!=='object'||Array.isArray(x.variants)||Object.keys(x.variants).length>10) fail('INVALID_VARIANTS',400);
  for(const v of Object.values(x.variants)) { keys(v,['text','asset','assetIndices','instagram','threads']);if(v.instagram||v.assetIndices)instagramVariant(v,x.assets);else str(v.text,10000);if(v.asset!==undefined&&(!Number.isInteger(v.asset)||!x.assets[v.asset])) fail('INVALID_ASSET',400); }
  for(const v of Object.values(x.variants))if(v.threads!==undefined){keys(v.threads,['topic']);validateThreadsTopic(v.threads.topic);}
  for(const a of x.assets) {
    keys(a,['url','kind','digest','revision','availableUntil','altText','thumbnailOffset','userTags']);str(a.url,4096);str(a.revision);date(a.availableUntil);
    if(!['image','reel','video'].includes(a.kind)||!/^sha256:[a-f0-9]{64}$/.test(a.digest)) fail('ASSET_IDENTITY_REQUIRED',400);
    if(a.altText!==undefined&&(a.kind!=='image'||typeof a.altText!=='string'||a.altText.length>1000))fail('ASSET_METADATA_INVALID',400);
    if(a.thumbnailOffset!==undefined&&(a.kind==='image'||!Number.isSafeInteger(a.thumbnailOffset)||a.thumbnailOffset<0||a.thumbnailOffset>900000))fail('ASSET_METADATA_INVALID',400);
    if(a.userTags!==undefined){if(a.kind!=='image'||!Array.isArray(a.userTags)||a.userTags.length>20)fail('ASSET_METADATA_INVALID',400);for(const tag of a.userTags){keys(tag,['handle','x','y']);if(typeof tag.handle!=='string'||!/^[-a-zA-Z0-9_.]{1,30}$/.test(tag.handle)||![tag.x,tag.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))fail('ASSET_METADATA_INVALID',400);}}
    let u:URL;try {u=new URL(a.url);}catch{return fail('INVALID_MEDIA_URL',400);}
    // No fetch/import of producer URLs occurs in this release. Only exact, operator-controlled origins.
    if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port||isIP(u.hostname.replace(/[\[\]]/g,''))||!mediaHosts.includes(u.hostname)||/localhost|\.local$|\.internal$/.test(u.hostname)) fail('MEDIA_ORIGIN_DENIED',400);
  }
  const targets=new Set<string>();
  for(const t of x.destinations) {
    keys(t,['platform','accountKey','variant','scheduledAt','timezone']);str(t.accountKey);str(t.variant);str(t.timezone);date(t.scheduledAt);
    try {new Intl.DateTimeFormat('en',{timeZone:t.timezone});}catch{return fail('INVALID_TIMEZONE',400);}
    if(!routes.some(r=>r.projectId===x.projectId&&r.brandId===x.brandId&&r.platform===t.platform&&r.accountKey===t.accountKey&&r.mode===x.mode&&r.executionOwner==='provider')) fail('ROUTE_DENIED',403);
    const key=t.platform+':'+t.accountKey;if(targets.has(key)) fail('DUPLICATE_TARGET',400);targets.add(key);
    const v=x.variants[t.variant];if(!v) fail('VARIANT_MISSING',400);
    if(t.platform==='threads'&&(v.text.length>500||v.asset!==undefined||v.assetIndices!==undefined||v.instagram!==undefined)) fail('THREADS_TEXT_ONLY',400);
    if(t.platform!=='threads'&&v.threads!==undefined)fail('THREADS_TOPIC_PLATFORM_MISMATCH',400);
    if(t.platform==='instagram')instagramVariant(v,x.assets);
    if(assetIndices(v).some(i=>Date.parse(x.assets[i].availableUntil)<=Date.parse(t.scheduledAt))) fail('ASSET_EXPIRES_BEFORE_DELIVERY',400);
  }
  return structuredClone(x);
}
