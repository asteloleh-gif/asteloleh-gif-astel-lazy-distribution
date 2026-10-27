# Instagram Reels + certified Buffer bindings — LOCAL_TESTED

This candidate extends the existing Hub on review/unified-distribution-hub-20261024 from 467d7f8. No new scheduler, infrastructure, credentials or account grants. Nothing in this candidate is pushed or deployed. Existing production queues and content are untouched.

## Behavior

- Instagram single images remain supported. With the new gates enabled, JPEG/PNG and MP4 Reels use only direct public Drive media URLs.
- Reel request mapping was independently read from live Buffer GraphQL introspection on 2026-10-27: CreatePostInput.assets.video.url; metadata.instagram.type=reel; metadata.instagram.shouldShareToFeed=true. The latter means the Reel also appears in the Instagram feed. No story, carousel, Facebook, YouTube upload, new AI or shareNow mode.
- Exact owner-reviewed text, URL, asset revision, declared digest and schedule remain in the existing immutable plan digest. No AI calls, copies or rewrites of the material.
- Buffer remains the sole scheduling owner: automatic/customScheduled, exact dueAt. Hub only creates an approved job and reads its receipt; no local due-time uploader or alternate executor.
- Account ID, organization ID, channel ID, platform and platform service ID are checked against the live provider before a strict review/dispatch. Disconnected/locked/paused channels or missing scheduleUpdates permission block sending. Display names are never used to join identities.
- Canonical non-secret registry covers three Instagram Copilot, three Threads, and two ASAP Instagram channels. Project copilot keeps its six routes. ASAP is project subteam, adapter buffer-subteam. Wrong projects/brands, swapped IDs, duplicate bindings, duplicate scheduling owners and alternate executors for these account keys fail closed.
- The existing global write switch cannot enable ASAP. ASAP requires its own switch and exact allowed material digests. An empty ASAP digest allowlist blocks sends even if its switch is true. Kevin's existing copilot-only delegation is NOT widened by this candidate.
- Provider ID checkpoint remains before response validation; durable DISPATCHING intent precedes the mutation. Timeout/lost acknowledgement stays AMBIGUOUS_HOLD with no second create, no provider fallback and no automatic retiming. Existing provider cancellation logic and budget journal are reused.
- Receipt includes providerStatus (scheduled/sending/sent/error). Buffer sent + Instagram permalink remains PROVIDER_ACCEPTED with providerStatus=sent until independent platform-ID confirmation is available. It never fabricates an Instagram platform ID or claims PUBLISHED from a Buffer ID. Existing Threads confirmer stays intact. Invalid external permalink hosts are rejected even without a confirmer.

## Media boundary

- Only https://drive.google.com/uc?export=download&id=... and https://drive.usercontent.google.com/download?export=download&id=... . No browser-view URLs, credentials, arbitrary hosts/ports, auth query parameters, localhost or private IP redirects.
- HEAD only, cookies omitted, no Authorization, no media-body read, no disk upload/cache. Every redirect is checked, maximum four requests, loop detection, ten-second request timeout. HTTP error/login/HTML/wrong MIME/missing or invalid Content-Length fail closed.
- Operational size caps: 16 MiB JPEG/PNG images, 512 MiB MP4 videos. These are Hub guardrails, NOT a claim about Buffer/platform published limits. Codec/duration/aspect ratio are not transcoded or certified by HEAD. Buffer/platform may reject an unsupported file.
- availableUntil must be valid and later than dispatch/current time and scheduled delivery. It is a producer attestation, not a guarantee inferred from HEAD. HEAD does not independently recompute the declared sha256 digest or ensure the file will remain public/unmodified until posting. Do not silently grant Drive public access, replace a mutable file or invent a durable expiry.
- Reels are gated off by default. LD_BUFFER_REELS_ENABLED=true requires LD_BUFFER_DRIVE_MEDIA_ENABLED=true; strict identity verification is automatically enabled with media checks. With all new flags absent, existing image/Threads behavior remains compatible.

## Configuration templates (no secrets)

- config/verified-buffer-accounts.example.json: account/organization/channel/service IDs for all eight channels, observed live.
- config/asapteam-routes.example.json: ONLY the four new project subteam routes (two accounts × simulation/live). Merge with existing LD_ROUTES_JSON after reviewing the exact diff; do not replace existing routes.
- config/reels-release.example.json: serialized non-secret binding variables and false/default-safe switches. No API token value or caller key.

New variables: LD_BUFFER_DRIVE_MEDIA_ENABLED, LD_BUFFER_STRICT_BINDINGS, LD_BUFFER_REELS_ENABLED, LD_BUFFER_ASAPTEAM_ENABLE_WRITES, LD_BUFFER_ASAPTEAM_RELEASE_DIGESTS_JSON. Existing ASAP variables are LD_BUFFER_ASAPTEAM_TOKEN, LD_BUFFER_ASAPTEAM_ACCOUNT_ID, LD_BUFFER_ASAPTEAM_BINDINGS_JSON. Only the first is secret. Never paste it into this document, Airtable or chat.

## Validation

Run npm test (build + complete offline suite). 110 passed, zero failed. New coverage includes Reel/image request mapping, live-identity mismatches, media rejection and redirects, isolated account/route registry, independent write gates, a real temporary durable journal with repeat/ restart/lost-ack handling, checkpoint-before-mismatch, and no false PUBLISHED state.

Real read-only checks are separate from mocks:

    node scripts/verify-buffer-identities.mjs /path/to/nonsecret-evidence.json
    node scripts/verify-existing-drive-media.mjs EXISTING_BUFFER_POST_ID /path/to/nonsecret-evidence.json

The scripts read only existing owner-only keys under ~/.config/astel-distribution, never export them, never run a mutation or create a job. They run on Mac for initial verification; this is NOT proof that the candidate is deployed or that Mac was off.

On 2026-10-27 all eight real account/organization/channel/service bindings passed using the NEW validator. The NEW Drive probe checked the already-existing scheduled post 6ade9ad6e4be8a4d86d45afe: 303 from drive.google.com then 200 video/mp4 from drive.usercontent.google.com, 2,326,315 bytes declared, ZERO media bytes downloaded. The one-minute probe metadata is explicitly not a future-availability/digest attestation. Actual provider schema was read, no createPost was called.

## Exact production remainder — approval package, not executed

Target ONLY existing Railway Hub:
- project astel-lazy-distribution / 4a6245f3-650c-40f4-bcc2-c5ffa1b73e27
- service lazy-distribution / 0b6d6df1-45fc-4996-823a-fc82e5113bee
- production / b05ed9fd-5938-41fa-b246-754a46b149c9
- exact candidate SHA is in the external release manifest generated after local commit. No merge, no push or deployment has occurred for this candidate.

Proposed first release is read/review-only for ASAP: verify existing protected LD_BUFFER_ASAPTEAM_TOKEN against account 6add2e4173a6eff0da11c966 inside the cloud without exporting it, add the non-secret account/bindings, merge the four ASAP routes, preserve all existing routes/callers/keys/queues/storage. If the existing secret does not match, stop; transferring an existing correct key into persistent cloud storage requires explicit approval. No new key generation is proposed.

Enable LD_BUFFER_DRIVE_MEDIA_ENABLED, LD_BUFFER_STRICT_BINDINGS and LD_BUFFER_REELS_ENABLED only after reviewing impacts on ALL existing Instagram routes (their media must then be direct public Drive JPEG/PNG or MP4). Keep LD_BUFFER_ASAPTEAM_ENABLE_WRITES=false and its release digest allowlist empty for this first release. Add the two exact Drive hosts to the existing media-host allowlist by merging, not replacing. Review image-source migration before enabling these flags; existing scheduled Buffer jobs do not get recreated or edited.

This does NOT complete autonomous ASAP publishing. Subsequent execution needs: an explicitly scoped owner/producer for project subteam (current Kevin bridge and principal accept only copilot); exact approved material digest/content/media/time; separately approved ASAP write switch; independent Instagram platform-ID readback if VERIFIED_PUBLISHED is required. No such grant or public test is included in this local-stage permission. Fresh Kevin schema and signed-owner Telegram acceptance remain separate known blockers.

Risk: strict bindings or unavailable Drive HEAD can stop new review/dispatch; an operation failing after durable dispatch intent can remain on hold rather than auto-retrying. Media availability/format rejection can occur later at Buffer; use exact existing provider IDs to reconcile. Never resend via another provider after an ambiguous outcome.

Cloud storage: existing /data volume and request budget only. No video on Railway, no new volume/service/subscription, no spending-limit increase. Additional HEAD/API calls cause usage-based CPU/egress and provider quota use; not automatically free.

Acceptance after explicit release: verify pinned deployment SHA; cloud-side identity reads for all eight; server-side HEAD for the selected already-approved Drive asset; capabilities/authorization for the chosen project; read existing provider jobs/IDs without recreation; verify old Copilot queues/autoreplies and negative cross-project requests. Do not label local HEAD or Buffer UI access as a cloud end-to-end publication.

Stop: disable only new ASAP writes (already false initially), preserve provider queues. Rollback Hub code to deployed 467d7f85e7237a7325ed15f20cf65d88ac4567eb and remove/disable only new flags, restoring the preserved original route/caller/media-host configuration. Keep /data and provider receipts. Rollback does not cancel Buffer jobs; any cancellation needs exact provider confirmation. An old runtime may lack ASAP cancel capability, so retain provider IDs and use the provider's own approved cancel flow if required.
