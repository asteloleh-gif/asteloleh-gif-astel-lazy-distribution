import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { radarClient } from './client.mjs';
import { runWorker } from './worker.mjs';
import { ReadBrowser } from './browser.mjs';

// One pass of the repository's existing polling worker. Importing this module
// must never start the daemon, acquire a task, or open an account profile.
export async function dispatchPendingReads({ call, openBrowser, shouldStop = () => false }) {
  const { tasks } = await call('pending', {});
  for (const task of tasks) {
    if (shouldStop()) break;
    try {
      await runWorker({ taskId: task.id, call, openBrowser });
    } catch (error) {
      console.error(/^[A-Z_]+$/.test(error.message) ? error.message : 'WORKER_FAILED');
    }
  }
}

async function main() {
  if (process.env.RADAR_BROWSER_AUTHORIZED !== 'true' ||
      !process.env.RADAR_PLAYWRIGHT_MODULE || !process.env.RADAR_PROFILE_ROOT) {
    throw Error('BROWSER_WORKER_NOT_AUTHORIZED_OR_CONFIGURED');
  }
  const call = radarClient();
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  while (!stopped) {
    try {
      await dispatchPendingReads({ call, openBrowser: ReadBrowser.open, shouldStop: () => stopped });
    } catch {
      console.error('COORDINATOR_UNAVAILABLE_WAITING');
    }
    if (!stopped) await delay(30000);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
