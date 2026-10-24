import type {PlanInput,Plan,Principal} from './contract.js';
// For an application backend/BFF only. Never embed the bearer in a mobile/web bundle.
export class HubClient {
  private origin:string;
  constructor(origin:string,private token:string,private fetcher:typeof fetch=fetch){
    const u=new URL(origin);
    if((u.protocol!=='https:'&&!(u.protocol==='http:'&&u.hostname==='127.0.0.1'))||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('HUB_ORIGIN_DENIED');
    this.origin=u.origin;
  }
  async call<T=unknown>(action:string,args:Record<string,unknown>):Promise<T>{
    if(!/^[a-z]+$/.test(action))throw Error('INVALID_HUB_ACTION');
    let response:Response;
    try{response=await this.fetcher(`${this.origin}/api/distribution/${action}`,{method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('HUB_RESPONSE_UNCONFIRMED_DO_NOT_RECREATE');}
    if(!response.ok)throw Error(`HUB_REQUEST_FAILED_${response.status}`);
    return response.json() as Promise<T>;
  }
  inbox(projectId:string,cursor?:string){return this.call('inbox',{projectId,...(cursor?{cursor}:{})});}
  submit(projectId:string,input:PlanInput){return this.call<Plan>('submit',{projectId,input});}
  approve(projectId:string,planId:string,digest:string){return this.call<Plan>('approve',{projectId,planId,digest});}
  status(projectId:string,planId:string){return this.call<Plan>('status',{projectId,planId});}
  events(projectId:string,after=0){return this.call('events',{projectId,after});}
  metrics(projectId:string){return this.call('metrics',{projectId});}
}
// Profiles define permissions only; provisioning actual caller credentials is a separate action.
export const kevinOperator=(projects:string[]):Principal=>({id:'kevin',role:'producer',projects,scopes:['editorial','submit','review','schedule','status','cancel','reconcile']});
export const olegOwner=(projects:string[]):Principal=>({id:'oleg',role:'owner',projects,scopes:['status','approve','pause']});
