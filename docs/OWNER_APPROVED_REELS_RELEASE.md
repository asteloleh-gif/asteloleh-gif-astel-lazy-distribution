# Owner-approved backend workflow — 2026-10-27

Owner authorized completing backend configuration, access and release in this session. Every future publication still requires the owner's exact material approval. This supersedes the local-only release restriction for this package; it authorizes no public test post.

Targets: ONLY existing Hub and astel-assistant, existing review branches, no merge. Existing /data volume and Telegram database; no new infrastructure, subscriptions, AI calls or spending cap changes. Usage-based CPU/API traffic still applies.

Hub: LD_ASAPTEAM_WORKFLOW_ENABLED=true overlays four certified subteam routes and two Drive hosts while retaining existing config. Extends ONLY existing oleg and astel-telegram-reader principals to subteam; missing expected owner fails closed. Kevin has copilot+subteam management, but approve scope/tool is removed from BOTH. Existing YouTube reads stay copilot-only. Kevin prepares/reviews a plan, owner approves its exact digest in signed Telegram, then Kevin may schedule it. Delegated self-approval cannot grant approval because server scope excludes approve. Buffer's release gate trusts only existing oleg approval in this mode (or previously explicitly released digests). No public material is seeded by startup.

ASAP: certified account/bindings from config/reels-release.example.json, strict/Drive/Reels flags=true, explicit media scope ONLY asapleo.ai:instagram and wtffounder:instagram, ASAP_ENABLE_WRITES=true, ASAP_RELEASE_DIGESTS_JSON=[]. Existing global Buffer write configuration stays untouched; new ASAP requires its own switch and exact human approval. Copilot image and Threads paths remain unchanged; Copilot Reels still require a separate media-source migration. Buffer is the sole scheduler.

Existing protected cloud Buffer token is not exported or replaced. Startup executes check-cloud-asap-identity once inside the container, before Hub startup. It logs only bounded public identities/status; mismatch blocks this release. Existing queues are neither read nor mutated by that check. It does not access Startup Orchestrator job 6ade9ad6e4be8a4d86d45afe.

Telegram: DISTRIBUTION_SUBTEAM_ENABLED=true adds /api/distribution/subteam routes and a separate ASAP Team approval button, signed existing owner only, fixed server-side project ID. Notifications poll both projects with separate durable cursors/dedupe. Approval never schedules. Existing /distribution Copilot and YouTube UI/routes stay intact.

Kevin discovery returns 17 tools in this mode: existing 18 minus approve. Stale clients calling approve are denied server-side. Refresh existing plugin metadata/new conversation if discovery is stale; no new plugin or credential required. Backend acceptance is distinct from actual Kevin/Telegram user interface acceptance.

Offline checks: Hub 118 tests, Telegram 104 tests, zero failures. Tests cover no Kevin approval, no dispatch before owner approval, one provider create across repeated command/restart, fixed subteam panel project, signed owner, cross-project denial, and all previous regression tests. No real Buffer mutation occurred in tests.

Rollback: Hub 467d7f85e7237a7325ed15f20cf65d88ac4567eb, Telegram 3141519cd07d2fcff332b181648282d8d081bed5; disable workflow and ASAP write flags, Telegram subteam flag. Keep /data, database, receipts and queues. Rollback does not cancel provider posts. Stop new ASAP dispatch by ASAP_ENABLE_WRITES=false; confirm cancellation of any exact existing provider job separately.

Remaining acceptance after deployment: pinned SHA, startup cloud identity PASS, owner/reader subteam access, Kevin approve forbidden and 17 tools, both projects capabilities, signed-owner panel, existing auto-reply health. No public success claim without a separately approved real post and its independent confirmation. Instagram Buffer sent+link remains PROVIDER_ACCEPTED/providerStatus=sent until independent platform ID proof; no fabricated PUBLISHED.
