# Selection rationale — 2026-10-28

The three user-supplied projects were reviewed earlier in this task. No source code from them is vendored or executed here.

| Candidate | Decision | Reason |
|---|---|---|
| bintangtimurlangit/threads-mcp | Do not run as-is | Writes and scheduler start with server; CloakBrowser; reply success based on composer changes; not Instagram |
| gangj277/threads-automation | Do not run as-is | Dry run enters social composer, account identity is not mandatory match before actions; no repo license found |
| mahomedalid/skills threads-reply | Editorial inspiration only | Instruction-generated scripts rather than finished service; no durable cross-worker coordinator; sending workflow incompatible |
| INSSIST MCP | Deferred | Open bridge delegates to extension whose complete execution path was not audited; broad writes and publishing queue; UI-only guarantee not established |
| Microsoft Playwright / normal Chrome | Selected browser foundation, installation pending | Maintained public implementation, isolated persistent contexts, no Meta app/OAuth required for ordinary browser login |

The shared coordinator is necessary custom code: the evaluated tools do not provide the requested cross-cloud/Mac traffic light and ownership recovery. It is a small optional module inside the existing Hub, not a new distribution service or a second publishing queue.

Authentication state is sensitive (Playwright official auth docs); separate profiles are required per account and per executor. Persisting state does not prove identity or grant permission to automate arbitrary actions. No scraping at scale, evasion or CAPTCHA solvers. Stop on access restrictions.

SQLite transactions provide atomic claims on one persistent local DB. They do not solve distributed browser termination. Generation fencing protects stored results, while explicit verified-stop recovery protects against concurrent browser sessions after network partitions. Reserving availability at the expense of automatic failover is intentional.

Kevin task/model limits are not established. Coordinator and worker do not depend on a paid model call to keep ownership state. Kevin/Codex generate drafts from evidence when available; no silent fallback to billable API. No guarantee of reach, algorithm warm-up or follower attribution.
