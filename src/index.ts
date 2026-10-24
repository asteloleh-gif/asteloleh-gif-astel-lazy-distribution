import { createAppServer } from "./server.js";
import { configuredHub } from "./hub/runtime.js";
import { startReconciler } from "./hub/reconciler.js";
const options=configuredHub();
if(options.hub&&process.env.LD_RECONCILE_ENABLED==="true")startReconciler(options.hub);
const server=createAppServer(options);
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),process.env.LD_LISTEN_HOST||"0.0.0.0",()=>console.log("astel-lazy-distribution listening"));
// Legacy ingest scheduler intentionally not started. Provider owns approved schedules.
