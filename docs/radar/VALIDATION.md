# Validation record — 2026-10-28

Environment: local isolated checkout; Node v24.22.1. After explicit approval, installed existing lockfile dependencies with npm ci --ignore-scripts and isolated playwright-core@1.64.1 with install scripts disabled. No social login or publication, no production config/deployment changes.

## Passed

- 16 Radar coordinator/API/worker tests using Node built-ins; actual SQLite files and loopback HTTP, simulated browser only.
- 2 Hub route integration tests: Radar disabled by default, injection does not intercept health.
- Three parallel worker threads using independent SQLite connections: exactly one claim succeeds.
- Restart persistence, same-account contention, independent accounts, primary grace period, expiry HOLD, stale generation denial, owner recovery, delegated-owner denial.
- Wrong identity, stale evidence, unviewed-video claims, unsafe URLs, wrong language declaration, missing grounding, cross-account duplicate targets/text, five-draft batch ceiling.
- Worker challenge stop and coordinator outage stop; no result write or task completion after lost lease.
- Node syntax checks and git whitespace checks.

## Existing Hub regression subset

Full npm test runs the real TypeScript compiler successfully. Final total: **168/168 passed**. Focused Radar + Hub route + Kevin SDK tests: **28/28 passed**. The SDK test confirms exclusion of worker/recovery/send tools from Kevin discovery.

The first complete run had four existing loopback socket failures, reproduced with the baseline server. Cause isolated to test fixtures replacing the entire environment and removing managed-runtime network settings. Test-only fix preserves an explicit allowlist of runtime network variables while discarding application flags/credentials; the child fixture receives the same filtered environment. Production networking code is unchanged. All previously failing tests and the complete suite then passed.

No Chrome/Chromium executable is available in this workspace. Installing playwright-core does not install a browser. No login/session permission has been requested or exercised yet.

## Not tested / release blockers

- Real Threads search, profile detection and post extraction.
- Instagram navigation/search/identity/post extraction independently.
- Full comments, images, video/audio interpretation: deliberately not certified; explicit unavailable coverage.
- Persistent cloud browser image, secure interactive cloud login, Chromium sandbox support and measured cost.
- Real Mac/Codex worker provisioning and backup handover.
- Actual existing Kevin connector discovery after deployment.

The source is a reviewable MVP candidate, not an operational or fully tested integration.
