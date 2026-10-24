import type { DistributionHub } from './service.js';
// Status polling only: NEVER a second scheduler or due-dispatch worker.
export async function reconcileActive(hub:DistributionHub,limit=5){
  const candidates=await hub.store.transaction(async (j,save)=>{
    const all=Object.values(j.plans).flatMap(p=>p.deliveries
      .filter(d=>!!d.receipt?.providerId&&['DISPATCHING','PROVIDER_ACCEPTED','AMBIGUOUS_HOLD','CANCEL_REQUESTED'].includes(d.state))
      .map(d=>({projectId:p.input.projectId,planId:p.id,deliveryId:d.id})));
    const count=Math.min(all.length,20,Math.max(0,limit));
    const start=(j.reconcileCursor??0)%Math.max(1,all.length);
    const selected=Array.from({length:count},(_,i)=>all[(start+i)%all.length]);
    if(count){j.reconcileCursor=(start+count)%all.length;await save();}
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
