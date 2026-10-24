import { authorize, fail, hash, validate, actionScopes } from './contract.js';
import type { Principal, Route, Plan, PlanInput, Delivery, Receipt, State, Scope } from './contract.js';
import type { Store, Journal } from './store.js';
import type { PublishingAdapter } from './openpost.js';
export class DistributionHub {
  editorial?:{sync(hub:DistributionHub,p:Principal,projectId:string):Promise<unknown>};
  constructor(readonly store:Store,readonly routes:Route[],readonly mediaHosts:string[],readonly adapters:Record<string,PublishingAdapter>,readonly now=()=>new Date().toISOString()){}
  async execute(p:Principal,action:string,args:any):Promise<unknown>{
    const scopes=actionScopes;
    if(!Object.hasOwn(scopes,action)) return fail('UNKNOWN_ACTION',404);
    if(!args||typeof args!=='object'||typeof args.projectId!=='string') return fail('PROJECT_REQUIRED',400);
    authorize(p,scopes[action],args.projectId);
    if(action==='importeditorial'){
      if(!this.editorial)return fail('EDITORIAL_NOT_CONFIGURED',503);
      if(p.role!=='producer')return fail('EDITORIAL_PRODUCER_REQUIRED',403);
      return this.editorial.sync(this,p,args.projectId);
    }
    if(action==='capabilities') return {contractVersion:1,routes:this.routes.filter(r=>r.projectId===args.projectId).map(r=>({...r,capabilities:this.adapters[r.adapter]?.capabilities()??null})),aiCalls:0};
    if(action==='preview') return {input:validate(args.input,p,this.routes,this.mediaHosts),aiCalls:0,mutations:0};
    return this.store.transaction(async(j,save)=>{
      if(action==='inbox'){
        const limit=args.limit===undefined?25:args.limit;
        if(!Number.isInteger(limit)||limit<1||limit>100||(args.cursor!==undefined&&typeof args.cursor!=='string'))return fail('INVALID_PAGINATION',400);
        const all=Object.values(j.plans).filter(plan=>plan.input.projectId===args.projectId&&(!args.cursor||plan.id>args.cursor)).sort((a,b)=>a.id.localeCompare(b.id));
        const page=all.slice(0,limit);
        return {projectId:args.projectId,items:page.map(plan=>({planId:plan.id,digest:plan.digest,brandId:plan.input.brandId,contentId:plan.input.contentId,
          revision:plan.input.revision,state:plan.state,requiresOwnerApproval:plan.state==='NEEDS_APPROVAL',
          canApprove:plan.state==='NEEDS_APPROVAL'&&p.role==='owner'&&p.scopes.includes('approve')&&plan.submittedBy!==p.id,
          variants:structuredClone(plan.input.variants),assets:structuredClone(plan.input.assets),
          deliveries:structuredClone(plan.deliveries)})),nextCursor:all.length>limit?page.at(-1)!.id:null,
          eventCursor:j.events.filter(e=>e.projectId===args.projectId).at(-1)?.sequence??0,aiCalls:0};
      }
      if(action==='submit') {
        const input=validate(args.input,p,this.routes,this.mediaHosts);
        if(input.projectId!==args.projectId) return fail('PROJECT_MISMATCH',403);
        const digest=hash(input),key=hash([input.projectId,input.idempotencyKey]);
        const existing=j.keys[key];
        if(existing){if(j.plans[existing].digest!==digest) return fail('IDEMPOTENCY_CONFLICT');return structuredClone(j.plans[existing]);}
        const id=hash([input.projectId,input.contentId,input.revision]);
        if(j.plans[id]) return fail('REVISION_ALREADY_EXISTS');
        const deliveries:Delivery[]=input.destinations.map(target=>{
          const route=this.routes.find(r=>r.projectId===input.projectId&&r.brandId===input.brandId&&r.platform===target.platform&&r.accountKey===target.accountKey&&r.mode===input.mode)!;
          const deliveryId=hash([input.projectId,input.contentId,input.revision,target.accountKey,target.platform]);
          if(j.deliveries[deliveryId]) fail('DELIVERY_ALREADY_RESERVED');
          return {id:deliveryId,target,adapter:route.adapter,executionOwner:'provider',state:'DRAFT',attempts:0};
        });
        const plan:Plan={id,digest,input,submittedBy:p.id,state:'DRAFT',deliveries};
        j.keys[key]=id;j.plans[id]=plan;for(const d of deliveries)j.deliveries[d.id]=id;
        this.event(j,plan);await save();return structuredClone(plan);
      }
      if(action==='metrics') {
        const deliveries=Object.values(j.plans).filter(p=>p.input.projectId===args.projectId).flatMap(p=>p.deliveries);
        return {projectId:args.projectId,pending:deliveries.filter(d=>['DRAFT','SCHEDULED','DISPATCHING','PROVIDER_ACCEPTED','CANCEL_REQUESTED'].includes(d.state)).length,
          failed:deliveries.filter(d=>d.state==='FAILED').length,ambiguous:deliveries.filter(d=>['AMBIGUOUS_HOLD','DISPATCHING'].includes(d.state)).length,
          confirmedSuccess:deliveries.filter(d=>d.state==='PUBLISHED').length,attempts:deliveries.reduce((s,d)=>s+d.attempts,0),
          retries:deliveries.reduce((s,d)=>s+Math.max(0,d.attempts-1),0),aiCalls:0,cost:null,insights:null};
      }
      if(action==='events') return {events:j.events.filter(e=>e.projectId===args.projectId&&e.sequence>(Number(args.after)||0)).slice(0,500)};
      if(action==='pause'||action==='resume'){
        if(p.role!=='owner') return fail('OWNER_REQUIRED',403);
        if(args.accountKey!==undefined&&!this.routes.some(r=>r.projectId===args.projectId&&r.accountKey===args.accountKey))return fail('ROUTE_DENIED',403);
        if(args.global===true&&!this.routes.every(r=>p.projects.includes(r.projectId)))return fail('GLOBAL_PAUSE_FORBIDDEN',403);
        const key=args.global===true?'global':args.accountKey?hash([args.projectId,args.accountKey]):hash([args.projectId]);
        j.pauses[key]=action==='pause';await save();return {paused:j.pauses[key]};
      }
      const plan=j.plans[args.planId];if(!plan||plan.input.projectId!==args.projectId) return fail('PLAN_NOT_FOUND',404);
      if(action==='status')return structuredClone(plan);
      if(hash(plan.input)!==plan.digest) return fail('PLAN_INTEGRITY_FAILURE',503);
      if(action==='review'){
        if(plan.state!=='DRAFT'&&plan.state!=='NEEDS_APPROVAL')return fail('INVALID_STATE');
        for(const d of plan.deliveries)await this.adapter(d).validate(this.command(plan,d));
        plan.state='NEEDS_APPROVAL';this.event(j,plan);await save();return {planId:plan.id,digest:plan.digest,state:plan.state};
      }
      if(action==='approve'){
        if(p.id===plan.submittedBy) return fail('SELF_APPROVAL_DENIED',403);
        if(args.digest!==plan.digest||plan.state!=='NEEDS_APPROVAL') return fail('EXACT_REVIEW_REQUIRED');
        plan.approval={reference:hash([plan.id,plan.digest,p.id,this.now()]),digest:plan.digest,actor:p.id,at:this.now()};
        plan.state='APPROVED';this.event(j,plan);await save();return structuredClone(plan);
      }
      if(action==='schedule'){
        if(!plan.approval||plan.approval.digest!==plan.digest) return fail('HUMAN_APPROVAL_REQUIRED',403);
        if(!['APPROVED','SCHEDULED','DISPATCHING','PROVIDER_ACCEPTED','PUBLISHED','FAILED','AMBIGUOUS_HOLD','SIMULATED'].includes(plan.state))return fail('INVALID_STATE');
        for(const d of plan.deliveries){
          if(d.state!=='DRAFT'&&d.state!=='SCHEDULED')continue;
          if(j.pauses[hash([args.projectId])]||j.pauses[hash([args.projectId,d.target.accountKey])]||j.pauses.global) return fail('ROUTE_PAUSED');
          const a=this.adapter(d,true);
          if(plan.input.mode==='live'&&Date.parse(d.target.scheduledAt)<=Date.parse(this.now()))return fail('LIVE_SCHEDULE_MUST_BE_FUTURE');
          if(plan.input.mode==='live'&&a.simulation) return fail('SIMULATOR_CANNOT_EXECUTE_LIVE');
          await a.validate(this.command(plan,d));
          // Revalidate expiry at dispatch; immutable approval binds original schedule and asset digest.
          const variant=plan.input.variants[d.target.variant];
          if(variant.asset!==undefined&&Date.parse(plan.input.assets[variant.asset].availableUntil)<=Date.parse(this.now()))return fail('ASSET_EXPIRED');
          d.state='SCHEDULED';this.event(j,plan,d);await save();
          if(plan.input.mode==='simulation') {d.state='SIMULATED';this.event(j,plan,d);await save();continue;}
          d.state='DISPATCHING';d.attempts++;d.intentAt=this.now();this.event(j,plan,d);await save();
          try {
            const receipt=await a.submit(this.command(plan,d),async providerId=>{
              if(typeof providerId!=='string'||!providerId) fail('INVALID_PROVIDER_ID');
              d.receipt={providerId,state:'PROVIDER_ACCEPTED'};await save();
            });
            this.apply(d,receipt);
          }catch {d.state='AMBIGUOUS_HOLD';d.error='PROVIDER_OUTCOME_UNKNOWN';}
          this.event(j,plan,d);this.aggregate(plan);await save();
        }
        this.aggregate(plan);await save();return structuredClone(plan);
      }
      if(action==='cancel'||action==='reconcile'){
        for(const d of plan.deliveries){
          if(args.deliveryId&&d.id!==args.deliveryId)continue;
          if(['PUBLISHED','CANCELLED','SIMULATED','FAILED'].includes(d.state))continue;
          const previous=hash(d);
          if(action==='cancel'){
            if(d.state==='DRAFT'||d.state==='SCHEDULED'){d.state='CANCELLED';}
            else{
              // Persist cancellation intent even if provider is unreachable; never claim confirmed cancellation.
              d.state='CANCEL_REQUESTED';this.event(j,plan,d);await save();
              if(d.receipt?.providerId)try{const r=await this.adapter(d).cancel(d.receipt.providerId,this.command(plan,d));if(r)this.apply(d,r);}catch{d.error='CANCEL_UNCONFIRMED';}
            }
          }else if(['DISPATCHING','AMBIGUOUS_HOLD','PROVIDER_ACCEPTED','CANCEL_REQUESTED'].includes(d.state)){
            if(!d.receipt?.providerId){d.state='AMBIGUOUS_HOLD';d.error='PROVIDER_ID_MISSING_NO_RETRY';}
            else try{this.apply(d,await this.adapter(d).status(d.receipt.providerId,this.command(plan,d),{cancelRequested:d.state==='CANCEL_REQUESTED'}));}catch{d.error='STATUS_UNAVAILABLE';if(d.state==='DISPATCHING')d.state='AMBIGUOUS_HOLD';}
          }
          if(hash(d)!==previous){this.event(j,plan,d);await save();}
        }
        this.aggregate(plan);await save();return structuredClone(plan);
      }
      return fail('UNKNOWN_ACTION',404);
    });
  }
  private adapter(d:Delivery,forScheduling=false){const a=this.adapters[d.adapter];if(!a||d.executionOwner!=='provider'||(forScheduling&&!a.capabilities().schedule)) return fail('ADAPTER_BLOCKED',503);return a;}
  private command(plan:Plan,d:Delivery){return {deliveryId:d.id,plan:structuredClone(plan.input),target:structuredClone(d.target)};}
  private apply(d:Delivery,r:Receipt){
    if(!r||!['PROVIDER_ACCEPTED','PUBLISHED','FAILED','CANCELLED'].includes(r.state)||typeof r.providerId!=='string'||!r.providerId||
      (d.receipt?.providerId&&d.receipt.providerId!==r.providerId)||
      (r.state==='PUBLISHED'&&(!r.platformPostId||!r.confirmedAt||!Number.isFinite(Date.parse(r.confirmedAt)))))return fail('INVALID_PROVIDER_RECEIPT',502);
    if(d.state==='CANCEL_REQUESTED'&&r.state==='PROVIDER_ACCEPTED'){d.receipt=r;return;}
    d.receipt={...d.receipt,...structuredClone(r)};d.state=r.state;delete d.error;
  }
  private aggregate(plan:Plan){
    const states=plan.deliveries.map(d=>d.state);
    if(states.every(s=>s==='PUBLISHED'))plan.state='PUBLISHED';
    else if(states.every(s=>s==='SIMULATED'))plan.state='SIMULATED';
    else if(states.every(s=>s==='CANCELLED'))plan.state='CANCELLED';
    else if(states.includes('CANCEL_REQUESTED'))plan.state='CANCEL_REQUESTED';
    else if(states.includes('AMBIGUOUS_HOLD')||states.includes('DISPATCHING'))plan.state='AMBIGUOUS_HOLD';
    else if(states.includes('FAILED'))plan.state='FAILED';
    else if(states.includes('PROVIDER_ACCEPTED'))plan.state='PROVIDER_ACCEPTED';
    else if(states.includes('SCHEDULED'))plan.state='SCHEDULED';
  }
  private event(j:Journal,p:Plan,d?:Delivery){j.events.push({sequence:j.events.length+1,at:this.now(),projectId:p.input.projectId,brandId:p.input.brandId,contentId:p.input.contentId,revision:p.input.revision,planId:p.id,
    ...(d?{deliveryId:d.id,accountKey:d.target.accountKey,platform:d.target.platform,attempts:d.attempts,executionOwner:d.executionOwner,providerId:d.receipt?.providerId,providerJobId:d.receipt?.providerJobId,platformPostId:d.receipt?.platformPostId,permalink:d.receipt?.permalink,confirmedAt:d.receipt?.confirmedAt}:{}),state:d?.state??p.state,aiCalls:0,cost:null});}
}
