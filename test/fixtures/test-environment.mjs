// Keep runtime network plumbing while removing application credentials and flags.
// Replacing the entire environment breaks loopback networking in managed runtimes.
export function isolatedTestEnvironment(env=process.env){
 const keys=['NODE_TEST_CONTEXT','NODE_USE_ENV_PROXY','NODE_EXTRA_CA_CERTS','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','CODEX_NETWORK_ALLOW_LOCAL_BINDING','CODEX_NETWORK_PROXY_ACTIVE','CODEX_PROXY_CERT','CODEX_SANDBOX_NETWORK_DISABLED'];
 return Object.fromEntries(keys.filter(key=>env[key]!==undefined).map(key=>[key,env[key]]));
}
