import {readFile,stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
// Run only after explicit journal/caller/route provisioning. Never creates owner credentials.
if(!process.env.LD_STORAGE_DIR||!process.env.LD_STORAGE_BINDING||!process.env.LD_CALLERS_JSON||!process.env.LD_ROUTES_JSON)
  throw Error('Provision durable Hub storage, caller authorization and explicit routes first');
for(const platform of ['instagram','threads']){
  const prefix=`LD_BUFFER_${platform.toUpperCase()}`;
  const file=join(homedir(),'.config','astel-distribution',`buffer-${platform}.key`);
  const mode=(await stat(file)).mode&0o777;
  if(mode!==0o600)throw Error('Buffer credential file must have mode 0600');
  process.env[`${prefix}_TOKEN`]=(await readFile(file,'utf8')).trim();
}
// Local smoke defaults cannot publish or expose a listener to the LAN.
process.env.LD_BUFFER_ENABLE_WRITES='false';
process.env.LD_RECONCILE_ENABLED='false';
process.env.LD_LISTEN_HOST='127.0.0.1';
await import('../dist/index.js');
