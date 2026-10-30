# Copilot connector approval — local candidate, 2026-10-30

This candidate changes the Copilot approval policy described in OWNER_APPROVED_REELS_RELEASE.md. It is not permission to deploy or operate production. The owner requested removal of mandatory Telegram-only approval; applying this exact expansion of rights requires separate confirmation.

Permission delta: the existing kevin-cloud principal gains approve only for project copilot. Its existing delegatedApproval capability allows approval of its own submitted Copilot plans. The connector exposes distribution_approve(projectId, planId, digest); the bridge and Hub independently reject approval for subteam and foreign projects. The existing token, workflow feature, other scopes, routes and Telegram owner rights remain unchanged. Discovery with YouTube enabled returns 18 distribution tools.

Approval still requires NEEDS_APPROVAL and the exact immutable plan digest, which binds revision, text, native topic, account and schedule. It records actor kevin-cloud, digest, timestamp and approval reference in the durable journal. Approval does not schedule or call Buffer. Scheduling remains a separate command with the existing integrity, route, account, future-time, write-enable and duplicate-prevention checks.

The existing Copilot Buffer adapters accept kevin-cloud approval only when the plan project is copilot. Subteam's adapter still trusts only its existing human actor or explicitly released digests. Old string-based actor configurations remain compatible.

Risk: the Kevin credential can approve any reviewed Copilot plan (including its own), not just RU2, without a Telegram signature. Human consent in chat is an operator obligation, not a cryptographic input verified by Hub. This change does not autoapprove anything, but makes that credential capable of both approving and separately scheduling Copilot material. Do not describe it as retaining Telegram's independent human-signature boundary.

After separately authorized deployment, refresh connector discovery if stale. Read back the exact existing plan and digest, call approve only for material the owner authorized, verify APPROVED with matching audit, then separately schedule only when authorized. Never resubmit the existing RU2 or change its time as part of this change.

Offline tests cover configured runtime and MCP approval, altered revision/text/account/time digest rejection, unknown plan and cross-project rejection, approval audit persistence, no provider call at approval, one mocked provider creation across restart/retry, Subteam inbox/ACL denial and project-scoped Buffer release. No live provider calls are used.
