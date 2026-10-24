# Subteam + MCP contract candidate

This extends the existing review checkout; it is not a new scheduler or project.

## Verified provider identity

Read-only Buffer GraphQL checks on 2026-10-24 independently returned:

- Subteam account: `6add2e4173a6eff0da11c966`
- Organization: `6add2e4173a6eff0da11c968`
- Instagram `asapleo.ai`: `6add2fd6778b240e2fb6336e`
- Instagram `wtffounder`: `6add2e8c778b240e2fb61093`

All three Buffer account IDs differ. No provider queue mutations were performed.

## Configuration for the candidate (not yet applied)

Existing secret: `LD_BUFFER_ASAPTEAM_TOKEN` (never replace the production tokens).

`LD_BUFFER_ASAPTEAM_ACCOUNT_ID=6add2e4173a6eff0da11c966`

`LD_BUFFER_ASAPTEAM_BINDINGS_JSON`:

```json
[{"accountKey":"subteam:asapleo.ai:instagram","platform":"instagram","channelId":"6add2fd6778b240e2fb6336e"},{"accountKey":"subteam:wtffounder:instagram","platform":"instagram","channelId":"6add2e8c778b240e2fb61093"}]
```

Adapter `buffer-subteam` accepts only project `subteam` routes; no routes are added automatically. A caller needs explicit access to that project. The adapter remains read/validation-only even when the global production write flag is true. Enabling it for publication requires a later explicit implementation/release and exact canary approval. Current image adapter supports prepared single-image posts; Reel/video capability is not certified.

## MCP changes

Five existing read tools now declare schemas and read-only annotations. Successful responses include structuredContent; invalid parameters are JSON-RPC errors and business errors use isError tool results. REST authorization behavior is preserved. No OAuth server, new grant or unauthenticated public route is added.

Offline validation: 75 tests passed; official MCP SDK 1.32.2 independently passed local discovery, structured result, tool error and invalid argument checks.

## Release and remaining acceptance

This candidate is local, not pushed or deployed. Current production and public UA canary are untouched. Publishing this candidate and deployment need approval of its exact commit. No new volume, service or subscription is requested; existing Railway CPU/RAM/network remain metered.

Kevin is NOT connected. Direct ChatGPT OAuth cannot complete against the deployed Hub because OAuth discovery/authorization are missing. A registered authenticated client route and actual invocation from Kevin remain required; local SDK tests do not prove that acceptance. No handoff was sent to an unverified chat.

Rollback the Hub to `3de6804361a43432a052859f3f1fc5a76caa6648` while retaining the persistent journal. A code rollback does not cancel provider-accepted jobs. Do not requeue or switch their execution owner.
