// Disposable local test fixture, not a production runtime configuration.
import {createAppServer} from '../../dist/server.js';
import {DistributionHub} from '../../dist/hub/service.js';
import {FileStore} from '../../dist/hub/store.js';
import {OpenPostAdapter} from '../../dist/hub/openpost.js';
import {OpenPostHttpPort} from '../../dist/hub/openpost-http.js';
process.env={};
process.on('message',({directory,providerOrigin})=>{
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(providerOrigin))throw Error('LOCAL_FIXTURE_ONLY');
 const transport=(url,opts)=>{const u=new URL(url);if(u.origin!=='https://fixture.example')throw Error('EXTERNAL_NETWORK_FORBIDDEN');return fetch(providerOrigin+u.pathname+u.search,opts);};
 const port=new OpenPostHttpPort('https://fixture.example','offline-provider-fixture','workspace-1',[{projectId:'copilot',accountKey:'astel.us:threads',platform:'threads',format:'text',providerAccountId:'account-1',platformAccountId:'platform-account',username:'astel.us',contentProfile:'short_text',outputProfile:'threads.post'}],[],transport);
 const adapter=new OpenPostAdapter(port,{versionPinned:true,storageVerified:true,accountsVerified:true,approvalEditIsolation:true});
 const hub=new DistributionHub(new FileStore(directory,'restart-fixture'),[{projectId:'copilot',brandId:'astel.us',platform:'threads',accountKey:'astel.us:threads',adapter:'openpost',executionOwner:'provider',mode:'live'}],[],{openpost:adapter});
 const credentials=[{token:'producer-fixture-'.repeat(3),principal:{id:'producer',role:'producer',projects:['copilot'],scopes:['submit','review','status','schedule','cancel','reconcile']}},{token:'owner-fixture-'.repeat(3),principal:{id:'owner',role:'owner',projects:['copilot'],scopes:['approve','status']}}];
 const server=createAppServer({hub,credentials}).listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
});
