# Bounded Threads home feed pilot

The existing `radar_create` contract selects this worker mode with query `radar:carousel:for-you` and account `astel.u:threads`. Use a single batch ID per run. Only queue it after verifying the installed worker supports the mode, the account is free and the current pilot allows a read. Older workers interpret the string as a search query.

The worker checks the selected home feed, looks for outer visible posts with an unambiguous timestamp permalink and scrolls up to six viewports. It passes up to ten distinct external post URLs to the normal reader, which records evidence and checkpoints. The lease, identity check and normal close/complete flow apply. An unrecognized tab or layout stops the run. The live Threads markup and the separate installed Mac dispatcher must be validated before release.

Kevin reads the batch evidence with `radar_evidence`, selects up to three conversations and saves one Russian draft per selected post with `radar_draft`. Return the link, author, date, what was actually read, and why this account can add a specific observation or question. A batch may produce zero drafts. Missing replies, continuation or unread media must be labeled. If essential context is unavailable, skip the post. No approval or social write belongs to this mode.
