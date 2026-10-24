# Self-hosted-only release clarification — 2026-10-24

Owner decision: OpenPost SELF-HOSTED only. No Hosted subscription, trial, payment card, checkout, or paid-tier purchase. Airtable remains the editorial panel. Prepared materials never enable AI or Hyper Crew. This updates deployment/media assumptions; it does not recreate the candidate.

## Actual endpoint and release

Only allowed runtime origin: `https://openpost-production-77ea.up.railway.app` (API under `/api/v1`). `configuredHub()` now rejects any other origin, including `https://app.openpo.st`, before a token can be transmitted. No automatic Hosted fallback exists. Runtime is not yet configured/deployed; this is a verified restriction in the candidate, not a claim of an already working production Hub connection.

Read-only preflight: selfhost v5.2.2, build `a6effd0341a7a8cb5c54efe1bc6f4b4c364cfba2`; API contract 1.0.0; ready/database ok. Published image reference for release pinning:
`ghcr.io/getopenpost/openpost:v5.2.2@sha256:59859ed476a2b3babefbb33ba177a4f4abf7ac8f4a4478cdb74f9a036aeb16e1`.
The running Railway source is still mutable `latest`; it was NOT changed or restarted. Its running build matches the target version/revision; digest pin remains a release action. Hub validates exact version/revision before provider writes.

The inspected v5.2.2 self-host entitlement implementation uses `PlanID=selfhost`, with no subscription-based limits in its static snapshot. No paid dependency for the implemented scheduling API was found. This is source evidence, not authenticated live publication acceptance. Any real payment/license gate must stop the route; buying Hosted is not an allowed remedy.
Source: https://github.com/getopenpost/openpost/blob/a6effd0341a7a8cb5c54efe1bc6f4b4c364cfba2/apps/server/internal/services/entitlements/service.go

## Resource proposal — NOT provisioned or approved

Reuse the two existing Railway services; one replica each. No new application service, Redis, PostgreSQL, object-storage bucket or SaaS account.

| Resource | Purpose | Proposed capacity / planning usage |
|---|---|---|
| Existing lazy-distribution | API, journal/outbox, reconciliation | 128 MB average RAM planning assumption; 1 GB durable state volume |
| Existing openpost | provider schedule owner + SQLite + working media | 256 MB average RAM planning assumption; 5 GB durable DB/media volume |
| CPU, combined | API / scheduling / media operations | 0.03 average vCPU example; media processing can exceed this |
| Egress | provider media delivery | 10 GB/month example, actual is variable |
| Backup | DB, working media, journal; secret recovery stays in secret store | Private snapshot/restore procedure needed before restart; cost not yet measured |

Average usage assumptions are NOT reserved resource limits or spending caps. Volumes are not an unnecessary second master library: the Hub volume contains only state, and OpenPost volume holds its operational database and required media attachments. Neither mounted volume currently exists in Railway metadata. Existing SQLite/media must be preserved before a volume mount/redeploy; merely setting paths does not migrate data.

## Measured baseline and incremental cost

Read-only Railway metrics: last 24 hours, 289 samples per service:
- lazy-distribution: average RAM 0.031637504 GB, CPU 0.0000055981 vCPU.
- openpost: average RAM 0.0951608341 GB, CPU 0.0028402482 vCPU.

At documented rates ($10/GB-month RAM, $20/vCPU-month CPU), this idle baseline extrapolates to approximately **$1.32/month combined CPU/RAM**. It excludes storage, egress, backups, tax and account credit effects. This is NOT the current invoice, a workload benchmark, or the cost of all Astel services.

Example after release:
- 0.384 GB combined average RAM: $3.84/month.
- 0.03 average vCPU: $0.60/month.
- 6 GB actually occupied durable volume storage: $0.90/month at $0.15/GB-month (less if less is billed as used).
- 10 GB service egress: $0.50/month at $0.05/GB.
- Total example: **$5.84/month**, approximately **$4.52/month above measured idle CPU/RAM baseline**. Backup charges and usage spikes remain additional/unknown. Existing Railway credits may reduce the actual invoice delta; no zero incremental charge is promised.

No spending limit is inferred as approved. Proposed incremental budget for owner review: $5/month for this initial low-volume rollout, subject to measured usage and backup pricing; this is a decision threshold, NOT an already configured hard billing cap. If the forecast cannot fit, stop before adding resources. No purchase, plan change, trial or card action was performed.
Rates checked 2026-10-24: https://docs.railway.com/pricing/plans and https://railway.com/pricing . Railway's $0.015/GB-month object storage price is a different product; it must not be substituted for volume pricing. No object-storage bucket is proposed.

## Single source for original media

Use the existing Google Drive connection; do not connect Dropbox or create a duplicate master library. Metadata discovery confirmed existing Astel folders, including `04_ASTEL_ENGINE_LEO`. This does not authorize publishing its contents or using Leo assets for UA. Exact permitted master folder/file per brand still needs grounding. No media files were exported, shared publicly, copied to a new library, or uploaded by this work.

Airtable records retain editorial data and references to approved Drive file IDs/revisions/digests. Runtime access to a private Drive folder is a separate scoped connection: the chat's connector does not automatically grant Railway access.

OpenPost v5.2.2 accepts attachment `media_id`, not an arbitrary private Drive viewer URL. Current Hub requires an attested mapping of asset digest/revision to an existing OpenPost media ID. A bounded Google Drive → OpenPost working-copy import is not yet implemented/certified. This is a technical blocker for image/Reel acceptance, not a reason to buy Hosted or make private Drive files public. Any necessary sending copy must be described as operational staging, have an approved retention policy and be included in disk/traffic estimates. Zero duplicate bytes cannot be promised for this backend. Text-only Threads does not need media staging.

## Current UI and access findings

Owner login confirmed in native existing panel under astel.oleh@gmail.com, workspace `my brand`. Panel shows one user/workspace, zero social destinations, zero published posts and no configured OAuth provider apps. Existing OpenPost UI is optional inspection of queue/results; Airtable remains the editorial interface. No new cabinet is implemented.

Native v5.2.2 OAuth asks broader scopes than bare publication:
- Threads: threads_basic, threads_content_publish, threads_manage_replies, threads_manage_insights, threads_location_tagging.
- Instagram: business_management, instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_messages, instagram_manage_insights, pages_show_list, pages_read_engagement, pages_read_user_content, pages_manage_metadata.
These lists were read from the pinned source. No OAuth/grant was initiated. Extra messaging/business permissions are NOT implicitly approved. A narrower supported route or an explicit bounded owner decision is needed before those native flows. Facebook automation remains disabled; Meta apps remain Development.

The Hub owner-approval API exists, but an authenticated Airtable/owner/ Kevin approval interaction is not yet live-connected. Native OpenPost scheduling directly from its editor cannot be presented as Hub authorization. Post-approval edit isolation must be demonstrated before certification; no flags were set merely to bypass this gate.

## Acceptance / release boundaries

Local additions reuse the same review branch. Tests include exact-origin rejection, zero AI, v5.2.2 version drift, actual cancellation semantics (cleared schedule + lifecycle event), and real isolated Hub process restarts retaining provider IDs and dedupe. No real service restart, persistence restore or public publication is claimed.

Before any live rollout: one exact commit review; backup + persistent-storage migration; scoped server credentials transferred technically through the secret store; authorized provider connection; exact approved canary; deployment approval and measured cost check. No subscriptions/trials/purchases. Remaining actions are one release packet, not repeated requests to copy keys. Kevin handoff is prepared locally; no verified Kevin endpoint/recipient has been found, so status is NOT SENT.
