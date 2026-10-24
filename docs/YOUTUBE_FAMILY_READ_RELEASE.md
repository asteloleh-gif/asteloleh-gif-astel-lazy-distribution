# Proposed read-only Family release

This is a local candidate, not a deployment approval. Owner already approved creation of the Family Desktop OAuth client, addition of its test user and exactly youtube.readonly + yt-analytics.readonly. No further Google privileges are needed for this read-only release.

- Hub: existing `astel-lazy-distribution / lazy-distribution`, current baseline afc3a48. Two new server variables: `LD_YOUTUBE_FAMILY_ENABLED=true`, `LD_YOUTUBE_FAMILY_CONNECTION_JSON` (secret, already saved locally; never copy to chat). All existing Buffer routes, social credentials, journal and volume retained. Start command unchanged.
- Telegram: existing `astel-assistant / astel-assistant`, baseline 2a43205. One non-secret variable `DISTRIBUTION_YOUTUBE_ENABLED=true`. Uses existing Hub reader. No Google secrets in Telegram, browser, plugin or Kevin process.
- Push only existing two review branches, no merge. Refresh same private plugin after Hub deployment to add three read tools (15 to 18). A metadata version update may be needed, as it was for the previous Kevin release.
- Store refresh grant server-side in existing Railway encrypted configuration; short-lived access token held in Hub process memory and refreshed after restart. Local setup files mode 0600 under owner-only config directory. Initial loopback authorization server is stopped after successful setup. No ongoing Mac dependency after deployment.
- Existing compute and egress usage may increase. No new service, persistent volume, Google Cloud VM, trial, paid API plan or subscription requested. No fixed incremental price established; retain existing Railway spending limit.
- Testing status is unchanged. Family refresh grant is temporary (maximum seven days after consent). Production OAuth readiness is a separate unresolved item; do not claim durable unattended service until resolved. Do not publish the shared Google application or alter existing GTA6 client in this release.
- Acceptance: Kevin performs account/videos/analytics read; owner Telegram panel shows the same exact channel and report. No upload, approval, schedule, cancellation, video rename or public test. Existing Social Engine health is rechecked read-only.
- Stop: disable the new flags. Rollback Hub to afc3a48 and Telegram to 2a43205; preserve existing Hub journal and Telegram database. No data migration.
- Upload/publication permissions and adapter remain excluded; this release does not enable management of YouTube posts, only reads.
