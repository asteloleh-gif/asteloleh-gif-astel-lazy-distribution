# Shared Distribution Hub — local candidate, 2026-10-24

Latest owner clarification, endpoint guard, measured cost and media blockers: [SELF_HOSTED_COST_AND_MEDIA.md](SELF_HOSTED_COST_AND_MEDIA.md). This later record supersedes earlier unknown-version/login observations below only where explicitly updated.

## Ownership and acceptance

Executor: Codex, chat `01a16a53-1da1-7c03-bcf3-7fd05d57e21e`.
Existing checkout: `/Users/oleh/Documents/Codex/2026-10-23/task/lazy-distribution-audit`, branch `audit/endpoint-security-20261023`, HEAD `0c713f25d809baeb31be47e535a95321a53d115c`. Existing dirty audit and ingest files were copied, not reset or committed in that checkout. Its earlier associated chat is idle; exclusive handoff was not established. No message was sent to another executor.
Candidate: `/Users/oleh/Documents/Codex/2026-10-23/files-pasted-by-the-user-instagram/work/lazy-distribution-hub-review`, branch `review/unified-distribution-hub-20261024`. Local baseline snapshot `1100f6d` captures the inherited work. Diff against that snapshot contains this Hub implementation; full diff against upstream includes the inherited audit. Neither is pushed or deployed. Original checkout is not represented as integrated.
Remote default HEAD was still `0c713f2` at discovery. The Copilot implementation zip/report named in the brief were not found in Downloads/current outputs and are not claimed as reviewed.

Status: LOCAL_TESTED candidate. Original checkout integration BLOCKED on handoff/review. Live routes BLOCKED on the concrete release prerequisites below; not READY_FOR_CANARY or LIVE_ACCEPTED.

## Reuse map

| Function | Existing module | Decision |
|---|---|---|
| HTTP, public legal pages, source preview | `src/server.ts`, connectors | Adapt; retain deterministic POST preview and source reads |
| Content/connector types | `src/core/types.ts` | Preserve and export new versioned types |
| Durable journal, intent-before-write, atomic rename/fsync | `src/ingest/store.ts` | Reuse design in isolated Hub journal; preserve old journal files |
| Copilot quota/media/approval/unknown-outcome behavior | Social Engine `app/calendar/{contract,worker,postgresRepository,metaPublisher}.js` | Read targeted contracts; retain fail-closed and immutable-approval concepts, no wholesale patch/redeployment |
| Analytics | Social Engine `app/analytics/*`; Edie external | Durable typed events + metrics for polling; no new analytics service or AI |
| Scheduling | OpenPost adapter | Single provider execution owner; no LD due-dispatch worker |
| Production/AI/Hyper Crew | External | Never invoked by prepared-material path |

## Contract and authorization

Authoritative TypeScript definitions: `src/hub/contract.ts`. Required `PlanInput`: version 1, project/brand/content/revision, source provenance, prepared variants, assets with master URL/kind/SHA256/revision/availability, explicit destinations/account/time/timezone, request/idempotency keys, mode. Extra input fields (including credentials, backend URL, approval=true) are rejected. Identity comes from bearer credentials mapped server-side to principal role, scopes and project list. Project/brand/platform/account/mode allowlist comes from server routes. Each target has exactly one `adapter` and `executionOwner=provider`, frozen into the plan.

Producer credentials normally get submit/status only. Review/schedule/cancel/reconcile may be granted to a separate trusted control component. Only owner-role principal with approve scope can approve; submitter identity cannot approve its own draft. A shared owner token must never be given to a producer. Approval record is server-created and binds canonical SHA256 of the exact full envelope. Editing uses new content revision and a new approval. Identical idempotency-key/payload returns the existing plan; different payload conflicts. Same content/revision cannot reserve new delivery by choosing a new key. No old Airtable Approved row is imported as authority.

## HTTP and MCP API

All control actions are authenticated POSTs. HTTP: `/api/distribution/{action}`, JSON arguments. MCP: `/mcp`, JSON-RPC initialize/tools/list/tools/call; tool names `distribution_{action}` call the same service and scopes. Stateless JSON transport; no SSE callbacks or separate MCP publisher. Errors use safe codes and HTTP status. Body max 128 KiB; control caller max 60/min; server request timeout 15s; backend timeout 15s, redirects forbidden. Legacy preview is rate limited 30/min and cannot call AI.

Every action takes `projectId`:

| Action | Additional arguments | Result |
|---|---|---|
| capabilities | none | allowed routes + adapter readiness |
| submit | input: PlanInput | persisted immutable Plan |
| preview | input | local validation, zero publication / AI / journal mutations |
| review | planId | validated NEEDS_APPROVAL and digest |
| approve | planId, digest | owner approval of exact reviewed digest |
| schedule | planId | one provider submission per reserved target |
| status | planId | per-target state, provider and platform IDs when known |
| cancel | planId, optional deliveryId | local cancel before dispatch, backend-confirmed cancel afterward |
| reconcile | planId, optional deliveryId | read stored provider IDs only; never retry an unknown send |
| pause/resume | optional accountKey or global=true | durable distribution pause, owner only; global requires access to every configured project |
| events | optional after sequence | max 500 project-filtered events for initiator/Edie cursor polling |
| metrics | none | pending/failed/ambiguous/success/attempt/retry counts; cost and insights unknown=null |

Scopes are independently enforced; capabilities/status do not grant writes. Public GET `/health` is process availability, not delivery proof. No new public GET mutates state or runs paid generation. Old `/api/publish`, `/api/ingest/*` return 410; sandbox-smoke remains 410. Legacy ingestion scheduler no longer starts. This retires its bypass in the candidate only; production is unchanged. Old YouTube/Pinterest publication must later enter a reviewed Hub adapter, not be re-enabled as an independent sender.

## Persistence and recovery

Schema v1 in `src/hub/store.ts`: binding, plans, request-key index, delivery reservation index, pauses, events/outbox sequence and reconciliation cursor. Each plan embeds exact payload, digest, server approval, frozen target/adapter/owner, states, attempt count, intent timestamp and receipt. Reservation + plan + audit event share one file transaction. Before first remote mutation, DISPATCHING intent is fsynced. Provider ID is checkpointed before schedule. Crash/timeout cannot authorize another adapter or another submission. HTTP 200/job ID never means PUBLISHED; confirmed provider readback must contain platform post ID.

File adapter requires a provisioned existing durable absolute directory with `hub-storage-manifest.json` `{version:1,binding:<isolated name>,durable:true}` and explicit initial `hub-journal.json` equivalent to `emptyJournal(binding)`. It never initializes a missing journal on server startup. Manifest is an operator attestation, not proof that Railway storage is durable. No production directory/volume has been provisioned by this work.

Only one replica on one durable filesystem is supported. Exclusive `hub.lock` plus fsync+atomic rename protects cross-process transactions; second concurrent caller gets 409 and may read status/retry its command later. No lease TTL can steal the lock. After a crash, stop/prove termination of the old process, snapshot storage, inspect DISPATCHING/provider IDs, remove only the stale lock, then reconcile. Never delete journal/reservations or replay unknown sends. Missing/corrupt storage fails closed. This deliberate recovery requirement trades availability for duplicate prevention. Multi-replica HA would need a transactional shared store and is not claimed.

Optional server status reconciler (`LD_RECONCILE_ENABLED=true`) polls only active jobs with known IDs, at most 5 per minute, rotating a persisted cursor. It never calls submit or acts as another due scheduler. Currently not enabled. Missing provider ID remains AMBIGUOUS_HOLD for manual reconciliation. Same-state polling does not append duplicate delivery events. No external notification/callback channel is connected. Edie/initiator can consume authenticated events/metrics; unknown cost is never zero.

## OpenPost installed preflight

Read-only discovery 2026-10-24: Railway project `4a6245f3-650c-40f4-bcc2-c5ffa1b73e27`, LD service `0b6d6df1-45fc-4996-823a-fc82e5113bee`, OpenPost `73e2fde8-35de-449f-897e-93b925655566`. No staged changes, no mounted volumes reported for either service. LD deployment source is old `f807dde6`; local code is not deployed. OpenPost image is `ghcr.io/getopenpost/openpost:latest`; immutable digest/application build version not established. GET `/api/v1/ready` reports database ok. GET `/openapi.json` reports API contract 1.0.0, which is NOT the installed application version. No authenticated account discovery was possible without a dedicated authorized connection; no credentials were read or minted.

`OpenPostHttpPort` follows the installed schema: GET accounts with workspace, POST publications (draft), POST validate, GET exact readback, POST schedule(expected_revision), GET status, POST cancel(expected_revision) then readback. One publication per target prevents partial-target replay. Idempotency keys are delivery-scoped. No automatic retries, publish-now, account creation or URL/media import. Media must already have operator-attested OpenPost media ID mapping to the approved digest/revision. Profiles/account IDs (including explicit text/image/Reel format) are operator bindings, not guessed producer values. Text-card generation is explicitly off. Mutable UI edits after approval block certification until isolation is demonstrated. Default runtime adapter is BLOCKED.

Sources: installed `https://openpost-production-77ea.up.railway.app/openapi.json`; `https://openpo.st/docs/automate/api`; `https://openpo.st/docs/automate/api/publications`. Current docs were used as workflow context; exact installed schema and release preflight control live acceptance. Source schema snapshot/hash are in the review package.

## Route register (no live route enabled)

| Client / target | Adapter | Schedule owner | Acceptance |
|---|---|---|---|
| Copilot astel.us / Threads text | OpenPost | provider | offline fixtures pass; live BLOCKED |
| Copilot astel.us / Instagram image/Reel | OpenPost, attested media only | provider | image and Reel HTTP flows mocked; live BLOCKED pending media acceptance |
| astel.u RU, leoakastel EN | same shared contract | provider when separately accepted | not connected; existing comments untouched |
| mock-project | same mock adapter | mock provider | offline isolation checked |
| GTA6/game/other production | none | none | untouched |

Auto-replies are not content deliveries and keep their existing workers/dedupe. UA publication calendar stays simulation-only. No old queue, Redis, PostgreSQL, Airtable, Meta grant or social token was changed.

## One release package — actions / targets / reasons

1. Handoff/review and authorized integration of this candidate into the existing LD checkout. No push/merge approval is inferred. Preserve inherited audit work; review full and incremental diffs separately.
2. Provision/confirm isolated durable storage and backup/restore for LD and existing OpenPost; verify immutable OpenPost image/version/schema, release/update and encryption-key restore requirements. Neither service currently reports a volume; do not upgrade `latest` silently. No new paid service requested/created now.
3. Provision least-privilege server-side LD caller credentials (separate producer and human owner) and dedicated workspace-bound OpenPost integration token; validate actual account IDs/readiness. Do not paste tokens into chat. Existing Copilot PATs/Meta tokens remain untouched. Verify app grants per brand; UA Instagram publishing permission is a known unresolved prerequisite.
4. Certify post-approval edit isolation and media digest/revision-to-ID mappings. Configure only the first accepted brand/routes; certification is operator evidence, not a client flag. Runtime names: LD_STORAGE_DIR/BINDING, LD_CALLERS_JSON, LD_ROUTES_JSON, LD_MEDIA_HOSTS_JSON, LD_OPENPOST_ORIGIN/TOKEN/WORKSPACE, LD_OPENPOST_ACCOUNTS_JSON, LD_OPENPOST_MEDIA_JSON, LD_OPENPOST_CERTIFICATION_JSON. Optional status polling via LD_RECONCILE_ENABLED. No values of secrets are in artifacts.
5. Inventory old pending/processing/ambiguous jobs and their external IDs; choose one owner only for new accepted content on switched routes. Do not copy old approvals, clear safety state, stop comment workers or replay history.
6. Approve exact deployment revision and one exact canary material/account/schedule. Verify platform ID + actual platform readback + no duplicate + old/new route exclusivity + comments still healthy. Only then READY_FOR_CANARY → LIVE_ACCEPTED; other brands require their own acceptance. Choose owner notification/Edie ingestion channel separately; none is claimed operational now.

Rollback: pause LD distribution first; inspect/reconcile provider-accepted schedules and confirm cancellation if needed. Rolling back code does not cancel remote jobs. Keep journal, approvals, provider IDs, events and backup; never revive old dispatcher for an uncertain target. Existing auto-replies stay running. No production release actions performed.

## Test evidence

Baseline inherited LD: build + 8 tests passed, 0 skipped. Final candidate: build + 38 tests passed, 0 skipped. Existing local Social Engine copies: Leo 255 passed, RU 231 passed, UA 293 passed / 1 skipped (disposable PostgreSQL integration not configured), zero failures. Commands ran with sanitized environment; Social Engine used Node 24.20.0 and the included external-network guard. This verifies local copies, not a new production acceptance. git diff --check passes. Original LD file contents were compared with the inherited snapshot and are unchanged.
