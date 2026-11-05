# Reservation payment loading audit — November 3, 2026

## Confirmed incident

The customer reached the saved-reservation screen on the public `/presale` URL before uploading any proof. The customer confirmed that Firestore has no `payments` composite index on `submissionScope ASC`, `submittedAt DESC`, `paymentId DESC`.

`PaymentSubmission.reload()` loads `context` and `list` with `Promise.all`. Context verifies the reservation session, booking, amount and receiving account using document reads. List queries the customer's submission history using the missing composite index. A list failure rejects the combined load, so the QR never renders even when its image and receiving configuration are valid. The handler previously swallowed the underlying error and returned the same generic message as an uncertain proof write.

The reservation save and payment loading are separate requests. An error on this screen does not undo the plot holds, and creating another reservation is not the recovery procedure.

## Immediate database repair

Firebase Console → Firestore Database → Indexes → Create index:

| Setting | Value |
|---|---|
| Collection ID | `payments` |
| Query scope | Collection |
| First field | `submissionScope` — Ascending |
| Second field | `submittedAt` — Descending |
| Third field | `paymentId` — Descending |

Use the same Firebase project/database as the deployed server credential. Wait for **Enabled** and use **Retry loading submissions** on the existing reservation. An expired creation session requires secure email access to that reservation, not a new reservation. Creating the index does not require redeploying Vercel or changing Firestore security rules.

Firebase automatically manages the final document-name ordering. Missing compound indexes must be created separately; a successful feature-flag GET does not execute those queries. See [Firebase index management](https://firebase.google.com/docs/firestore/query-data/indexing).

## Payment-system review

| Stage | Code behavior and deployment dependency |
|---|---|
| Receiving QR | Exact bundled asset/account/version match; feature flags, receiving document and proof budget must be configured. |
| Reservation | Origin/content-type checks, request idempotency, current prices, duplicate mobile, plot availability, budget and transaction writes. The reported screen indicates this step completed. |
| Creation session | Secure HttpOnly host cookie, 30-minute restricted scope, bound to the saved reservation/contact version. Only proof operations are allowed before email verification. |
| QR/context load | Document reads check session ownership, canonical booking and remaining deposit. A static image loading alone does not prove this succeeds. |
| Submission list | Requires the missing index above. Failure must not be treated as an empty list: pending/correction cases affect whether another payment should be started. |
| Proof upload | Server decodes/bounds images, rechecks ownership and quote, charges bounded private storage transactionally, and records pending evidence. It does not credit money. |
| Admin review | Requires admin identity and current role. The default status queue requires `payments: schemaVersion ASC, status ASC, submittedAt ASC, paymentId ASC`. Other filter combinations need matching indexes. |
| Approval | Requires confirmed statement receipt, correct booking version and allocations. Posting and receipt creation are transactional and idempotent. No real approval was performed in this audit. |
| Customer ledger/history | Requires `ledgerEntries: bookingId ASC, recordedAt DESC, receiptId DESC`; email delivery and token exchange must also work for later access. |
| Reports, notifications, provider and email queues | Additional compound query shapes exist. The read-only readiness script enumerates these; their live status is unverified. |

## Changes and verification

- Submission errors now distinguish missing history setup, read failures, and uncertain proof writes.
- Unexpected errors log only action, stage, a bounded reason, and numeric gRPC code. Request bodies, credentials, customer details, proof images and raw provider error text are not logged.
- Regression tests simulate the missing index while receiving context succeeds, and verify that private error details stay private.
- `scripts/payments/check-readiness.cjs` probes 18 compound query shapes with a one-document limit and discards results. It performs no writes. All eight manual-review equality-filter combinations are included; cash review uses a subset of those field shapes. Provider/report probes apply only if those features are used.

To print the inventory without credentials:

```powershell
node scripts/payments/check-readiness.cjs --describe
```

To check the deployed Firebase project's query prerequisites, run the same script without `--describe` in an environment already configured with that project's server credential (`FIREBASE_SERVICE_ACCOUNT_B64`). Do not paste credentials into chat or commit them. Output reports `ready`, `index_required`, or `failed` per query. `ready` verifies only that the query executed; it does not certify security rules, data integrity, email delivery, payment reconciliation or all runtime behavior.

No Firebase server credential or authenticated Vercel session was available in this workspace. No live indexes, rules, customer reservations or payments were modified. The index's absence was confirmed by the user, and the corresponding failure was reproduced with a test double. Existing local tests do not emulate Firestore's index requirements; passing those tests never meant live indexes were deployed.

## Admin sign-in follow-up — November 5, 2026

An error immediately after admin sign-in is a queue load failure, not a decision submission. The review endpoint previously returned its uncertain-decision message for all unexpected failures, including read-only queue queries. It now distinguishes missing indexes and read failures, logs bounded action/stage diagnostics, and reserves uncertain-result recovery instructions for decision requests. The browser likewise treats a network failure as an uncertain write only for `decide`.

The default pending-review queue needs a separate **structured composite index**, collection `payments`, query scope **Collection**:

1. `schemaVersion` — Ascending
2. `status` — Ascending
3. `submittedAt` — Ascending
4. `paymentId` — Ascending

The customer submission-history index does not cover this query. Verify that this review index is Enabled, then choose **Use my current sign-in** to reload the queue. If the index is already enabled in the server's Firebase project, inspect the `payment-review` runtime diagnostic rather than assuming a password problem. Filtered queues and ledger detail still need their own indexes as listed above and in the readiness checker. No live admin index was inspected or created during this follow-up.

### Embedded Admin Panel recovery

The missing default queue index was confirmed again after embedding review in the Admin Panel. In Firebase Console, choose **Create structured index**, collection **payments**, query scope **Collection**, with the four fields listed above, all Ascending. Keep the existing submissionScope index. Wait until the new index is **Enabled**, then click **Reload payment review** inside the Admin Panel. No Vercel redeploy is needed for this database-only fix. Use the Firebase project belonging to the deployed server credential.

To export all index definitions covered by the read-only readiness checker, including all eight admin filter combinations:

```sh
node scripts/payments/check-readiness.cjs --indexes
```

This requires no credentials and makes no cloud changes. The output is a **partial inventory of required additions**, not a replacement for the existing project's indexes or field exemptions. Export the actual inventory with Firebase CLI (`firebase firestore:indexes --project YOUR_PROJECT_ID`), merge the required additions, and deploy the merged configuration using `firebase deploy --only firestore:indexes --project YOUR_PROJECT_ID`. Do not delete existing indexes or reset field overrides. Verify readiness after the indexes finish building.
