> Historical snapshot. Current deployed fallback and pending editorial release: see EDITORIAL_RELEASE.md and KEVIN_HANDOFF.md. Older local-only statements below describe that earlier checkpoint.

# Buffer candidate — local only

Continues the existing review branch; parent 91f8f74e950e951af9dac1f30ccd966d14f7978e.
This supersedes the earlier OpenPost R1 release proposal for NEW Copilot jobs only.
Existing delegated jobs keep their original adapter. Never reroute an ambiguous delivery.
No push, deployment, public test, or existing queue mutation has been performed.

## Authenticated evidence

Two distinct accounts verified by actual GraphQL account/channels reads on October 24:

| Provider | Account ID | Organization ID | Connected channels |
|---|---|---|---|
| buffer-instagram | 6a976cf614d65def87288c29 | 6a976cf614d65def87288c34 | astel.us / astel.u / leoakastel |
| buffer-threads | 6a7664e36fab588124f27411 | 6a7664e36fab588124f27413 | leoakastel / astel.us / astel.u |

All six had isDisconnected=false, isLocked=false, isQueuePaused=false. This proves API reading and channel connection, not public delivery. The two credentials were saved separately outside Git, mode 0600; no secrets in this handoff. Do not attach the credential directory to a review package.

## Implemented

Buffer GraphQL adapter registered separately per platform in the existing Hub. Prepared Threads text and a single Instagram image supported locally. Reel/Story/carousel deliberately blocked pending format certification. Exact customScheduled time; no addToQueue/shareNow or AI. Existing Hub owner approval and durable idempotency journal reused. Buffer owns scheduling. Intent is durable before create; provider ID checkpoint precedes receipt validation. Lost create acknowledgement holds without retry or fallback. Cancel pre-reads the exact channel/post and only deletes a scheduled post with deletePost permission; requires matching success ID. A missing post alone is never cancellation proof. HTTP errors never leak upstream bodies/tokens.

Request budget stored separately in buffer-budget.json on the same persistent volume. It uses an independent exclusive lock and fsync+rename; no TTL lock stealing. Conservative caps per account: 80 requests per 15 minutes / rolling 24 hours, 2800 per rolling 30 days, 30 mutations/day. These are local caps, not a promise about current Buffer plan limits; other clients share provider quota and 429 stops execution. Default automatic polling is at most one due delivery per account per hour, with persisted fairness. Manual reconciliation also consumes budget.

## Local verification

Node >=22. Run `npm ci --ignore-scripts` then `npm test` (or scripts/verify-offline.sh with a supported Node on PATH). All mocked publisher tests are offline. Existing OpenPost security guard is retained. The local launcher scripts/start-local-buffer.mjs loads the two saved credentials directly into server environment, never prints them, forces loopback binding, writes=false and automatic polling=false. It requires existing operator-provisioned callers/routes/journal; it creates no credentials. It is not a deployment launcher.

## Runtime configuration without secret values

Keep LD_STORAGE_DIR, LD_STORAGE_BINDING, LD_CALLERS_JSON, LD_ROUTES_JSON and LD_MEDIA_HOSTS_JSON. Each new route must select exactly one adapter: buffer-instagram or buffer-threads. No implicit fallback. Keys remain backend-only.

Set LD_BUFFER_INSTAGRAM_ACCOUNT_ID and LD_BUFFER_THREADS_ACCOUNT_ID to the verified account IDs above. Per-platform LD_BUFFER_*_BINDINGS_JSON contains only accountKey/platform/channelId from config/buffer-bindings.example.json. Production LD_BUFFER_INSTAGRAM_TOKEN and LD_BUFFER_THREADS_TOKEN must be transferred through the deployment secret store, not pasted into tables, chat, configuration JSON or Git. LD_BUFFER_ENABLE_WRITES defaults false. A separate concrete deployment/public-test approval is still required.

Provision durable files before startup: existing hub-storage-manifest.json and hub-journal.json, plus buffer-budget.json containing {"version":1,"requests":{}} (0600). Restore the request budget on restart; never recreate it automatically to reset quota. If a process dies with either lock held, prove it stopped before manual lock recovery. One server replica only.

## Remaining acceptance gates

Buffer Post exposes externalLink but no separate platformPostId in the schema verified today. Adapter supports an injected trusted platform confirmer; runtime intentionally has no such confirmer yet. `sent` stays PROVIDER_ACCEPTED with a link, never fabricated PUBLISHED. Production-ready platform ID readback is unresolved.

Instagram media requires an approved public file URL that remains valid until publication. Private Google Drive sharing is unchanged; do not silently publish source files. A safe media delivery path and resource cost remain to be selected.

No production storage/deployment was changed. Persistent Hub volume, any delivery-media resources and incremental Railway cost need concrete review. No new Buffer paid plan or Hosted OpenPost subscription was purchased. Existing Social Engine, migrated Airtable, Meta Development mode and old Threads queues are unchanged.

Public canary material/account/time are not approved. After isolated checks, approve one brand first, then verify each remaining account separately. Stop: pause Hub routes, stop new scheduling and confirm cancellation with Buffer for already delegated jobs. Stopping Hub alone does not cancel provider schedules. Rollback to parent code only after pausing and preserving journal/budget; do not swap providers for existing deliveries.

## Kevin

NOT_SENT. Ready for independent code/test review. Kevin may repeat offline tests and authorized read-only inspection, but cannot mutate production or create public tests. No validated direct recipient/channel has been used.
