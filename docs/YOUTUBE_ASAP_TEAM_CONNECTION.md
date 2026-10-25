# ASAP Team read connection candidate

Status: LOCAL_TESTED; owner OAuth confirmation pending; not pushed or deployed.

Channel: UCY_Gljo9NHXbXQv-vT_PWTA / @ASAPTeamAI. Family remains the default when accountKey is omitted. Explicit accountKey=asap-team selects the separate credential; no fallback to Family. Unknown keys are denied.

Hub configuration: LD_YOUTUBE_ASAP_TEAM_ENABLED=true and LD_YOUTUBE_ASAP_TEAM_CONNECTION_JSON (owner-only OAuth connection JSON). Only youtube.readonly and yt-analytics.readonly. No upload or metadata write operation.

One-time connection: node scripts/connect-youtube.mjs CLIENT_JSON CONNECTION_JSON AUTH_LINK asap-team. Files must be outside Git with owner-only permissions. OAuth remains Testing (up to 7 days); no permanent access claim.

Telegram: DISTRIBUTION_YOUTUBE_ASAP_TEAM_ENABLED=true adds the separate ASAP Team button under the existing YouTube feature. Backend checks signed owner identity, allowlisted account selector and flag. Existing Family calls without selector retain behavior.

Kevin: existing three YouTube tools accept optional accountKey enum family/asap-team. Refresh plugin schema after release and independently check both channel IDs, video counts and analytics. No tool-count increase, no publication route.

Verification: Hub 98 passed; Telegram 103 passed. New tests ensure missing ASAP cannot fall back to Family, foreign keys fail, selectors forward correctly and Family default remains intact.

Pending: owner-authorized OAuth grant, real read of exact channel, immutable release commits and exact rollout approval; actual cloud/Telegram/Kevin verification after deployment. No deployment has been performed for this candidate.
