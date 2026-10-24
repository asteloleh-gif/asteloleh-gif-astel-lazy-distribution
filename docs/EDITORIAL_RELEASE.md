# Editorial bridge release — approval pending

Continues review/unified-distribution-hub-20261024 from deployed 65500fc. No replacement project, calendar scheduler, social reply rewrite or new cabinet. Current production remains the accepted Telegram fallback. Exact candidate SHA/diff/test evidence are in the release artifact manifest.

## Existing integration and new path

Airtable Astel.Oleh / Astel Social Engine — Astel.US UA: appdOfW2woP9FaUX4 / Publication Calendar tblisryw0mqPV4SK3. Four legacy rows remain unchanged. Added Distribution Hub (checkbox), Hub Plan ID, Hub State, Hub Digest. A new Simulation/Draft row recf6h75AXup4jDaU is available for rehearsal. No production importer is enabled yet.

POST /api/distribution/importeditorial (or MCP distribution_importeditorial), authenticated producer with editorial+submit+review+status scopes, imports opted-in materials and writes Hub-only result fields. No timer, no scheduler, no AI. Request is rate limited to one/minute, pagination bounded to ten pages with repeated-cursor detection; 401/403/429 stops further requests until explicit operator recovery. Do not restart to evade a quota.

Only fresh Threads/Text material with legacy Approval=Draft and no legacy Job ID, Source Record ID or Source Approval is accepted. Existing Approved/Request review rows are rejected. Keep Approval=Draft permanently for Hub-owned records; do not grant a second scheduling owner. No copied historical record may be marked for import. Record revision is part of deterministic idempotency identity; edits in the same revision fail with IDEMPOTENCY_CONFLICT. Changes after approval require a new revision and fresh owner approval. A second read precedes writeback; writeback never copies approval or overwrites legacy Result/Job ID. Removing opt-in does not cancel a plan or Buffer job: request cancellation through Hub, then verify provider evidence.

## Configuration and credentials — no values

- LD_EDITORIAL_ENABLED=true only after approved rollout.
- LD_EDITORIAL_BINDINGS_JSON: one UA base/table/project/brand/account binding plus scoped Airtable records read/write credential. Hub only uses the configured table; PAT resource permissions are base-level. No other base or schema grant.
- New backend producer caller, initially editorial+submit+review+status only. Schedule/cancel/reconcile scopes enabled only for the approved canary phase; never approve scope. Existing Telegram owner remains the approval authority. Never put its keys in GPT text, Airtable, browser JS or Git.
- LD_THREADS_READ_BINDINGS_JSON: existing UA Threads read credential plus verified own user ID/username/accountKey. GET only to graph.threads.net/v1.0. No Meta app/mode/permission change; fail closed if existing token cannot read own posts. Do not grant discovery/publishing scopes for readback.
- LD_BUFFER_ENABLE_WRITES stays false for rehearsal. For the public phase set true AND LD_BUFFER_RELEASE_DIGESTS_JSON to exactly the separately approved material digest. Runtime defaults digest list to empty. Other plans cannot issue creates. Cancellation still requires enabled writes and exact provider ID/channel/allowedActions proof.
- Existing 1GB /data volume, journal, budget and PostgreSQL remain. No extra service, storage subscription, AI generation or limit increase. Metered existing CPU/RAM/network and Airtable/Meta/Buffer API quotas still apply. Do not create a high-frequency Airtable polling loop.

## Sequential acceptance

1. Owner grants the bounded release/access package. Push review branch without merge; deploy only Hub candidate on same service/volume with the corrected shell startup command. Telegram SHA unchanged. Explicit source ID/username readback before enabling platform confirmer.
2. Import only the new simulation row. Owner opens existing Telegram MiniApp and approves it. Operator schedules simulation (no provider call), reruns import, confirms Hub State=SIMULATED. Repeat and recreate clients against existing durable journal; no duplicate plan. Real restart/cancel abuse tests remain isolated, not production disruption.
3. After approved exact public canary: prepare revision 2 / Live / exact agreed time, import/review, owner approves that exact digest, enable only that digest, schedule once through Buffer. Existing Buffer queues remain intact; never addToQueue or shareNow. A missed time requires a new proposal, not immediate or next-day sending.
4. Read exact provider post/channel/text/time. When Buffer says sent, read Threads identity and own top-level posts, match canonical permalink+owner+text+timestamp and store true numeric platform ID. Without evidence keep PROVIDER_ACCEPTED; never fabricate success. Repeated schedule does not create again. Sync Hub-only status back to Airtable. Telegram delivers final event. Verify three existing Instagram pollers remain healthy. Repeat independently for remaining brands only after their own canary approval; Instagram media needs separately approved stable delivery URL and certified format.

## Stop and rollback

Stop new creates by disabling writes / clearing release digests; this does not cancel delegated schedules. Explicitly cancel each known pending delivery through Hub and verify matching Buffer delete acknowledgement. Lost create/delete acknowledgement stays held; no fallback/retry through another provider. Preserve /data journal and budget. Roll back Hub to 65500fc on the same volume with corrected /bin/sh command; disable editorial flags, retain row history. Telegram and Social Engine are unchanged. Do not remove fields/rows or revoke old working credentials during rollback.

## Evidence boundaries

68 offline tests passed, zero skipped. Real Airtable simulation row was independently read; isolated durable Hub rehearsal produced one SIMULATED plan, repeated import/restart preserved identity, provider/AI calls zero. Real Airtable writeback, production importer, actual Threads read credential binding and public publication remain pending this release. Prior fallback deployment is already live accepted.

Threads primary API references: https://developers.facebook.com/docs/threads/retrieve-and-discover-posts/retrieve-posts/ and https://developers.facebook.com/docs/threads/reference/user/ . No external URL from provider pagination is followed.

Kevin package prepared; NOT_SENT. No verified Kevin recipient or channel exists in this session. Reviewer can reproduce offline checks and read approved live evidence; cannot approve/publish/change production under this handoff.
