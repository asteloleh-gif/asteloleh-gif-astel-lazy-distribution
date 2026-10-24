import { open, readFile, rename, unlink, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { DistributionDraft } from '../core/types.js';

export class IngestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Job = { id: string; videoId: string; state: 'queued'|'sending'|'unknown'|'published'; draft?: DistributionDraft; pinId?: string };
export type Journal = { version: 1; binding: string; jobs: Record<string, Job> };

// File adapter requires an operator-provisioned, durable directory. We cannot
// establish a Railway volume's durability from a pathname or an environment flag.
export async function withJournal<T>(directory: string, binding: string,
  run: (journal: Journal, save: () => Promise<void>) => Promise<T>): Promise<T> {
  if (!isAbsolute(directory) || process.env.INGEST_STORAGE_DURABILITY !== 'operator-confirmed') {
    throw new IngestError(503, 'persistent storage must be provisioned and confirmed');
  }
  let root: string;
  try {
    root = await realpath(directory);
    if (!(await stat(root)).isDirectory()) throw new Error();
    const marker = JSON.parse(await readFile(join(root, 'storage-manifest.json'), 'utf8'));
    if (marker.version !== 1 || marker.durable !== true || marker.binding !== binding) throw new Error();
  } catch { throw new IngestError(503, 'persistent storage manifest missing or mismatched'); }
  const lockPath = join(root, 'ingest.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new IngestError(409, 'storage locked; check worker ownership before offline recovery'); }
  const path = join(root, 'journal.json');
  const temporary = join(root, 'journal.next');
  try {
    // Never initialize silently: lost/missing journals must not replay old Pins.
    let journal: Journal;
    try {
      journal = JSON.parse(await readFile(path, 'utf8'));
      if (journal.version !== 1 || journal.binding !== binding || !journal.jobs || typeof journal.jobs !== 'object' || Array.isArray(journal.jobs)) throw new Error();
      for (const [key, job] of Object.entries(journal.jobs)) {
        if (!job || job.id !== key || typeof job.videoId !== 'string' || !['queued','sending','unknown','published'].includes(job.state) || (job.state === 'published' && !job.pinId)) throw new Error();
      }
    } catch { throw new IngestError(503, 'journal missing, corrupt or mismatched; restore it before continuing'); }
    const save = async () => {
      const file = await open(temporary, 'w', 0o600);
      try { await file.writeFile(JSON.stringify(journal)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, path);
      const dir = await open(root, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    };
    // A crash after persisting intent may have reached Pinterest. Never retry it.
    let recovered = false;
    for (const job of Object.values(journal.jobs)) {
      if (job.state === 'sending') { job.state = 'unknown'; recovered = true; }
    }
    if (recovered) await save();
    return await run(journal, save);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
