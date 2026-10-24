# ADR 001 — shared Lazy Distribution Hub (2026-10-24)

Accepted owner direction; local candidate implementation, production acceptance pending.
Lazy Distribution owns delivery authorization, approvals, immutable plans, idempotency, state and events for the ecosystem. Copilot is its first client. OpenPost is a publishing adapter and the single delegated schedule owner for each routed delivery; Kevin remains the user orchestrator and Edie the analytics consumer. No second orchestrator/analytics service is introduced.

Previous designs that imply independent live content calendars inside each Copilot are superseded only for new content dispatch responsibility. Existing safety checks, analytics, knowledge/persona, historical jobs and comment auto-replies are retained. Existing UA calendar remains in simulation. Unknown provider outcome never authorizes cross-service fallback or replay. Prepared content requires no LLM/Hyper Crew calls.

Consequences: source and destination integrations use the versioned Hub boundary. Each additional project/account is separately authorized. Default production paths fail closed until persistence, exact backend version, identity and edit isolation are certified. Server status polling is not a second scheduler. Full operational limits and rollout/rollback are in DISTRIBUTION_HUB.md.
