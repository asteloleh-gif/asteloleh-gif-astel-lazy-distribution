# Independent Kevin review — prepared, NOT SENT

The exact candidate commit and artifact SHA256 are in the accompanying release manifest. Review branch: `review/unified-distribution-hub-20261024`. Upstream base: `0c713f25d809baeb31be47e535a95321a53d115c`; inherited local audit snapshot: `1100f6d1897d5efb36f19254ee463dfd4fbc31c6`. The original dirty checkout was not overwritten. This candidate is not pushed, deployed or live-accepted.

No verified Kevin endpoint/recipient associated with this project was found. No task/message has been sent and no independent opinion is claimed. Do not confuse unrelated Battle Box chats or a new subagent with the existing Kevin orchestrator.

## Reproduce safely

Unpack source into a disposable directory. Node 22+ and npm are required. Run `sh scripts/verify-offline.sh`. The script installs public locked dependencies with scripts disabled and a temporary HOME, then compiles/runs tests with an empty environment except PATH/HOME/CI. Do not load `.env` or production secrets. No real PostgreSQL is used. All publisher requests in tests are mocked or redirected explicitly to a local loopback fixture. `test/restart-acceptance.test.mjs` starts child Hub processes, retains the same disposable journal across restarts, confirms exactly one delegated schedule, and checks backend cancellation event before a second restart. Temporary processes/files are cleaned up.

Read `docs/DISTRIBUTION_HUB.md`, latest `docs/SELF_HOSTED_COST_AND_MEDIA.md`, ADR 001 and the incremental/full diffs. Check the cost assumptions against measured usage. Verify exact self-hosted-origin guard; `app.openpo.st` must be rejected before credentials leave the process. Verify no AI request path, legacy raw-write bypass, hidden retries/fallback, self-approval or successful-target resend. Check provider publication/job/platform ID distinctions and cancellation evidence.

## Known limits — release blockers

- Single durable filesystem / one replica. Stale process lock needs proven old-process termination and manual recovery, not TTL stealing.
- Real Railway volumes/backup/restore not yet configured or tested. No real OpenPost restart was performed.
- Owner login exists, but zero social accounts and no provider apps are configured. No server credential was created.
- No production Hub → OpenPost authenticated connection yet. Exact running v5.2.2/build was read; image digest is proposed for pinning, not yet applied.
- Native OAuth scopes are broader than publication-only. Do not authorize messaging or other extra scopes by assumption.
- Private Drive → attested OpenPost working-media import and the Airtable/owner approval interaction are not yet connected. Airtable remains editorial; no new cabinet is proposed.
- Post-approval edit isolation has not been certified. Do not set certification booleans merely to make tests/live go green.
- No public canary links/platform IDs exist. No new runtime claim is derived from offline tests.
- Docker image build was not executed locally (Docker unavailable); base image digest and npm lock are pinned.
- Older Social Engine local regression: Leo 255 pass, RU 231 pass, UA 293 pass + 1 skipped disposable PostgreSQL integration. These are local copies, not new production acceptance.

## Independent review boundaries

No production mutation, credentials, access expansion, push/merge, deploy, restart or public test is authorized by this handoff. After a separate concrete release approval, read the actual account queue, exact material/time, provider receipts, real platform post and duplicate checks for each account independently. Capture CANCEL_REQUESTED until backend proof exists. Rolling back Hub does not cancel remote schedules. Preserve working Social Engine auto-replies, Airtable cutover and Meta Development mode; Facebook remains off.
