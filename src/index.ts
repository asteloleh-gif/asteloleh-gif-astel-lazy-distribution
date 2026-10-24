import { startIngestScheduler } from "./ingest/worker.js";
import { createAppServer } from "./server.js";
const port = Number(process.env.PORT || 8080);
createAppServer().listen(port, "0.0.0.0", () => {
  console.log(`astel-lazy-distribution listening on :${port}`);
});

startIngestScheduler();
