import { fail } from './contract.js';
import type { PlanInput, Target, Receipt } from './contract.js';
export type ReadContext = { cancelRequested?:boolean };
export type AdapterCommand = { approvalActor?:string; deliveryId:string; plan:PlanInput; target:Target };
export interface PublishingAdapter {
  readonly id:string;
  readonly simulation:boolean;
  capabilities(): { executionOwner:'provider'; schedule:boolean; cancel:boolean; live:boolean };
  validate(command:AdapterCommand):Promise<void>;
  submit(command:AdapterCommand, checkpoint:(providerId:string)=>Promise<void>):Promise<Receipt>;
  status(providerId:string, command:AdapterCommand, context?:ReadContext):Promise<Receipt>;
  cancel(providerId:string,command:AdapterCommand):Promise<Receipt|undefined>;
}
// Explicit API boundary for version-pinned, identity-bound implementations. No direct Meta fallback.
export interface OpenPostPort {
  validate(c:AdapterCommand):Promise<void>;
  submit(c:AdapterCommand, checkpoint:(id:string)=>Promise<void>):Promise<Receipt>;
  status(id:string,c:AdapterCommand,context?:ReadContext):Promise<Receipt>;
  cancel(id:string,c:AdapterCommand):Promise<Receipt|undefined>;
}
export class OpenPostAdapter implements PublishingAdapter {
  readonly id='openpost';readonly simulation=false;
  constructor(private port?:OpenPostPort,private verified?:{versionPinned:boolean;storageVerified:boolean;accountsVerified:boolean;approvalEditIsolation:boolean}){}
  private ready(){const v=this.verified;if(!this.port||!v||!v.versionPinned||!v.storageVerified||!v.accountsVerified||!v.approvalEditIsolation) fail('OPENPOST_LIVE_PREFLIGHT_BLOCKED',503);return this.port!;}
  capabilities(){return {executionOwner:'provider' as const,schedule:!!this.port&&Object.values(this.verified??{}).length===4&&Object.values(this.verified??{}).every(Boolean),cancel:!!this.port,live:!!this.port&&Object.values(this.verified??{}).length===4&&Object.values(this.verified??{}).every(Boolean)};}
  async validate(c:AdapterCommand){await this.ready().validate(c);}
  async submit(c:AdapterCommand,checkpoint:(id:string)=>Promise<void>){return this.ready().submit(c,checkpoint);}
  async status(id:string,c:AdapterCommand,context?:ReadContext){return this.ready().status(id,c,context);}
  async cancel(id:string,c:AdapterCommand){return this.ready().cancel(id,c);}
}
// Only documented read-only installed endpoints; token is supplied by the secret store.
export async function inspectOpenPost(origin:string,token:string,workspaceId:string,fetcher:typeof fetch=fetch){
  const u=new URL(origin);
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!token||!workspaceId) fail('OPENPOST_READ_CONFIG_REQUIRED',503);
  const response=await fetcher(`${u.origin}/api/v1/accounts?workspace_id=${encodeURIComponent(workspaceId)}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok) fail('OPENPOST_READ_FAILED',502);
  return await response.json() as unknown;
}
