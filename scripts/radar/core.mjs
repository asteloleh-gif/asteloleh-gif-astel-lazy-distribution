import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';

export const accounts = Object.freeze({
  'astel.u:threads': {platform:'threads', handle:'astel.u', language:'ru', name:'Олег'},
  'astel.us:threads': {platform:'threads', handle:'astel.us', language:'uk', name:'Олег'},
  'leoakastel:threads': {platform:'threads', handle:'leoakastel', language:'en', name:'Leo'},
  'asapleo.ai:instagram': {platform:'instagram', handle:'asapleo.ai', language:'en', name:'Leo'},
  'wtffounder:instagram': {platform:'instagram', handle:'wtffounder', language:'en', name:'Leo'}
});
export const SETUP_QUERY='manual login setup only';
export const isSetupTask=task=>task.query.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim()===SETUP_QUERY;
export class RadarError extends Error { constructor(code,status=409){super(code);this.code=code;this.status=status;} }
export const deny=(code,status)=>{throw new RadarError(code,status);};
export function text(value,max=1000){if(typeof value!=='string'||!value.trim()||value.length>max)deny('INVALID_TEXT',400);return value.trim();}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function canonicalPost(value, platform){
  if(typeof value!=='string'||value.length>2048||/\\|(?:^|\/)\.{1,2}(?:\/|$)|%2e|%2f|%5c/i.test(value))deny('INVALID_POST_URL',400);
  let u;try{u=new URL(value);}catch{deny('INVALID_POST_URL',400);}
  const hosts=platform==='threads'?['threads.com','www.threads.com','threads.net','www.threads.net']:['instagram.com','www.instagram.com'];
  const pattern=platform==='threads'?/^\/@[a-zA-Z0-9_.]+\/post\/[a-zA-Z0-9_-]+\/?$/:/^\/(p|reel)\/[a-zA-Z0-9_-]+\/?$/;
  if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname)||!pattern.test(u.pathname))deny('POST_URL_DENIED',400);
  return 'https://www.'+(platform==='threads'?'threads.com':'instagram.com')+u.pathname.replace(/\/$/,'');
}
// Single coordinator, local disk only. Workers never open/copy this database.
export class Radar {
  constructor(file,{clock=Date.now,leaseMs=45000,primaryGraceMs=60000}={}){
    if(leaseMs<1000||primaryGraceMs<0)deny('INVALID_COORDINATOR_CONFIG');
    if(file!==':memory:'){mkdirSync(dirname(file),{recursive:true,mode:0o700});}
    this.db=new DatabaseSync(file); if(file!==':memory:')chmodSync(file,0o600);
    this.clock=clock;this.leaseMs=leaseMs;this.primaryGraceMs=primaryGraceMs;
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, identity TEXT UNIQUE, account TEXT NOT NULL, batch TEXT NOT NULL, query TEXT NOT NULL, state TEXT NOT NULL, worker TEXT, generation INTEGER NOT NULL DEFAULT 0, expires INTEGER, created INTEGER NOT NULL, checkpoint TEXT NOT NULL DEFAULT '{}', reason TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS account_lock ON tasks(account) WHERE state IN ('RUNNING','HOLD');
      CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, task TEXT NOT NULL, url TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(task,url));
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, task TEXT NOT NULL, evidence TEXT NOT NULL UNIQUE, batch TEXT NOT NULL, platform TEXT NOT NULL, account TEXT NOT NULL, url TEXT NOT NULL, normalized TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(batch,url), UNIQUE(batch,normalized));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, task TEXT, kind TEXT NOT NULL, actor TEXT NOT NULL);`);
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(id,kind,actor){this.db.prepare('INSERT INTO events(at,task,kind,actor) VALUES(?,?,?,?)').run(this.clock(),id,kind,actor);}
  expire(){this.db.prepare("UPDATE tasks SET state='HOLD',reason='LEASE_EXPIRED' WHERE state='RUNNING' AND expires<=?").run(this.clock());}
  get(id){const t=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);if(!t)deny('TASK_NOT_FOUND',404);return {...t,checkpoint:JSON.parse(t.checkpoint),accountProfile:accounts[t.account],signal:t.state==='RUNNING'?'red':t.state==='HOLD'?'yellow':'green'};}
  status(id){return this.transaction(()=>{this.expire();return this.get(id);});}
  list(){return this.transaction(()=>{this.expire();return this.db.prepare('SELECT id FROM tasks ORDER BY created DESC LIMIT 100').all().map(t=>this.get(t.id));});}
  pending(allowedAccounts){return this.transaction(()=>{this.expire();return this.db.prepare("SELECT id FROM tasks WHERE state='READY' ORDER BY created LIMIT 100").all().map(t=>this.get(t.id)).filter(t=>allowedAccounts.includes(t.account)&&!isSetupTask(t));});}
  create({account,batch,query},actor){
    if(!accounts[account])deny('ACCOUNT_REQUIRED',400);batch=text(batch,100);query=text(query,300);
    const identity=digest([account,batch,query.normalize('NFKC').toLowerCase().replace(/\s+/g,' ')]);
    return this.transaction(()=>{const old=this.db.prepare('SELECT id FROM tasks WHERE identity=?').get(identity);if(old)return this.get(old.id);
      const id=randomUUID();this.db.prepare("INSERT INTO tasks(id,identity,account,batch,query,state,created) VALUES(?,?,?,?,?,'READY',?)").run(id,identity,account,batch,query,this.clock());this.event(id,'CREATED',actor);return this.get(id);});
  }
  claim(id,worker,allowedAccounts,primary=false,setup=false){
    // Commit expiry before attempting acquisition, so refusal cannot undo yellow.
    this.transaction(()=>this.expire());
    return this.transaction(()=>{const t=this.get(id);
      if(!allowedAccounts.includes(t.account))deny('WORKER_ACCOUNT_DENIED',403);
      if(t.state!=='READY')deny('TASK_NOT_READY');
      if(isSetupTask(t)!==setup)deny('TASK_KIND_MISMATCH');
      if(!primary&&this.clock()<t.created+this.primaryGraceMs)deny('PRIMARY_HAS_PRIORITY');
      if(this.db.prepare("SELECT id FROM tasks WHERE account=? AND state IN ('RUNNING','HOLD')").get(t.account))deny('ACCOUNT_BUSY');
      this.db.prepare("UPDATE tasks SET state='RUNNING',worker=?,generation=generation+1,expires=?,reason=NULL WHERE id=?").run(worker,this.clock()+this.leaseMs,id);this.event(id,'CLAIMED',worker);return this.get(id);});
  }
  owned(id,worker,generation){const t=this.get(id);if(t.state!=='RUNNING'||t.worker!==worker||t.generation!==generation||t.expires<=this.clock())deny('LEASE_LOST');return t;}
  heartbeat(id,worker,generation){return this.transaction(()=>{this.owned(id,worker,generation);this.db.prepare('UPDATE tasks SET expires=? WHERE id=?').run(this.clock()+this.leaseMs,id);return this.get(id);});}
  checkpoint(id,worker,generation,value){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['visited','stage'].includes(k)))deny('INVALID_CHECKPOINT',400);
    return this.transaction(()=>{const t=this.owned(id,worker,generation);const visited=value.visited??[];
      if(!Array.isArray(visited)||visited.length>20)deny('INVALID_CHECKPOINT',400);
      const safe={stage:text(value.stage,40),visited:visited.map(u=>canonicalPost(u,accounts[t.account].platform))};
      this.db.prepare('UPDATE tasks SET checkpoint=? WHERE id=?').run(JSON.stringify(safe),id);return this.get(id);});
  }
  hold(id,worker,generation,reason){return this.transaction(()=>{const t=this.get(id);if(t.worker!==worker||t.generation!==generation||!['RUNNING','HOLD'].includes(t.state))deny('LEASE_LOST');
    if(!['CHALLENGE','LOGIN_REQUIRED','IDENTITY_MISMATCH','IDENTITY_UNAVAILABLE','READ_FAILED','OPERATOR_STOP'].includes(reason))deny('INVALID_STOP_REASON',400);
    this.db.prepare("UPDATE tasks SET state='HOLD',reason=?,expires=0 WHERE id=?").run(reason,id);this.event(id,'HOLD',worker);return this.get(id);});}
  resume(id,actor,{previousWorkerStopped=false}={}){return this.transaction(()=>{this.expire();const t=this.get(id);if(t.state!=='HOLD'||previousWorkerStopped!==true)deny('STOP_PROOF_REQUIRED');
    this.db.prepare("UPDATE tasks SET state='READY',worker=NULL,generation=generation+1,expires=NULL,created=? WHERE id=?").run(this.clock(),id);this.event(id,'OWNER_CONFIRMED_STOP_AND_RESUMED',actor);return this.get(id);});}
  record(id,worker,generation,e){return this.transaction(()=>{const t=this.owned(id,worker,generation),p=accounts[t.account];if(isSetupTask(t))deny('TASK_KIND_MISMATCH');
    if(e.activeAccount!==p.handle)deny('IDENTITY_MISMATCH',403);
    const url=canonicalPost(e.url,p.platform);const readAt=text(e.readAt,40);if(!Number.isFinite(Date.parse(readAt))||Math.abs(this.clock()-Date.parse(readAt))>300000)deny('STALE_EVIDENCE',400);
    if(!['not_present','not_viewed','viewed'].includes(e.video))deny('VIDEO_STATUS_REQUIRED',400);
    if(e.video==='viewed')deny('VIDEO_VIEWING_NOT_CERTIFIED',400);
    if(!Array.isArray(e.unavailable)||e.unavailable.length>10)deny('COVERAGE_REQUIRED',400);
    const data={url,activeAccount:p.handle,author:text(e.author,100),publishedAt:e.publishedAt===null?null:text(e.publishedAt,100),readAt,
      text:text(e.text,12000),replies:Array.isArray(e.replies)?e.replies.slice(0,30).map(r=>text(r,2000)):[],video:e.video,
      unavailable:e.unavailable.map(x=>text(x,300)),coverage:'visible DOM text only; replies may be incomplete',source:'browser',trusted:false};
    const old=this.db.prepare('SELECT id FROM evidence WHERE task=? AND url=?').get(id,url);if(old)return JSON.parse(this.db.prepare('SELECT data FROM evidence WHERE id=?').get(old.id).data);
    if(this.db.prepare('SELECT count(*) n FROM evidence WHERE task=?').get(id).n>=20)deny('READ_BUDGET_REACHED');
    const evidenceId=randomUUID();data.id=evidenceId;this.db.prepare('INSERT INTO evidence VALUES(?,?,?,?)').run(evidenceId,id,url,JSON.stringify(data));return data;});}
  setupcomplete(id,worker,generation,activeAccount,browserClosed){return this.transaction(()=>{const t=this.owned(id,worker,generation);if(!isSetupTask(t))deny('TASK_KIND_MISMATCH');if(activeAccount!==accounts[t.account].handle)deny('IDENTITY_MISMATCH');if(browserClosed!==true)deny('BROWSER_CLOSE_REQUIRED');this.db.prepare("UPDATE tasks SET state='SETUP_COMPLETE',expires=NULL WHERE id=?").run(id);this.event(id,'SETUP_COMPLETE',worker);return this.get(id);});}
  complete(id,worker,generation){return this.transaction(()=>{if(isSetupTask(this.owned(id,worker,generation)))deny('TASK_KIND_MISMATCH');this.db.prepare("UPDATE tasks SET state='COLLECTED',expires=NULL WHERE id=?").run(id);this.event(id,'COLLECTED',worker);return this.get(id);});}
  evidence(id){this.get(id);return this.db.prepare('SELECT data FROM evidence WHERE task=?').all(id).map(x=>JSON.parse(x.data));}
  draft(id,input,actor){return this.transaction(()=>{const t=this.get(id),p=accounts[t.account];if(t.state!=='COLLECTED')deny('READING_NOT_COMPLETE');
    const row=this.db.prepare('SELECT data FROM evidence WHERE id=? AND task=?').get(input.evidenceId,id);if(!row)deny('EVIDENCE_REQUIRED',400);const e=JSON.parse(row.data);
    if(input.language!==p.language||input.grounding!=='read_text_only')deny('DRAFT_GROUNDING_REQUIRED',400);
    const comment=text(input.text,600),why=text(input.why,1000),normalized=comment.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
    const old=this.db.prepare('SELECT data FROM drafts WHERE evidence=?').get(e.id);if(old){const d=JSON.parse(old.data);if(d.text===comment&&d.why===why)return d;deny('DRAFT_ALREADY_EXISTS');}
    if(this.db.prepare('SELECT count(*) n FROM drafts WHERE batch=? AND platform=?').get(t.batch,p.platform).n>=5)deny('PLATFORM_BATCH_LIMIT');
    if(this.db.prepare('SELECT id FROM drafts WHERE batch=? AND (url=? OR normalized=?)').get(t.batch,e.url,normalized))deny('DUPLICATE_DRAFT');
    const d={id:randomUUID(),evidenceId:e.id,account:t.account,language:p.language,text:comment,why,url:e.url,author:e.author,publishedAt:e.publishedAt,readAt:e.readAt,context:e.text,replies:e.replies,unavailable:e.unavailable,video:e.video,grounding:'read_text_only',status:'LOCAL_DRAFT',metrics:{meaningfulReplies:null,continuedDialogs:null,profileVisits:null,follows:null}};
    this.db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?,?,?,?,?)').run(d.id,id,e.id,t.batch,p.platform,t.account,e.url,normalized,JSON.stringify(d));this.event(id,'DRAFT_SAVED',actor);return d;});}
  drafts(id){this.get(id);return this.db.prepare('SELECT data FROM drafts WHERE task=?').all(id).map(x=>JSON.parse(x.data));}
}
