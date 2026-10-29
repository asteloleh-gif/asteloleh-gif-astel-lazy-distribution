import { open, readFile, rename, unlink, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { Plan, Event } from './contract.js';
import { fail } from './contract.js';
export type Journal = { videoPlanning?: Record<string,import('./video-planner.js').PlannerRecord>; videoWorkspace?: import('./video-workspace.js').VideoJournal; version: 1; binding: string; plans: Record<string,Plan>; keys: Record<string,string>;
  deliveries: Record<string,string>; pauses: Record<string,boolean>; reconcileCursor?: number; bufferReconcileAt?:Record<string,number>; events: Event[] };
export const emptyJournal = (binding:string):Journal => ({version:1,binding,plans:{},keys:{},deliveries:{},pauses:{},events:[]});
export interface Store { transaction<T>(run:(j:Journal,save:()=>Promise<void>)=>Promise<T>):Promise<T> }
// Single-instance durable file transaction, based on the existing ingest journal.
// Stale lock is NEVER stolen by TTL. Operator must prove prior process is stopped.
export class FileStore implements Store {
  constructor(readonly directory:string,readonly binding:string) {}
  async transaction<T>(run:(j:Journal,save:()=>Promise<void>)=>Promise<T>):Promise<T> {
    if(!isAbsolute(this.directory)) return fail('DURABLE_STORAGE_REQUIRED',503);
    const root=await realpath(this.directory).catch(()=>fail('STORAGE_UNAVAILABLE',503));
    const manifest=await readFile(join(root,'hub-storage-manifest.json'),'utf8').then(JSON.parse).catch(()=>fail('STORAGE_MANIFEST_REQUIRED',503));
    if(manifest.version!==1||manifest.binding!==this.binding||manifest.durable!==true) return fail('STORAGE_BINDING_MISMATCH',503);
    const lockPath=join(root,'hub.lock');
    const lock=await open(lockPath,'wx',0o600).catch(()=>fail('STORAGE_LOCKED_MANUAL_RECOVERY_REQUIRED',409));
    try {
      const j:Journal=await readFile(join(root,'hub-journal.json'),'utf8').then(JSON.parse).catch(()=>fail('JOURNAL_RESTORE_REQUIRED',503));
      if(j.version!==1||j.binding!==this.binding||!j.plans||!j.keys||!j.deliveries||!j.pauses||!Array.isArray(j.events)) return fail('JOURNAL_INVALID',503);
      const save=async()=>{
        const file=await open(join(root,'hub.next'),'w',0o600);
        try {await file.writeFile(JSON.stringify(j));await file.sync();}finally{await file.close();}
        await rename(join(root,'hub.next'),join(root,'hub-journal.json'));
        const dir=await open(root,'r');try{await dir.sync();}finally{await dir.close();}
      };
      return await run(j,save);
    }finally{await lock.close();await unlink(lockPath);}
  }
}
