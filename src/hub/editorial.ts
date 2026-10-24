import {fail,hash} from './contract.js';
import type {PlanInput,Plan,Principal} from './contract.js';
import type {DistributionHub} from './service.js';
export type EditorialBinding={baseId:string;tableId:string;projectId:string;brandId:string;accountKey:string;token:string};
type Row={id:string;fields:Record<string,unknown>};
const choice=(v:unknown)=>typeof v==='string'?v:(v as any)?.name;
// Only explicit Hub opt-in is accepted. Legacy approval/results never grant authority.
export function editorialMaterial(row:Row,b:EditorialBinding):PlanInput|undefined {
  const f=row.fields;
  if(f['Distribution Hub']!==true)return;
  if(!/^rec[A-Za-z0-9]{14}$/.test(row.id)||choice(f.Approval)!=='Draft'||f['Job ID']||f['Source Record ID']||f['Source Approval'])fail('EDITORIAL_LEGACY_ROUTE_BLOCKED');
  if(choice(f.Platform)!=='Threads'||choice(f.Format)!=='Text'||f['Media URL'])fail('EDITORIAL_FORMAT_NOT_CERTIFIED');
  const mode=choice(f['Delivery Mode']);if(!['Simulation','Live'].includes(mode))fail('EDITORIAL_MODE_REQUIRED');
  if(typeof f.Caption!=='string'||!f.Caption.trim()||!Number.isSafeInteger(f.Revision)||Number(f.Revision)<1||typeof f['Scheduled At']!=='string')fail('EDITORIAL_MATERIAL_INCOMPLETE');
  const key=`airtable:${b.baseId}:${b.tableId}:${row.id}:${f.Revision}`;
  return {contractVersion:1,projectId:b.projectId,brandId:b.brandId,contentId:`airtable:${b.baseId}:${row.id}`,revision:Number(f.Revision),
    source:{producer:'copilot-airtable',reference:`${b.baseId}/${b.tableId}/${row.id}`},variants:{threads:{text:String(f.Caption)}},assets:[],
    destinations:[{platform:'threads',accountKey:b.accountKey,variant:'threads',scheduledAt:String(f['Scheduled At']),timezone:'America/Chicago'}],
    requestId:key,idempotencyKey:key,mode:mode==='Live'?'live':'simulation'};
}
export class AirtableEditorial {
  private stopped=false;private busy=false;private lastAt=-Infinity;private requestAt=0;
  constructor(readonly bindings:EditorialBinding[],private fetcher:typeof fetch=fetch,private now=()=>Date.now()){
    for(const b of bindings)if(!/^app[A-Za-z0-9]{14}$/.test(b.baseId)||!/^tbl[A-Za-z0-9]{14}$/.test(b.tableId)||!b.token||!b.accountKey.endsWith(':threads'))fail('EDITORIAL_BINDING_INVALID',503);
  }
  private async request(b:EditorialBinding,suffix:string,method='GET',body?:unknown):Promise<any>{
    const wait=260-(Date.now()-this.requestAt);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));this.requestAt=Date.now();
    let r:Response;
    try{r=await this.fetcher(`https://api.airtable.com/v0/${b.baseId}/${b.tableId}${suffix}`,{method,headers:{Authorization:`Bearer ${b.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('EDITORIAL_TRANSPORT_UNCONFIRMED');}
    // Do not retry quota/auth failures. Explicit process/operator recovery is required.
    if([401,403,429].includes(r.status))this.stopped=true;
    if(!r.ok)throw Error(`EDITORIAL_HTTP_${r.status}`);
    const data=await r.json().catch(()=>fail('EDITORIAL_INVALID_RESPONSE',502));return data;
  }
  async sync(hub:DistributionHub,p:Principal,projectId:string){
    if(this.stopped)fail('EDITORIAL_DISABLED_AFTER_PROVIDER_ERROR',503);
    if(this.busy||this.now()-this.lastAt<60000)fail('EDITORIAL_SYNC_RATE_LIMIT',429);
    const bindings=this.bindings.filter(b=>b.projectId===projectId);if(!bindings.length)fail('EDITORIAL_PROJECT_NOT_CONFIGURED',503);
    this.busy=true;this.lastAt=this.now();
    const results:{recordId:string;planId?:string;state?:string;error?:string}[]=[];
    try{for(const b of bindings){
      const rows:Row[]=[];let offset:string|undefined;const seen=new Set<string>();
      // No timer/high-frequency polling. A caller explicitly requests a bounded sync.
      for(let page=0;;page++){
        if(page>=10)fail('EDITORIAL_PAGE_LIMIT',503);
        const q=new URLSearchParams({pageSize:'100',filterByFormula:'{Distribution Hub}=TRUE()'});if(offset)q.set('offset',offset);
        const data=await this.request(b,'?'+q);if(!Array.isArray(data.records)||data.records.length>100)fail('EDITORIAL_INVALID_RESPONSE',502);
        rows.push(...data.records);if(!data.offset)break;
        if(typeof data.offset!=='string'||seen.has(data.offset))fail('EDITORIAL_INVALID_CURSOR',502);seen.add(data.offset);offset=data.offset;
      }
      for(const row of rows){try{
        const input=editorialMaterial(row,b);if(!input)continue;
        const plan=await hub.execute(p,'submit',{projectId,input}) as Plan;
        if(plan.state==='DRAFT')await hub.execute(p,'review',{projectId,planId:plan.id});
        const current=await hub.execute(p,'status',{projectId,planId:plan.id}) as Plan;
        // Re-read before writeback. Edits never mutate an already submitted/approved plan.
        const fresh=await this.request(b,'/'+row.id);const freshInput=editorialMaterial(fresh,b);
        if(!freshInput||hash(freshInput)!==plan.digest)fail('EDITORIAL_EDIT_DURING_SYNC');
        const fields={'Hub Plan ID':plan.id,'Hub State':current.state,'Hub Digest':plan.digest};
        if(Object.entries(fields).some(([k,v])=>fresh.fields[k]!==v))await this.request(b,'/'+row.id,'PATCH',{fields,typecast:false});
        results.push({recordId:row.id,planId:plan.id,state:current.state});
      }catch(error){results.push({recordId:row.id,error:error instanceof Error&&/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'EDITORIAL_ROW_FAILED'});if(this.stopped)throw Error('EDITORIAL_STOPPED');}}
    }return {results,aiCalls:0,publishingCalls:0};}finally{this.busy=false;}
  }
}
