# Kevin private read connection — approval candidate

## Implemented and checked

Official MCP SDK 1.32.2 stdio bridge in `scripts/kevin-read-bridge.mjs`; Mac launcher in `scripts/kevin-read-bridge-mac.sh`. This uses the existing Hub over authenticated HTTPS and forwards only five actions for project `copilot`: capabilities, inbox, status, events and metrics. It is not a new bot, scheduler, queue or panel.

The bridge refuses upstream credentials whose tool discovery exposes any write tool; it rejects other projects, unknown tools, extra arguments and malformed results. Secrets stay in owner-only files, never in process arguments or reports. Exceptions returned to clients are sanitized.

78 offline tests pass. A separate official SDK stdio probe against the live Hub returned all five read results, three inbox materials and exact approved canary state PROVIDER_ACCEPTED. Write and foreign-project requests were denied. That probe is NOT Kevin acceptance.

## Exact pending access package

- Create one private Secure MCP Tunnel named `Astel Lazy Distribution — Read only` in personal Platform organization `org-rGsEro43dLebujei0hhn9Y82` and ChatGPT workspace `9f4fe546-62b2-4804-9a8f-fa1e9395e686`, verified from the owner's current tunnel settings. Existing OpenReel and GTA6 tunnels stay unchanged.
- Provision one restricted tunnel runtime key with Tunnels Read + Use and no model API, key-management or tunnel-management scopes. Provider RBAC may apply at organization scope, not only the individual tunnel; verify the actual permissions UI before saving. Do not store admin credentials in the daemon.
- Store the runtime key outside Git at `/Users/oleh/.config/astel-distribution/kevin-tunnel-runtime.key` (0600). Owner does not send it through chat.
- The private bridge uses the existing status-only Hub caller already used for Telegram read polling. Create an owner-only wrapper file `kevin-hub-reader.json` containing projectId copilot and that reader token; it is never passed to ChatGPT. This deliberately shares the existing reader identity, so revoking it affects Telegram reads too; stopping this tunnel disables Kevin alone.
- Start one managed local tunnel-client runtime alias `astel-distribution-read`, version 0.0.15+a390c168ff1b2d14e73a95991c186c6aba3ff5a0, using the checked Mac launcher. Use `tunnel-client runtimes connect`; do not use nohup/disown or inbound public ports.
- Finish the private ChatGPT custom MCP plugin form using Connection: Tunnel, the new tunnel ID, and no additional per-tool OAuth on this private stdio transport. This does NOT disable authentication on the public Hub: OpenAI tunnel authorization gates the private connection and server-side Hub bearer authorization remains mandatory.
- No Railway push/deployment, new hosted service, new subscription, public posts, approval/schedule/cancel tools, Buffer secret exposure or Subteam publication in this package.

## Runtime / costs / limitations

Mac must remain awake and connected; no unattended availability after shutdown/restart is claimed. Telegram and the production Hub continue independently when this bridge is offline. This consumes local resources, network and Hub read requests; no model API generation is used by the bridge. Official tunnel documentation does not establish a separate dollar price, so no zero-cost guarantee is made. Do not buy a paid tier or raise a spending limit. Hosting it on Railway later is a different release/cost decision.

## Rollback

`tunnel-client runtimes stop astel-distribution-read` disconnects Kevin without touching Hub or Telegram. Disconnect the new plugin and revoke only its tunnel runtime key if needed. Do not revoke the shared Hub reader token as a Kevin-only rollback. No remote publishing jobs are changed.

## Acceptance still pending

Verify managed runtime running + healthy + ready, select the tunnel in the owner's ChatGPT workspace, then invoke real capabilities, inbox and status from the EXISTING Kevin conversation. Do not substitute another chat, Codex or an API agent. Report server / transport / authorization / client registration / Kevin invocation separately. Neither a green runtime nor SDK live probe completes this acceptance.

Official references:
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.openai.com/plugins/deploy/connect-chatgpt
