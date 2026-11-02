# CP3 — manual payment evidence

Implemented October 31, 2026, starting from CP2 commit `ddb7a78`. The user selected capped private Firestore image documents for this checkpoint. The code is gated and not deployed. No production records, receiving accounts, credentials or Firebase settings were read or changed.

## Customer workflow

1. Open the CP2 account login or reservation email-link session.
2. Select an office-prepared payment option and review its receiving-account instructions. Copy the account number if needed. The generated image says **DEMO / NOT FOR PAYMENT**; it has no configured payment destination.
3. Enter the amount actually transferred, reference and Philippine calendar date. Select a JPG, PNG or WEBP receipt. Client compression and an expandable preview let the buyer check readability.
4. Review plots, purpose, expected amount, claimed amount, recipient, reference, date and preview. A mismatch is visible and accepted as evidence requiring review; it never changes the expected amount.
5. Confirm. The server atomically saves a stable `MP-` submission identity, immutable revision and sanitized private proof. The result is **pending verification**, not money received. Balance, deposit credit, schedules and reservation deadlines remain unchanged.
6. View private proof, earlier proof revisions and pending status. Correct an unverified submission by adding a new revision under the same case. Verified/rejected cases cannot be edited by this endpoint. Receiving-instruction changes on an existing case require office review.

After an uncertain response, the form locks its reviewed details and retries the same request identity. The server returns the saved result without charging storage again. Nothing is persisted to browser localStorage; if the buyer leaves before recovering the result, they must inspect saved submissions before starting another case. References are unverified observations, so another pending claim cannot permanently block a genuine payer. Actual duplicate-transfer reconciliation belongs to CP4.

## Implementation and trust boundary

- `payment-submit.js` adds a component to the existing payment page, with native labels/file picker, announced progress/errors, focused errors/review heading, cancel/back controls, proof zoom and mobile layouts. It clears with the parent private view on logout, account changes, expiry or bfcache restoration. CP2's 30-minute view-clearing timer still applies.
- `/api/payment-submission` (via `api/payments.js`) / `lib/payments/submission-http.js` handle only `context`, `list`, `proof` and `submit`. All private actions use same-origin JSON POST, bounded bodies, CP2 rate limits, no-store responses, and current account/guest authorization. GET reveals only the enabled flag. Tokens, cookies, proof payloads and provider details are not logged.
- `lib/payments/submission.js` checks ownership/session before decoding, and again within the transaction that saves evidence. Current scope, recipient/version, cancellation state, expected submission version, quota and idempotency are checked in that transaction. All reads precede writes. No external call occurs in its retryable callback.
- `lib/payments/proof-image.js` uses pinned `sharp@0.35.5` for full server-side decode/re-encode, JPEG/PNG/WEBP format verification, still-image checks, pixel bounds, orientation handling and metadata stripping. The HTTP request does not get to set `validationStatus` or a storage key.
- Preview remains in browser memory until confirmation. With Firestore there is no persisted staging object: validation happens before the single atomic save, so abandoning the preview creates no orphan proof.
- Each revision saves its own proof, reference observation, audit and notification event. No email dispatcher or admin inbox is connected at CP3. Hashes identify exact sanitized image bytes only; duplicate-image suggestions and transfer verification remain CP4/CP8 work.
- Legacy financial writers and PayMongo remain unchanged. New cases use `schemaVersion: 3`, `postingReady: false` and a legacy source scope; they deliberately fail the CP1 posting primitive's schema gate. CP4 must implement a reviewed bridge to canonical booking/quote identities and the complete approval/reconciliation flow. Do not flip a schema/version flag to bypass this work.

## Server-owned configuration contract

These are schema descriptions, **not production seed data or a migration**. No endpoint in CP3 creates or edits configuration. Protect these authorities from all browser writes and review the actual source linkage before provisioning.

| Record | Fields |
|---|---|
| `paymentSubmissionScopes/{sha256(JSON.stringify([kind,id]))}` | `sourceKind: customer|presale`, exact `sourceId`, `enabled`, positive `version`, `openCases`, `day` (Manila YYYY-MM-DD), `dayCount`, up to eight unique `offers` |
| Each scope offer | Stable `id`, `purpose: deposit|installment|advance|settlement`, approved positive integer `expectedAmountCentavos`, stable `receivingAccountId`, matching `receivingAccountVersion` |
| `paymentReceivingAccounts/{stableId}` | `enabled`, positive `version`, `channel: gcash|bank`, `label`, `accountName`, `accountNumber`, `instructions` (each string at most 500 characters) |
| `paymentProofBudget/manual` | Required positive `limitBytes` no larger than 64 MiB, nonnegative integer `usedBytes` reconciled to retained evidence. Missing/malformed/full budget fails closed. |

Amount and account snapshots come from these reviewed records, never the browser's claimed amount or legacy paid flags. There is no inferred installment formula, fee or penalty. A future office configuration process must authorize and audit changes, increment versions, and keep economic receiving-account identity stable across display changes. New records with no configured scope offer cannot submit. Known cancelled/released source records are blocked; lifecycle cutover must disable the scope transactionally for every other closure state.

Configuration changes do not discard already saved evidence. List/proof access remains available to the current owner when new submissions are disabled at the scope level. The global feature flag disables all new endpoint operations; disable scope offers instead if existing proof access must remain available.

## Retained records and limits

| Record | Purpose |
|---|---|
| `payments/{MP-id}` | Current pending case projection, source scope, immutable recipient/amount quote snapshot, untrusted claimed fields, current proof/revision, version and timestamps |
| `payments/{id}/revisions/{rN}` | Immutable complete claim/quote/evidence links, actor, request ID and previous revision |
| `paymentProofs/{paymentId_revisionId}` | Private sanitized JPEG base64, MIME, dimensions, byte count, SHA-256, scope/case/revision links, creation time and charged storage bytes |
| `referenceClaims/{paymentId_revisionId}` | Immutable unverified observation; `claimKey` hashes stable receiving-account ID plus trimmed reference. Leading zeros and case are preserved. No exclusive transfer reservation. |
| `submissionOperationKeys/{digest}` | Actor/scope/request identity, payload hash and original result; current authorization still required for replay |
| `auditLogs/submission_{proofId}`, `notifications/submission_{proofId}` | Deterministic evidence event, saved with the revision; no claim of successful email delivery |

Conservative technical limits to review before activation:

- Browser original: 5 MiB and 16 megapixels. Client resizes toward 1600 px and compresses with a preview; unreadable output must be replaced by the buyer.
- HTTP JSON: 720 KiB. Encoded image supplied to server: at most 512 KiB of decoded input bytes. Actual format/pixels are checked independently of the client MIME.
- Server normalized JPEG: maximum 300 KiB, 1600 px long edge, at least 64 px in each original dimension. A more detailed image that exceeds the output cap is rejected with cropping guidance, not silently reduced further. Decode work has a five-second processing timeout.
- Each proof document: serialized UTF-8 evidence plus 4 KiB conservative overhead must fit 420 KiB. Base64 expansion is counted. Every retained revision consumes budget.
- Dedicated aggregate proof budget: at most 64 MiB; may be configured lower. This is **not a guarantee about total Firestore usage**, indexes, existing data or daily read/write quotas.
- Five open cases per source, ten proof revisions/submissions per Manila day, ten retained revisions per case. Concurrent callers cannot overspend these counters or the global budget. No cleanup/decrement job is implemented; caps eventually require office review. CP4 must adjust `openCases` exactly once on terminal transitions.
- CP2's general traffic limits apply to both access and submission routes. List pages contain at most 20 cases, never image payloads. Proof reads address one authorized case/revision. Expired/changed access clears the browser's private view.

Retention/deletion duration remains OPEN. Do not reset the budget to enable more uploads, delete evidence under review, or auto-delete financial history. A later approved archive/deletion process needs review holds, actual deletion followed by exactly-once budget accounting, tombstones/audit, and backup/restore verification. No TTL or cleanup deployment is included.

## Activation gates

1. Complete all CP2 rules/contact-version/Auth/HTTPS gates. Review the actual composed Firestore rules for the additional private collections in `access-rules-review.md`; no client, including an admin browser, may write/read raw proofs through the SDK. Retire or adapt overlapping legacy rules/writers deliberately.
2. Exempt `paymentProofs.base64` from indexing before accepting evidence. Merge the required `payments` composite query index (`submissionScope ASC`, `submittedAt DESC`, `paymentId DESC`) into the actual index inventory. Do not deploy an invented replacement configuration.
3. Provision approved receiving accounts, source-specific offers, reconciled counters and proof budget through a separately authorized office/migration process. Test no-scope, cancelled/released, changed quote, depleted quota and uncertain retry paths. Do not upload the local preview fixtures to production.
4. Run Auth/Firestore emulator and staging integration tests against actual SDK transactions/rules/indexes. Verify native Sharp packaging on the Vercel Linux/Node runtime, payload/time budgets, rejection of animated/corrupt images, real sanitized receipt readability and private response/log behavior. Only local Node/Edge validation was performed; no emulator/production access was used.
5. Complete CP4 admin review, reconciliation and canonical booking integration before offering this as an operational payment collection workflow. CP3 alone leaves every case pending. Manually enabling a flag does not implement approval.
6. Keep `PAYMENT_SUBMISSIONS_ENABLED` unset/false until the above review is complete; enabling also requires CP2's complete `PAYMENT_ACCESS_ENABLED` configuration. No environment files were read or edited.

## Validation and resume

`npm.cmd run test:payments`: **62 passed, 0 failed**. Coverage includes real Sharp decoding/metadata stripping and bounds, scope/auth failures, current ownership/contact/quote/recipient races, correction-versus-verification, retry deduplication, failed atomic commit, competing reference observations, old proof retrieval, revocation racing delivery, pagination, and concurrent quota exhaustion. CP1/CP2 regressions remain covered.

The optional local Edge/Playwright smoke test passed account and guest uploads, image rejection/focused error, confirmation/mismatch, lost-response recovery, private proof viewing, correction and previous revision viewing, expired access clearing, CP2 regressions and 320/390/768 px overflow checks. Desktop/mobile screenshots were inspected. Its backend uses the same submission/decoder library with the transactional memory double; it does not establish deployed Firebase rules or production concurrency. No full screen-reader/real-device certification is claimed.

Run `npm.cmd run preview:payments`, then open `http://127.0.0.1:4173/my-payments?mode=reservation` for a sample session. Use fake credentials and synthetic receipt images only. The allowlisted loopback preview keeps evidence in memory until shutdown, never loads environment credentials, and sends no real payment/email. A new preview process resets its synthetic data.

Checkpoint subject: **`Payment CP3: add private manual proof submissions and demo QR`**. Next: **CP4 admin review/corrections and manual posting**, after review. The user has not authorized deployment, production seeding, migrations or new financial policy.

Skills applied: `.agents` Firebase authentication (including its delegated rules-author review), UI/UX confirmation/error-recovery guidance and responsive design; built-in image generation for the decorative demo asset. Technical references: [Sharp decoder options](https://sharp.pixelplumbing.com/api-constructor/), [Sharp output and metadata behavior](https://sharp.pixelplumbing.com/api-output/), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).
