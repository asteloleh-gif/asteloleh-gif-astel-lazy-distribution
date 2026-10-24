import type { DistributionHub } from './service.js';
// Status polling only: NEVER a second scheduler or due-dispatch worker.
export async function reconcileActive(hub:DistributionHub,limit=5){
  const candidates=await hub.store.transaction(async (j,save)=>{
    const all=Object.values(j.plans).flatMap(p=>p.deliveries
      .filter(d=>!!d.receipt?.providerId&&['DISPATCHING','PROVIDER_ACCEPTED','AMBIGUOUS_HOLD','CANCEL_REQUESTED'].includes(d.state))
      .map(d=>({projectId:p.input.projectId,planId:p.id,deliveryId:d.id,adapter:d.adapter,state:d.state,dueAt:d.target.scheduledAt})));
    const count=Math.min(all.length,20,Math.max(0,limit));
    const start=(j.reconcileCursor??0)%Math.max(1,all.length);
    const selected:typeof all=[];const now=Date.now();let nextCursor=start;
    for(let i=0;i<all.length&&selected.length<count;i++){
      const item=all[(start+i)%all.length];
      if(item.adapter.startsWith('buffer-')){
        // One due receipt read per Buffer account per hour. Explicit user status/cancel
        // can still run immediately, subject to the durable shared request budget.
        if(item.state!=='CANCEL_REQUESTED'&&Date.parse(item.dueAt)>now)continue;
        if(now-(j.bufferReconcileAt?.[item.adapter]??0)<3600000)continue;
        (j.bufferReconcileAt??={})[item.adapter]=now;
      }
      selected.push(item);
      nextCursor=(start+i+1)%Math.max(1,all.length);
    }
    if(selected.length){j.reconcileCursor=nextCursor;await save();}
    return selected;
  });
  let checked=0,errors=0;
  for(const item of candidates){
    try{await hub.execute({id:'ld-status-reader',role:'producer',projects:[item.projectId],scopes:['reconcile']},'reconcile',item);checked++;}catch{errors++;}
  }
  return {checked,errors};
}
export function startReconciler(hub:DistributionHub,intervalMs=60000){
  if(intervalMs<60000)throw Error('RECONCILE_INTERVAL_TOO_SHORT');
  let busy=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{await reconcileActive(hub);}catch{console.error('LD_RECONCILIATION_FAILED');}finally{busy=false;}},intervalMs);
  timer.unref();return timer;
}
