# Connector roadmap

Astel Lazy Distribution is source-agnostic. A source normalizes content into a `ContentEnvelope`; destination connectors publish platform-specific drafts.

## Current

| Connector | Direction | Status | Notes |
| --- | --- | --- | --- |
| YouTube | source | active | Loads a specific public video/Short by URL through YouTube Data API. |
| Pinterest | destination | active/pending platform approval | Production + sandbox endpoint support. |
| TikTok | source | code-ready | Uses TikTok Display API for an authorized creator account. Supports recent video listing and lookup by video id/URL. |
| Discord | destination | code-ready | Uses an incoming webhook and publishes a link + rich embed. |
| Telegram | destination | code-ready | Uses Bot API `sendMessage` to a configured chat/channel. |

The TikTok source is intentionally **metadata-only**. TikTok Display API returns metadata, share/embed URLs, and a temporary cover-image URL; it does not provide a reusable raw master video file. For cross-posting original video to YouTube/TikTok/Instagram, use a master asset from storage rather than downloading a platform-compressed copy.

## Next connectors

### Reuse existing Astel Social Engine
Threads and Facebook already have Meta adapters in the separate social engine. Prefer a bridge to that service rather than re-implementing Meta OAuth and publishing here.

### TikTok destination
Use TikTok Content Posting API. Direct Post requires an authorized user and `video.publish`; public posting from unaudited clients is restricted, so enable this only after the TikTok app/audit flow is ready. Prefer a master video URL from verified storage.

### Bluesky
Good low-friction destination. AT Protocol supports post creation and external-card embeds. Add after Pinterest/Discord validation.

### Reddit
Keep human approval in the loop. Route only to a curated allowlist of relevant subreddits and respect each community's rules. Do not build blind multi-subreddit autoposting.

### Forums/community sites
Treat these as explicit per-site adapters or browser workflows. No generic spam connector.

## Source strategy

Short term:
```
YouTubeSource / TikTokSource
        ↓
ContentEnvelope
        ↓
AI packaging
        ↓
Destinations
```

Long term:
```
MasterUploadSource (original MP4)
        ↓
ContentEnvelope + durable media asset
        ↓
YouTube / TikTok / Instagram / Pinterest / Threads / ...
```

A platform post can still act as a trigger, but the original master file should remain the media source of truth.

## API references

- TikTok Display API: https://developers.tiktok.com/doc/display-api-overview/
- TikTok Content Posting API: https://developers.tiktok.com/products/content-posting-api/
- Discord OAuth/webhooks: https://discord.com/developers/docs/topics/oauth2
- Telegram Bot API: https://core.telegram.org/bots/api
- Bluesky posting: https://docs.bsky.app/docs/tutorials/creating-a-post
