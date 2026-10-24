# Astel Family read connection candidate — 2026-10-24

Owner decision: preserve the existing channel name, branding and videos. Connect Astel Family to the existing Lazy Distribution Hub for Kevin and Telegram. The second channel is provisionally called ASAP Team; no second channel identity or grant has been verified. Do not rename or reuse the active `ASAP GTA6 Local Drive` OAuth client.

## Verified infrastructure

- Channel: https://www.youtube.com/@AstelFam
- Channel ID: `UCMWFPgFfuNKRQqXzbCqGZhA`
- Owner Chrome profile Astel: `family.astel@gmail.com`; owner management link exposed the exact channel ID.
- Infrastructure Google Cloud project: `astel-lazy-distribution`, number `906669107515`, accessed under `astel.oleh@gmail.com` after owner completed 2SV.
- YouTube Data API v3 and YouTube Analytics API already enabled. No new project, billing account, trial, subscription or hosting service created.
- OAuth audience is External / Testing; `family.astel@gmail.com` was added after explicit owner approval; other test users preserved. Refresh grants in Testing expire after seven days; this is a temporary connection verification, not a durable unattended production setup.
- Existing Hub base commit: `afc3a486f5d3173c9b590ef582deb9efda504f7b`. Existing production and its 15 Kevin commands have not been changed by this candidate.

## Prepared locally, not connected or deployed

`src/hub/youtube-connection.ts`: refreshes an explicitly supplied per-channel grant; verifies `channels.list(mine=true)` matches the immutable binding before reading uploads or analytics; traverses all playlist pages; refuses pagination loops and foreign channel IDs; uses sanitized errors and fixed Google API origins. Does not edit channel metadata or publish anything.

`scripts/connect-youtube.mjs`: one-time local Desktop OAuth setup, PKCE S256, random state, loopback callback, bounded lifetime, owner-only client/token files outside Git. Saves a refresh grant only after verifying the exact Family channel. A Mac is needed only during initial local consent, not for the later Railway connection. Owner approved this exact client and two read scopes; client and grant were created and verified on 2026-10-24. Requested scopes in this initial verification candidate are only `youtube.readonly` and `yt-analytics.readonly`; it does not grant upload or management rights.

Run after approval and authorized client download:

```
npm run build
node scripts/connect-youtube.mjs <owner-only-client-json> <owner-only-connection-json> <owner-only-authorization-link-file>
```

All three paths must stay outside the repository. Never print credentials or raw Google responses. User performs personal Google login and 2FA.

## Remaining work / release boundary

1. DONE: OAuth audience inspected; exact two-scope client/grant package approved.
2. DONE: isolated client created after approval; Family authenticated and real identity/uploads/analytics independently read.
3. LOCAL_TESTED: authenticated Hub integration, opt-in Kevin tools and owner Telegram panel implemented. NOT_DEPLOYED: these reads are not yet reachable from the actual remote clients.
4. PREPARED: separate two-service read release and server-side credential installation package. No push/deploy is authorized by the previous Kevin release afc3a48 approval; see YOUTUBE_FAMILY_READ_RELEASE.md.
5. Upload/scheduled publication needs an additional reviewed adapter, immutable video/title/description/audience settings, durable upload session receipt and safe cancellation. YouTube must be the sole schedule executor for those posts. Never start a second Buffer path or retry an ambiguous upload as a new video.
6. Verify the project's YouTube upload audit status before promising public API uploads. OAuth publishing status and YouTube API upload compliance audit are separate checks. No public or private video uploads have been made.

Official contracts: https://developers.google.com/identity/protocols/oauth2/web-server ; https://developers.google.com/youtube/data/reference/rest/v3/videos/insert ; https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol .

## Actual authorized verification

Separate Desktop client `906669107515-ef3hvvc3q0q8pod5hlq8e2i5uqk3mgpi.apps.googleusercontent.com` created as `Astel Family — Lazy Distribution`. Existing shared consent-screen branding remains `ASAP GTA6 Preview Pipeline`; its name was not changed. Google consent requested exactly the two approved read scopes. The returned identity was independently checked: Astel Family, expected channel ID, 83 uploaded videos. Analytics returned 29 populated days in 2026-09-24 through 2026-10-23. Secrets are in owner-only files outside Git; the original download was moved, not duplicated.

Official SDK through the local candidate bridge and real Google API: all three calls PASS, 18 discovered tools when explicitly enabled. Hub journal writes zero; platform publications zero. Default cloud bridge remains 15 tools with the flag absent.

Candidate Hub actions: `youtubeaccount`, `youtubevideos`, `youtubeanalytics`, all status-scoped, Copilot only. Actual remote Kevin has not yet used them because deployment is not approved. Existing Telegram candidate adds an owner-only YouTube button, videos and date-selected analytics; it uses the existing backend reader credential and never receives Google credentials.

Validation: Hub 97 tests PASS; Telegram 102 tests PASS; offline browser preview checked account/videos/report. Offline preview screenshot is mock UI evidence, not proof of a deployed panel. Actual API evidence lives outside the repos in `outputs/youtube-family-oauth-verification-2026-10-24.json` and `outputs/youtube-family-local-mcp-2026-10-24.json`.
