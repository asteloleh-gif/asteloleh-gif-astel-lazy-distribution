# One Hub, three control surfaces

Status: local implementation tested; no chat plugin registration, app modification, credential provisioning or deployment performed.

## Owner workflow without Terminal

Kevin prepares a material and requests review. Oleg receives a card containing exact text, media, target accounts, time and immutable digest. Oleg approves that exact digest. Kevin schedules the already approved plan. Buffer owns the schedule; Hub reports the outcome. An edited material needs a new revision and new approval. A missing acknowledgement never authorizes a different executor or another create request.

### A. Kevin — operator

The `kevinOperator(projects)` profile allows submit, review, schedule, status, cancel and reconcile only in assigned projects. It cannot approve, grant itself rights, change secrets or globally pause/resume. Scheduling still requires the stored owner approval. This is a permission profile, not an issued credential or a running Kevin agent. No Kevin recipient has been independently verified, so handoff remains NOT_SENT.

### B. Chat — MCP front door

The existing POST `/mcp` exposes `distribution_inbox`, `distribution_status`, `distribution_events`, `distribution_metrics` and operational tools allowed by the authenticated caller. Tool discovery now filters permissions; enforcement remains server-side even if a caller guesses a hidden action. Kevin's connection must use his operator identity, never Oleg's owner credential or the raw Buffer keys.

No new OpenAI API key is needed merely to expose this deterministic Hub API. The chat host still needs an installed connection and accepted authentication/transport. The current Hub uses bearer authentication and has not been certified or registered as a ChatGPT plugin. Official ChatGPT connection supports OAuth or a Secure MCP Tunnel; choose the compatible transport/authentication during the concrete connection package rather than making this endpoint anonymous.

Official connection reference checked October 24: https://developers.openai.com/api/docs/guides/custom-mcp-server

Chat examples after connection: “Show awaiting approvals”, “Prepare this text for Astel.U at this exact time”, “Show failed deliveries”, “Cancel this scheduled plan”. Approval must come from Oleg's authenticated owner surface. A message authored by Kevin is not owner consent.

### C. Astel app — same HTTP API through its backend

Use `HubClient` from `src/hub/client.ts` on the app backend/BFF. The app's authenticated session determines whether the request is Oleg approval or Kevin operations. Do not trust a role sent by the browser. Do not store owner/Buffer tokens in a mobile bundle, frontend JavaScript, localStorage, an Airtable row or a chat message. No broad CORS access has been enabled.

| App feature | Hub POST route | Request fields | Permission |
|---|---|---|---|
| Queue / approval inbox | /api/distribution/inbox | projectId, optional cursor and limit 1..100 | status |
| Approve displayed exact revision | /api/distribution/approve | projectId, planId, digest | owner + approve |
| Status / receipt | /api/distribution/status | projectId, planId | status |
| Incremental delivery notifications | /api/distribution/events | projectId, after | status |
| Delivery counters | /api/distribution/metrics | projectId | status |
| Cancel delegated plan | /api/distribution/cancel | projectId, planId, optional deliveryId | cancel |

Inbox includes text variants, media references, target times, delivery states and `requiresOwnerApproval` / `canApprove`. Pagination reads do not mutate state or call AI. `eventCursor` is a convenience watermark observed during that inbox read; it is NOT a complete initial snapshot cursor across paginated pages. For reliable synchronization, capture the initial events cursor, read all inbox pages, then replay events from that original cursor and read affected plans. Persist the event cursor only after processing the batch; deduplicate events by sequence. Events are a pull feed, not a configured push-notification delivery channel.

Example backend usage (credentials supplied from the existing secret/session layer):

```ts
const owner = new HubClient(hubOrigin, ownerServerCredential);
const inbox = await owner.inbox('copilot');
// Render a card from the returned exact material, accounts and time.
// Only after an authenticated human clicks Approve on that card:
await owner.approve('copilot', displayedPlanId, displayedDigest);
```

Do not auto-approve on page load, from a notification receipt or by selecting the latest plan implicitly. Refreshing a card must not send a schedule request. A transport timeout means query the existing plan; do not recreate content with a new key.

## Analytics boundary

Available: pending/failed/ambiguous/confirmed-success counts, attempts/retries, delivery history and known provider/permalink receipts. AI calls remain zero for prepared materials. `cost=null` and `insights=null` mean unavailable, not zero cost or zero audience engagement. Likes, views, reach and comment/DM ingestion need a separate verified read source. Current Social Engine comment auto-replies remain independent and unchanged.

## Still required before external operation

Identify the actual Astel app URL/repository and verified Kevin connection. Select the chat transport/authentication and notification delivery surface. No additional Buffer key is required. Provision scoped Hub access only for the selected identities and surfaces, after concrete access approval. Production execution also retains the pending platform-ID confirmation, Instagram media delivery, persistent hosting/cost and approved canary gates documented in BUFFER_HANDOFF.md.

## Owner clarification: existing Astel Core Telegram bot

The owner clarified this is a feasibility question about the existing Telegram bot, not an instruction to build another app or immediately change Telegram production. Preferred fallback: Astel Core consumes Hub events independently of Kevin and delivers approval cards, failure/ambiguity alerts and delivery receipts to Oleg. Buffer remains the only executor for Buffer-owned schedules. Kevin availability is not a prerequisite for receipt delivery or existing provider schedules. New content still needs owner approval.

No new Buffer key or second publishing scheduler is needed. Reuse the existing bot backend and its server-side credentials after identifying the real repository/service and owner chat identity; do not ask the owner to copy a bot token into chat. This connection has NOT been installed.

For a future Telegram implementation, persist the event cursor and notification outbox in durable storage, with sequence-based deduplication independent of Kevin's process. Treat ambiguous message-send acknowledgements explicitly rather than promising exactly-once Telegram delivery. Approve callbacks must validate the actual Telegram owner identity, bind the exact plan/digest/card, reject expired or modified material and use the Hub owner authorization only after that authenticated owner action. A Telegram notification or Kevin-authored text is not approval. Button replay must not create a new plan or bypass Hub idempotency. Telegram's notification consumer must never schedule due posts itself or switch providers after an ambiguous outcome.
