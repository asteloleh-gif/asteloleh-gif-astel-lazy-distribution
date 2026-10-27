# Five Instagram channels — format release, 2026-10-27

Extends deployed Hub 50922d1452421bbff71d1b6cd2bcca071dba4065 and Telegram 18bd1c51e08df943bc70369728133ce7a0085075 on their existing review branches. Owner requested all supported Instagram posting formats. No new service, storage, subscription, OAuth, Facebook enablement, credentials, AI or public test. Existing /data/database remain. Usage-based CPU/API traffic applies; spending cap unchanged.

## Actual evidence and boundaries

Live read-only Buffer schema confirms Instagram type post/story/reel, ordered assets, automatic/notification scheduling, image altText/userTags, video thumbnailOffset (milliseconds), isAiGenerated, geolocation, firstComment and stickerFields. The latter are textual reminders, NOT native music, links or poll objects. No API field for automatic music selection/collaborators/trial-reel control was exposed in the inspected inputs. Do not invent unsupported fields or silently change connection methods.

Live account reads: all five exact identities, Business, content_publish scope, connected/unlocked/unpaused, scheduleUpdates. All five have hasActiveMemberDevice=false and Instagram Login scopes. These are actual account/readiness checks, NOT proof a new Story/carousel has published. No public post was created for this verification.

## Supported contract

Existing PlanInput stays version 1 with additive optional fields. Existing asset/variant payloads, hashes of unchanged objects, routes, approved plans and receipts remain unchanged. Future advanced variants use instagram.type=post|reel|story; publishing=automatic|notification; assetIndices selects an ordered set of media (mutually exclusive with asset). Carousel uses type post with 2–10 assets; single video uses reel. Stories accept up to 10 images/videos. 10 is a conservative Hub ceiling because current Buffer help pages disagree between 10 and 20; this package does not certify 20-item carousels.

Assets retain kind image/reel; add video for carousel/Story MP4. Optional altText/userTags on images, thumbnailOffset on videos. Reel shareToFeed, AI disclosure and reminder instructions are immutable approval inputs. Raw/unknown options rejected; no custom thumbnail upload, fake music URI or silent fallback. First comment is implemented but remains disabled until existing account/plan entitlement is confirmed: LD_BUFFER_FIRST_COMMENT_ENABLED defaults false; no purchase proposed. Location fails clearly on current Instagram Login scopes; no Facebook reconnection in this release.

Automatic Story caption must be empty: text/stickers are baked into the source image/video or explicitly finished personally. Native music/sticker/poll/product/link instructions require publishing=notification AND a currently registered Buffer device. Missing device fails before creation with BUFFER_NOTIFICATION_DEVICE_REQUIRED. This is not an automatic upload and is visibly labelled in Telegram. Buffer remains the ONLY scheduler; Hub creates no reminder timer or alternate uploader. Notification sent is not proof of an Instagram publication.

New formats and Reels on ALL five channels use public direct Drive sources and fresh exact remote identity/readiness verification. Existing plain-image paths on the three Copilot channels retain their existing source handling (including previously used S3/Instagram CDN); they are not retroactively moved to Drive. New format limits are 8 MiB image / 300 MiB MP4. HEAD validates access/MIME/declared size/redirects/expiry, not codecs, duration, dimensions, digest or future immutability; producer metadata is not independent video certification. Valid Instagram duration/aspect/codec are still required by Buffer/platform. No media bytes are stored on Railway.

Returned new-format job is checked against requested post type, automatic/notification mode and Reel shareToFeed. Buffer ID is checkpointed before acknowledgement validation; disagreement stays held, never retried through another service. Multiple media remain ONE provider job with ordered assets, not several independently scheduled Hub deliveries. Existing repeat/restart/ambiguous/cancel safety remains. Receipt still distinguishes providerStatus=sent from independently PUBLISHED/platform ID.

## Release

Hub: existing service only, exact candidate in external release manifest; LD_INSTAGRAM_FORMATS_ENABLED=true. No change to existing keys, media scope, routes/callers, write gates or owner approval. Startup reads all five channels inside Railway using existing cloud keys; bounded non-secret identity/readiness output only. No queue/history read and no touch of Startup Orchestrator job.

Telegram: candidate only; approval displays format, manual/automatic mode, ordered asset indexes, all additional settings, tag coordinates, cover offset and exact caption. No new server credential or flag. Kevin remains unable to approve on either project; only signed owner Telegram can approve exact version; Kevin then schedules.

Offline: 148 Hub tests and 104 Telegram tests pass. All 5 accounts × image/carousel/Reel/Story-image/Story-video payloads tested; notification device denial and eligible explicit notification path; business-story requirements; paid/location blocks; ordering/tag/cover validation and digest; wrong format/mode acknowledgement checkpoint; prior replay/restart/cancellation/authorization regressions. Mocks are explicitly not live publishing proof.

After deploy: pinned SHA + successful cloud five-account check, plugin capabilities both projects, metadata displayed by released Telegram asset, owner protection and existing autoreply health. Real publishing acceptance remains per-account/per-format on an exact approved material. Never extrapolate one account's success to all others.

Stop new work: existing project/account pause or Buffer write gate; no cancellation inferred. Rollback code to Hub 50922d1 and Telegram 18bd1c5 and disable only LD_INSTAGRAM_FORMATS_ENABLED; preserve /data, database and queues. If a new-format job already exists, older code cannot safely re-create its validation; do not dispatch it on rollback, retain provider ID and reconcile/cancel with the matching candidate or provider. No blind resubmission.

## Official sources read

- https://developers.buffer.com/guides/posts-and-scheduling.html
- https://support.buffer.com/en-us/articles/what-is-buffers-api-GtIYIQilz5
- https://support.buffer.com/articles/using-instagram-with-buffer-YSjg2dXFV8
- https://support.buffer.com/articles/scheduling-instagram-posts-reels-stories-and-notifications-3XA98S9Q5p
- https://support.buffer.com/en-us/articles/using-notification-publishing-gvZQiMxVa2

These pages describe native/API capabilities and limitations, not an executed public canary on our accounts.
