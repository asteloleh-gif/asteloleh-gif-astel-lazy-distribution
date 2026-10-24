import {open,readFile,realpath} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {emptyJournal} from './store.js';
// Explicit first-volume initialization only. Existing or partial state is never reset.
export async function provision(directory:string,binding:string){
  if(!isAbsolute(directory)||!binding)throw Error('STORAGE_CONFIG_REQUIRED');
  const root=await realpath(directory);
  const files:Record<string,unknown>={'hub-storage-manifest.json':{version:1,binding,durable:true},'hub-journal.json':emptyJournal(binding),'buffer-budget.json':{version:1,requests:{}}};
  const present=await Promise.all(Object.keys(files).map(name=>readFile(join(root,name),'utf8').then(()=>true,err=>{if(err.code==='ENOENT')return false;throw err;})));
  if(present.some(Boolean)&&!present.every(Boolean))throw Error('PARTIAL_STORAGE_MANUAL_RECOVERY_REQUIRED');
  if(present.every(Boolean)){
    const manifest=JSON.parse(await readFile(join(root,'hub-storage-manifest.json'),'utf8'));
    if(manifest.version!==1||manifest.binding!==binding||manifest.durable!==true)throw Error('STORAGE_BINDING_MISMATCH');return;
  }
  for(const [name,value] of Object.entries(files)){
    const file=await open(join(root,name),'wx',0o600);try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
  }
  const dir=await open(root,'r');try{await dir.sync();}finally{await dir.close();}
}
if(process.argv[1]?.endsWith('/hub/provision.js')){
  if(process.env.LD_INITIALIZE_STORAGE!=='true')throw Error('EXPLICIT_STORAGE_INITIALIZATION_REQUIRED');
  await provision(process.env.LD_STORAGE_DIR??'',process.env.LD_STORAGE_BINDING??'');
}
