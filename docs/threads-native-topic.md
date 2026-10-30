# Threads text and native topic

The Hub follows Buffer API Character Limits: text is limited to 500 UTF-16 code units (`text.length` in JavaScript). Topic strings are nonblank, at most 50 UTF-16 units and cannot contain `&` or `.`. Text and topics are not normalized, trimmed or rewritten. Source: https://developers.buffer.com/guides/character-limits.html (checked 2026-10-30).

Buffer Help Center instead describes a 500 UTF-8 byte limit: https://support.buffer.com/articles/character-limits-for-each-social-network-mNDqsEV9Nf. That conflicts with the API guide. There is no hard byte guard here, and local preview does not prove upstream acceptance of Cyrillic text. All 18 approved texts pass the UTF-16 check unchanged.

A Threads variant may supply `threads: {topic: "AI"}` alongside `text`. The topic is included in the plan digest and exact approval. It maps to Buffer `CreatePostInput.metadata.threads.topic`, never a text hashtag. Omit `threads` for legacy topic-less plans; no default is added and existing digests remain unchanged. Instagram destinations reject Threads metadata.

Primary source checked 2026-10-30: https://developers.buffer.com/reference.html — `PostInputMetaData.threads: ThreadsPostMetadataInput`, `ThreadsPostMetadataInput.topic: String`, and `ThreadsPostMetadata.topic: String`.

Topic-bearing live validation checks those input fields with read-only GraphQL introspection. Missing support blocks with `BUFFER_THREADS_TOPIC_UNSUPPORTED`; failed introspection/transport also blocks through the existing provider errors. This adds one budgeted read per validation. The provider response and subsequent status reads must echo the exact topic. Missing/null metadata is `BUFFER_THREADS_TOPIC_UNCONFIRMED`, not proof that the topic was lost; a concrete unequal string is `BUFFER_THREADS_TOPIC_MISMATCH`. A create ID is checkpointed before checking the echo, including partial GraphQL responses with resolver errors. The Hub holds the outcome and reconciles that ID; schedule retries never create again.

Topics accept direct strings; no catalog lookup or existing topic ID is required (https://support.buffer.com/articles/using-threads-with-buffer-HN9ZUFnVZv). Schema support does not prove successful publication. The approved fixture retains `nativeTopicVerified: false`; actual topic acceptance has not been tested against Buffer. Preview is contract-only and returns zero mutations; live review still performs provider validation. Automated tests use mocked provider responses and make no production writes.

Read-only schema introspection follows https://graphql.org/learn/introspection/ and uses the existing Buffer credential and budget. Read-only introspection on the deployed account returned HTTP 200 and confirmed the topic fields on 2026-10-30; rejection blocks readiness without requesting additional access. The Buffer reference does not document a dedicated Threads topic lookup/validation query, so schema introspection cannot certify that a candidate topic exists or is accepted.

Cancellation omits Threads topic metadata from its read and skips topic confirmation, while retaining exact ID/channel/text checks, scheduled state and `deletePost` permission checks, so an unconfirmed topic does not prevent authorized recovery cancellation.
