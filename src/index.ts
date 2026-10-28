import { createAppServer } from "./server.js";
import { configuredHub } from "./hub/runtime.js";
import { startReconciler } from "./hub/reconciler.js";
const options=configuredHub();
if(options.hub&&process.env.LD_RECONCILE_ENABLED==="true")startReconciler(options.hub);
// Optional independent read/draft module. No distribution scheduler or route changes.
let radar;
if(process.env.RADAR_ENABLED==='true'){
  try{
    const moduleUrl=new URL('../scripts/radar/api.mjs',import.meta.url).href;
    radar=(await import(moduleUrl)).configuredRadar(options.credentials??[]);
  }catch{
    // A broken optional module must not take the existing distribution service down.
    console.error('RADAR_STARTUP_BLOCKED');
  }
}
const server=createAppServer({...options,radar});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),process.env.LD_LISTEN_HOST||"0.0.0.0",()=>console.log("astel-lazy-distribution listening"));
// Legacy ingest scheduler intentionally not started. Provider owns approved schedules.
