# Astel video review and planning

This additive module connects the Mac media workspace to the existing distribution journal. It does not add a publisher, change routes or enable platform writes. Historical Canvas HTML and credentials are not bundled into this repository.

`VIDEO_WORKSPACE_ENABLED=true` enables POST-only `/api/video-workspace/{inbox,status,register,preflight,feedback,review,plan}`. Existing caller authentication and project scope remain mandatory. Only `copilot` is supported; registration currently accepts simulation plans only. Owner feedback uses the existing owner's `approve` scope; it does not require broader credentials. Telegram's signed owner BFF is the remote UI.

The producer registers an exact story card against a previously submitted Hub plan and its input digest. Whole-file preflight downloads the anonymous final MP4, limits redirects to the two supported Google Drive download origins, and verifies MIME, byte length and SHA-256. Transfer is outside the shared journal lock. Proof and version checks are saved under the journal transaction. Review, approval and any later schedule reject stale story versions, missing/expired preflight or unresolved change requests. No new endpoint schedules or publishes.

`VIDEO_PLANNER_ENABLED=true` additionally requires an existing `OPENAI_API_KEY` and an explicitly configured `VIDEO_PLANNER_MODEL`. With these unset, planning fails closed. One proposal uses one Responses API call, no tools, `store:false`, a strict JSON schema and at most 3500 output tokens. There is a ceiling of 20 new requests per caller per UTC day and 500 retained request records. Lost responses are held as unconfirmed; the same ID never automatically incurs another model call. New requests use the account's normal metered API billing.

Planning uses supplied factual excerpts/URLs and owner-observed shot ranges. It does not browse, verify those excerpts independently, watch unseen footage, or perform semantic frame analysis. Every proposed scene must select a supplied asset range and cite supplied fact IDs. The owner edits the proposal before local voice generation. Private media and voice references are not sent to the planner.

Deployment target: existing Railway Hub, baseline `22a9ff9ce14a8f716aaf449d97fcdab8941b3191`, existing journal volume `/data`. Preserve all publisher, Buffer, route and credential variables. Enable only the new feature flags after the reviewed code is deployed. Rollback to the baseline source pin and disable the new flags if acceptance fails; optional journal fields remain preserved by the older implementation's JSON serialization. Do not delete or recreate the volume.

Validation: TypeScript build and 184 Hub/Radar tests pass, including exact-byte proof, stale rejection, owner-only feedback, no provider dispatch, lock separation, bounded proposals, idempotent billing requests and unknown-outcome holds. Live deployed acceptance is a separate checkpoint.

API references used for the planner contract: https://developers.openai.com/api/docs/guides/structured-outputs and https://developers.openai.com/api/docs/api-reference/responses/create .
