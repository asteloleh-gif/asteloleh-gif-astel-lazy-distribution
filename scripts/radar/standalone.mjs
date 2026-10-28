import {createServer} from 'node:http';
import {configuredRadar} from './api.mjs';
// Development/local coordinator only. Production reuses Hub auth and HTTPS ingress.
if(process.env.RADAR_ENABLED!=='true')throw Error('RADAR_DISABLED');
const token=process.env.RADAR_OPERATOR_TOKEN;if(!token||token.length<32)throw Error('OPERATOR_TOKEN_REQUIRED');
const api=configuredRadar([{token,principal:{id:'local-owner',role:'owner',projects:['copilot'],scopes:['status','submit']}}]);
const server=createServer(api);server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(Number(process.env.RADAR_PORT||8092),'127.0.0.1',()=>console.log('Radar local coordinator ready'));
