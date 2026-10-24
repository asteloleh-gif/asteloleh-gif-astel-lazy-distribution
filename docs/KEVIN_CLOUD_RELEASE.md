# Kevin cloud operator — concrete release candidate

## Owner authorization and effect

Owner has explicitly requested full Copilot operations including self-approval, and independence from the Mac. This supersedes the initial read-only restriction for Kevin. No permissions of existing owner or producer identities are expanded.

A dedicated `kevin-cloud` server principal has project `copilot`, all Hub operation scopes, and explicit delegatedApproval. It can submit, preview, review, approve its own exact reviewed digest, schedule, cancel, reconcile, pause/resume Copilot and import editorial materials. It cannot access arbitrary projects, globally pause unrelated projects, retrieve secrets, change infrastructure, or directly call Buffer.

Buffer publishing accepts a valid persisted approval from this specific delegated actor in addition to the existing exact release digests. This authorizes future Kevin-approved materials on configured Copilot routes. It does not create or send any test publication during rollout. Existing callers retain the digest gate. Subteam remains separately disabled and is not a certified publishing route in this release. Instagram video/Reel publishing is not certified; current Buffer adapter supports single-image posts and text-only Threads.

## Services and storage

Update only the existing Railway `astel-lazy-distribution / lazy-distribution / production` service. Keep one replica, existing 1 GB `/data` volume, current journal, queue, provider IDs and public domain. No new scheduler, service, volume, subscription or AI generation.

Image retains pinned Node 22 Alpine base; official OpenAI tunnel-client v0.0.18 Linux amd64 archive is pinned to SHA256 `3c82307316acd93c88a384b62af1d81d3f4cb0efa975f9c0bfaef922866a04c4`. Archive downloaded and checksum independently verified. Entrypoint preserves provisioning and connector canary, starts Hub and a supervised private stdio tunnel process. Health/admin port 8091 binds loopback only. Tunnel receives only its necessary environment, not Buffer keys. Main Hub does not receive the tunnel control-plane key.

Use the EXISTING tunnel `tunnel_6add343036f08191bb2204151d0d84fd` and installed plugin `plugin_asdk_app_6add348fa314819182f03a1b5e09950f`. The new cloud bridge exposes 15 Hub tools; refresh plugin tools after the cloud runtime is ready. Stop only the Mac alias `astel-distribution-read`, then verify from the existing Kevin conversation. Existing OpenReel/GTA6 tunnels are untouched.

## Exact runtime configuration

- `LD_KEVIN_CLOUD_ENABLED=true`
- `LD_KEVIN_TUNNEL_ID=tunnel_6add343036f08191bb2204151d0d84fd`
- `LD_KEVIN_TUNNEL_RUNTIME_KEY`: existing restricted Tunnels Read/Use key, transferred securely
- `LD_KEVIN_HUB_TOKEN`: new dedicated random backend secret, never sent to ChatGPT
- Start command: `node scripts/cloud-entrypoint.mjs`

Existing variables remain unchanged. Do not clear `LD_BUFFER_RELEASE_DIGESTS_JSON`, change shared credentials, restart comment bots, migrate Airtable, or reschedule existing jobs.

## Cost before deployment

Railway bills measured RAM/CPU/network. Official rates checked 2026-10-24: $10/GB-month RAM, $20/vCPU-month CPU, $0.05/GB egress. Illustrative incremental consumption of 0.10–0.25 GB RAM and 0.005–0.02 average vCPU would cost roughly $1.10–$2.90 per 30 days plus egress. This is a planning estimate, not measured production usage or a cap. No spending-limit increase or paid plan purchase is approved. Railway dashboard independently read before release: current compute usage $12.26 / $15.00; remaining headroom $2.74 shared by all existing services. This is not a dedicated connector budget. Keep the $15 limit unchanged. Separate Secure MCP Tunnel price is not established by the documentation. If any paid gate appears, stop and report it.

Source: https://docs.railway.com/guides/right-size-cpu-memory

## Verification and limitations

85 tests pass, including delegated self-approval only when explicitly configured, wrong digest denied, idempotent scheduling, isolated bridge scope, and payload spoofing unable to grant Buffer release. Existing no-duplicate, cancel and restart tests remain green. Official SDK is used by the bridge tests. No public test or queue mutation occurred.

Local Docker/Colima is not installed; the Linux image has not been executed locally. Deployment build/start and cloud tunnel readiness remain live acceptance gates, not claimed as passed. Publish/rollback source commit will be pinned before asking for release approval.

## Rollback / stopping

Stop new Kevin operations by disconnecting its plugin or setting cloud flag false in a separately approved rollback. Roll Hub back to deployed SHA `3de6804361a43432a052859f3f1fc5a76caa6648` with the previous start command while retaining `/data`. Its code ignores the new cloud variables. A code rollback never cancels already accepted Buffer jobs: inspect their IDs and confirm cancellation if intended. Do not start the old Mac read-only tunnel until cloud alias is stopped/removed or proven inactive. Restoring Mac read-only connectivity does not restore cloud operations.

## Pending approval and acceptance

Push this exact review commit without merge, deploy only Hub with the four variables and changed start command, transfer the existing tunnel runtime key, refresh this existing plugin from read-only to operator and rename/describe it accurately. Full rights are already authorized; exact version, costs and deployment are still a separate concrete release approval. No public test is included.

Acceptance requires successful build and runtime, cloud healthy/ready, Mac tunnel stopped, actual tools/call from Kevin's existing chat and safe simulation lifecycle. Report separately any platform confirmation required for write tools. Never claim success merely from Railway Online or local tests.
