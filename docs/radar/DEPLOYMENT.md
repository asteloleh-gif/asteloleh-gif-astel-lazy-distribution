# Radar deployment and acceptance

This is a proposed deployment, not an instruction to deploy without the owner's dependency/access approval.

## Exact dependency decision

Coordinator: no new npm package; built-in `node:sqlite`, `node:http`, crypto and filesystem. Requires Node >=22.13, browser worker tested with the same major 24 runtime as offline tests.

Existing Hub verification dependencies are those in the committed package-lock.json: `@modelcontextprotocol/sdk` 1.32.2 and the locked TypeScript/tsx/Node types development tools. Proposed install for verification: `npm ci --ignore-scripts`; no app startup. Executed after explicit owner approval on 2026-10-28; TypeScript build passed.

Approved and installed separately for verification: official Microsoft `playwright-core@1.64.1`, Apache-2.0. Version checked against the official v1.64.1 release dated 2026-10-14. Use existing normal Google Chrome where available, or separately approve the matching official Chromium binary/system libraries. No custom Chromium patches, CloakBrowser, extensions or proxies. The worker imports only an explicitly configured absolute module path; it never installs/downloads a browser on startup. No package added to the Hub dependency graph.

Sources:
- https://github.com/microsoft/playwright/releases/tag/v1.64.1
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/docker
- https://www.sqlite.org/lang_transaction.html
- https://docs.railway.com/guides/volumes

## Main cloud, then backups

1. Deploy optional coordinator into the existing single-replica Hub only after full regression/typecheck and concrete release approval. Keep existing /data volume and all distribution flags/credentials unchanged. Set RADAR_DB_PATH=/data/radar/radar.sqlite; initialize a separate Radar DB, never migrate the Hub journal.
2. A browser worker is a distinct process from Kevin's conversational runtime. Start on suitable persistent cloud compute only after verifying Chrome sandbox, user-visible manual login method, private profile persistence, RAM/CPU and actual costs. Do not assume Railway's current Hub image provides a browser or a login desktop. No cloud browser worker deployment is certified yet.
3. Mac backup: same worker code, local normal Chrome, separate profile directories, separate worker token. Use launchd only after approval; it works while the Mac is awake. It does not become a second coordinator.
4. Codex backup: same CLI/worker if approved package, browser, session storage and secure coordinator credentials are available. Ephemeral Codex runtime is not a 24/7 server. Loss of runtime leaves task yellow for owner recovery.

## Coordinator config (names only; never commit values)

RADAR_ENABLED=true
RADAR_DB_PATH=/data/radar/radar.sqlite
RADAR_WORKERS_JSON: array of {id, token, primary, accounts}. Primary cloud worker is the only primary=true; Mac/Codex are false. Tokens are unique random secrets >=32 characters, different from Hub tokens. Configure exactly the permitted registry account keys. Do not insert test secrets or placeholders in production.

The existing Kevin cloud process receives only RADAR_ENABLED plus its existing Hub token; worker secrets are not forwarded to the tunnel. Existing operator principal must have project copilot and scopes status/submit. Existing owner principal must have status for resume. Only owner gets recovery permission; delegated publication approval does not grant Radar recovery.

## Executor config (names only)

RADAR_URL: HTTPS origin of the existing Hub, no path/query/credentials; localhost HTTP allowed only for offline testing.
RADAR_TOKEN: distinct worker token, from secure environment.
RADAR_PROFILE_ROOT: absolute private local directory outside checkout.
RADAR_PLAYWRIGHT_MODULE: absolute entrypoint path of approved installed playwright-core.
RADAR_BROWSER_AUTHORIZED=true: only after explicit browser/session authorization.
RADAR_HEADLESS=false: first test uses a visible browser; unattended mode must be separately verified.
RADAR_BROWSER_CHANNEL=chrome (default); chromium is opt-in with approved official bundled browser.

After approval and configured environment:
```sh
node scripts/radar/worker.mjs TASK_ID
# Resident worker consumes only already-created read tasks, no social schedule:
node scripts/radar/daemon.mjs
```

CLI for Codex/operator, using its own scoped Hub credential in RADAR_TOKEN:
```sh
printf '%s' '{}' | node scripts/radar/client.mjs capabilities
printf '%s' '{"account":"leoakastel:threads","batch":"pilot-001","query":"AI automation"}' | node scripts/radar/client.mjs create
```

No real login was performed. For approved manual login, claim a dedicated setup task with the worker identity; set RADAR_LOGIN_AUTHORIZED=true and use `node scripts/radar/login.mjs TASK_ID`. Password/MFA entry happens only in the visible browser. Use the reserved query `manual login setup only`. It holds the account lock and finishes as SETUP_COMPLETE only after identity verification and successful browser close. Failures stay HOLD; owner verifies stop before recovery. Setup tasks are excluded from the daemon and ordinary claims. No session upload. CAPTCHA/block stops automated actions; never add bypass steps.

## Acceptance gates

- Full `npm test` and `npm run build` with committed dependencies; new `npm run test:radar`.
- MCP in-memory tests verify Radar absent by default and present when explicitly supplied, no send/claim/recovery tools exposed to agent.
- Hub disabled route returns 503, normal distribution capabilities unchanged.
- Live initial account exact identity verified; harmless search and one post context read through normal UI; no composer opened.
- Instagram tested independently. Unsupported selectors produce a clear stop; never infer Instagram readiness from Threads.
- Choose <=5 Threads and <=5 Instagram candidates per batch; compare author/date/text against UI. Skip inaccessible/low-value content. Explicitly disclose unviewed media and incomplete replies.
- Confirm no social writes using tool trace and direct visual review. Never send a canary comment in this MVP.
- Stop cloud worker during a disposable read; yellow appears; Mac cannot steal. Confirm old browser stopped, owner resume, Mac continues checkpoint. Repeat with Codex.
- Expired worker attempts result write: rejected. Same account concurrent task: rejected. Separate account: permitted.
- Restart coordinator using same disk; tasks/evidence/drafts survive. Never test against live Hub publication queue.
- Measure actual cloud resource usage before enabling persistent worker. No paid plan increase/API subscription is authorized by the code.

## Rollback

Disable Radar worker processes first and verify browsers closed. Disable RADAR_ENABLED in a separately approved config change; existing Hub routes retain their implementation. Preserve Radar DB privately for recovery; do not delete distribution journal, queue or browser profiles. Do not replace Hub with standalone.mjs. The standalone server is only a loopback development fixture.

## Known limitations

No real social session/search/media QA yet. Cloud login UI/compute location is unresolved. No automatic video interpretation, full reply extraction, autonomous model budget or future sending module. Draft language/grounding declarations have basic validation, but factual and editorial quality require the agent's review. No deployment claimed until these gates pass.
