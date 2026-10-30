# Threads text and native topic

Threads text is limited to 500 Unicode code points (not UTF-8 bytes or UTF-16 code units). Combining marks and ZWJ sequences count as their constituent code points; text is not normalized or rewritten.

A Threads variant may supply `threads: {topic: "AI"}` alongside `text`. The topic is included in the plan digest and exact approval. It maps to Buffer `CreatePostInput.metadata.threads.topic`, never a text hashtag. Omit `threads` for legacy topic-less plans; no default is added and existing digests remain unchanged. Instagram destinations reject Threads metadata.

Primary source checked 2026-10-30: https://developers.buffer.com/reference.html — `PostInputMetaData.threads: ThreadsPostMetadataInput`, `ThreadsPostMetadataInput.topic: String`, and `ThreadsPostMetadata.topic: String`.

Topic-bearing live validation checks those input fields with read-only GraphQL introspection. Missing support blocks with `BUFFER_THREADS_TOPIC_UNSUPPORTED`; failed introspection/transport also blocks through the existing provider errors. This adds one budgeted read per validation. The provider response and subsequent status reads must echo the exact topic. Missing/null metadata is `BUFFER_THREADS_TOPIC_UNCONFIRMED`, not proof that the topic was lost; a concrete unequal string is `BUFFER_THREADS_TOPIC_MISMATCH`. A create ID is checkpointed before checking the echo, including partial GraphQL responses with resolver errors. The Hub holds the outcome and reconciles that ID; schedule retries never create again.

Schema support does not establish availability of a particular proposed topic or successful publication. The approved fixture retains `nativeTopicVerified: false`; actual topic acceptance has not been tested against Buffer. Preview is contract-only and returns zero mutations; live review still performs provider validation. No production API calls or queue changes were made during testing.

Read-only schema introspection follows https://graphql.org/learn/introspection/ and uses the existing Buffer credential and budget. Its availability for the deployed account has not been exercised here; rejection blocks readiness without requesting additional access. The Buffer reference does not document a dedicated Threads topic lookup/validation query, so schema introspection cannot certify that a candidate topic exists or is accepted.

Cancellation skips topic confirmation, while retaining exact ID/channel/text checks, scheduled state and `deletePost` permission checks, so an unconfirmed topic does not prevent authorized recovery cancellation.
