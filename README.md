# Astel Lazy Distribution

AI-assisted distribution layer for sending one source asset to multiple external traffic channels.

## MVP

YouTube URL -> fetch metadata -> AI Pinterest packaging -> Pinterest Pin -> link back to YouTube.

OpenPost is kept as a separate deployable dependency for media/editor/publishing capabilities instead of vendoring its full codebase.

## Connector model

- SourceConnector: discovers/reads source content.
- DestinationConnector: prepares/publishes to a destination.
- AI Packager: turns source metadata into platform-native copy.
- Tracking/Analytics: added after the first publish path works.

First connectors: YouTube source + Pinterest destination.

## API access (local security preparation)

All `/api/` endpoints require `Authorization: Bearer <DISTRIBUTION_API_KEY>`.
Without this server-side setting, API routes fail closed with 503; missing or
incorrect authorization returns 403 before any source, AI or Pinterest request.
Do not put credentials in query strings. `/health`, `/` and `/privacy` stay public.
Provisioning a real credential and deploying this change require separate approval.
The legacy `/api/pinterest/sandbox-smoke` route is retired (410 for all methods);
it must not be used as a health check because it previously created a board and Pin.
Publishing remains disabled unless the existing `PUBLISH_ENABLED` is exactly `true`.

`npm test` compiles the app and runs local HTTP regression tests with all upstream
fetches mocked and host environment credentials excluded. It makes no live API calls.

## Automatic ingestion — design only, disabled

No watcher is implemented or enabled. A future opt-in worker should discover public
YouTube videos, persist a unique `(video ID, destination account, board)` job before
processing, and reuse the existing thumbnail-to-image-Pin adapter. Store Pin IDs and
ambiguous results durably; reconcile uncertain writes before retrying, never blindly
republish. Require explicit account/board mapping, a bounded starting date (no default
backfill), and separate enablement approval. Trial visibility restrictions must be
resolved before treating this as public distribution. OAuth and persistent access,
scheduler, live tests, and production activation are outside this patch.
