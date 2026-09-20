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
