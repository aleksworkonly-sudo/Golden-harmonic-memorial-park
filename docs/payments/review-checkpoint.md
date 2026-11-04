# CP4 — admin review and manual principal posting

Completed locally **November 1, 2026 · Asia/Manila**, starting from CP3 `26f8b3d`. No production configuration, data, live funds, deployment or migration was accessed or changed. Review remains disabled by default.

## Confirmed allocation policy

The user selected: **credit the verified actual amount; retain any excess as unapplied credit**. CP4 accepts verified partial/mismatched amounts as principal credit up to the remaining principal. Every credited centavo is explicitly allocated to a plot item. Excess remains a separately visible unapplied liability; it is never dropped, refunded or counted twice.

This does not approve a penalty formula, installment formula, fee, refund or schedule amendment. Deposit/installment/advance/settlement claims can record principal against an already approved, reconciled contract, but `lifecycleReviewRequired` remains set. CP7 must implement deposit satisfaction, schedules and lifecycle decisions. Zero principal balance does not change plot ownership or automatically settle a contract.

## Office workflow

1. Open **Manual payment review** from existing admin navigation or `/payment-review.html`. Sign in with admin/superadmin authority. Current server-side role is checked for every read and decision; staff/buyer/unknown/disabled roles are denied.
2. Filter the oldest-first queue by status, channel, exact customer/reservation ID, Philippine submission-date range or age. Pages contain at most 20 cases without image payloads.
3. Inspect the claim, immutable recipient snapshot, current/previous proof, latest 20 history entries, plot items, balance and competing-reference warning. Proof loads privately on demand.
4. Request correction, reject with a customer explanation, retain in reconciliation, or approve verified funds. Internal reasons and customer notes are separate. Rejection requires confirming no funds were received; actual received funds cannot be rejected away.
5. For confirmed money, enter actual amount, Philippine received date/time and statement reference. For approval, explicitly allocate principal across this contract's plots. Review received money, principal allocations and unapplied excess before saving.
6. An uncertain response preserves the reviewed command/request ID for a safe retry. Stale case/booking versions require reloading. Closed cases have no ordinary edit action.
7. Customers see status, customer note and internal acknowledgement ID. For explicitly migrated sources, refreshing secure history shows canonical ledger credit and separate unapplied money. Internal review reasons and actors do not appear in customer lists.

The `PAY-` acknowledgement is an internal identity, not official tax numbering or the CP5 cash print/photo workflow.

## Implementation

- `review.js`: admin-only queue/detail/proof reads and atomic decisions, including current transactional role checks before replaying a saved result.
- `review-http.js` / `/api/payment-review` (via `api/payments.js`): `PAYMENT_REVIEW_ENABLED` plus complete CP2 configuration; same-origin JSON POST, bearer identity, 32 KiB body bound, field allowlists, shared traffic caps and private/no-store responses.
- `payment-review.html/js/css`: existing green/cream style, responsive queue cards, labels, proof zoom, focused errors/confirmation, decision review and safe retries. Private UI clears on sign-out, identity change, bfcache restoration or a 15-minute review timer. No persisted browser proof/token draft.
- `canonical.js`: explicit source-to-booking checks and ledger history for opted-in sources. Unmigrated sources retain the CP2 legacy reader. Broken canonical mappings fail closed; old/new payment representations are never summed together.
- `identities.js`: preserves CP1's exact manual economic key and receipt identities. Display/configuration versions and channel labels cannot reset uniqueness. CP1 retains its narrow internal-only posting behavior.
- CP3 now separates `evidenceRevisionCount` / `rN` from optimistic case `version`. Admin decisions do not consume the ten-proof limit; buyer corrections retain immutable evidence and reference observations.

## Explicit canonical bridge — no migration performed

These are server-owned configuration contracts for a separately authorized migration. Local fixtures are not production seed data.

| Record | Required fields/invariants |
|---|---|
| Customer/presale source | Trusted `canonicalBookingId`; protected existing UID/contact version; no association by email |
| `paymentSubmissionScopes/{scopeHash}` | Matching source, `bookingId`, enabled/versioned offer and reconciled counters; approval checks submitted scope version |
| `bookings/{id}` | Schema 4, exact source kind/ID and owner binding, `migrationStatus: reconciled`, `legacyWritesBlocked: true`, `postingEnabled: true`, `policyStatus: approved`, active status, PHP, positive version/termsVersion |
| Booking principal | Positive total, nonnegative net credit and unapplied amount, exact balance = total − credit; safe integer centavos |
| Booking items | 1–100 unique item/plot IDs, positive item totals, bounded credits and positive ownershipVersion; sums match the contract |
| `plots/{plotId}` | Matching `paymentBookingId` and `paymentOwnershipVersion`, not available/released; approval reads every lock without changing inventory |
| Opening provenance | `openingBalanceId` references this booking's reconciled `opening_balance` ledger row with exact `openingCreditCentavos`; not a new receipt |
| Display snapshot | Approved planLabel and optional monthlyCentavos/deadlineDate/nextDueDate; unknown amounts/dates are not guessed |

New submissions capture trusted booking ID, terms version and owner binding. Older unbound cases cannot silently become eligible for posting; they remain reviewable/reconcilable pending an explicitly reviewed migration. Changed owner, contact version, mapping, terms, recipient version or plot requires reconciliation.

**`legacyWritesBlocked: true` is an assertion, not enforcement.** Existing portal/admin direct writes, PayMongo, reminders, sheets and reports are not migrated by CP4. Actual writers/rules/readers must be blocked/routed and reconciled before real canonical posting. Only the secure payment page and new review screen gain canonical-reader support here. This remains a release gate, not permission to flip a flag.

## Atomic decisions and money

Approval checks role, case version/revision, immutable proof/claim/quote, ownership, scope/recipient versions, approved policy, opening provenance, plot locks, allocations and economic uniqueness before writing. Receipt, ledger, item/booking projections, verified case, terminal counter, permanent economic key, audit, notification, operation result and dormant email outbox commit together. No email/provider call occurs in a transaction.

Permanent economic identity remains `sha256(JSON.stringify(['manual-receipt-v1', stableReceivingAccountId, trimmedReference]))`, preserving case and leading zeros. CP1 and CP4 share `economicPayments`; actual provider/manual reconciliation remains CP6. The outbox stays `awaiting_configuration` until CP8.

Correction/reconciliation remain open cases. Verification/rejection decrement `openCases` exactly once. Identical actor/request/payload retries return the saved result; changed payloads conflict. Another admin's stale decision cannot create a second receipt.

`paymentReconciliations/{paymentId}` retains exceptions separately from posted money. Confirmed money records exact received amount/time/account/reference and reserves its economic identity as `held`, without reducing principal. Later approval preserves those facts and converts the held key into one receipt. Changing erroneous confirmed-money facts requires a separate future audited workflow. Unconfirmed reconciliations also resolve on approval or close as `closed_no_funds` on rejection; immutable audits retain prior reasons/facts.

Reference warnings inspect 11 observations, beyond the maximum ten own proof revisions, so self-revisions cannot hide another case. A warning is not proof of fraud. Image similarity and OCR remain later work.

## Activation and operational gates

1. Keep `PAYMENT_REVIEW_ENABLED` unset/false until review; it also requires the earlier CP2 configuration. No environment file was read or edited.
2. Review/emulator-test the composed Firestore rules for canonical records and reconciliation. Raw financial/evidence collections stay server-only even against admin browsers. Protect source mappings, roles, UID/contact versions, scopes, recipients and plot ownership.
3. Merge actual queue indexes: schemaVersion plus each supported combination of status/channel/sourceId equality filters, then submittedAt ASC/paymentId ASC. Date/age bounds use submittedAt. Keep ledger index bookingId ASC/recordedAt DESC/receiptId DESC, CP3 list index and referenceClaims.claimKey lookup. No root rules/index replacement was invented or deployed.
4. Reconcile opening balances, items, locks, accounts, pending cases and provider events before provisioning. Actually block incompatible legacy writers/readers. Do not seed preview data.
5. Run Firebase Auth/Firestore emulator and staging tests for real SDK retries, rules/indexes, revoked users, contention, source cutover and platform limits. Current tests do not certify deployed concurrency/rules or real-device/screen-reader accessibility.
6. CP5 cash, CP6 provider reconciliation, CP7 schedules/lifecycle, CP8 delivery/reporting and CP9 migration/recovery remain pending. No refund, reversal, automatic schedule activation, penalty or plot release is implemented. Future reporting must distinguish reconciliation-held money from posted receipts.

## Validation and preview

**84 tests passed, 0 failed.** Includes CP1–CP3 regressions; admin-only access; actual/partial/excess allocations; source/quote/recipient/plot races; immutable evidence; competing approvals; correction/approval race; canonical buyer/guest parity; terminal counters; reconciliation lifecycle; shared CP1 economic identity; failed commits; queue filters/pagination; HTTP controls; dormant outbox behavior.

Both local Edge browser suites passed. CP4 covered staff denial, correction, buyer revision, current proof review, actual/excess approval, lost-response recovery, customer ledger parity and 320/390/768 px layouts. CP2/CP3 regressions also passed. Desktop/mobile screenshots were inspected. Syntax, JSON and whitespace checks passed. The backend fixture is an in-memory transaction double, not Firebase.

```powershell
npm.cmd run test:payments
npm.cmd run preview:payments -- --review
```

Open `http://127.0.0.1:4173/payment-review.html`. In this **local preview only**, use `admin@example.test` and any fake password; `staff@example.test` demonstrates denial. The loopback server uses synthetic in-memory records and mocked sign-in. It never loads production credentials or sends real email/money. Stop with Ctrl+C; never import fixture accounts into production.

Checkpoint subject: **`Payment CP4: add admin review and canonical manual posting`**. Resolve with `git log -1 --format='%h %s' --grep='Payment CP4:'`. Next: **CP5**, after review. See the [backup guide](checkpoint-backup-guide.md).

Skills: Firebase authentication and delegated rules/invariant review; UI/UX table/accessibility guidance; responsive design. The generic design-system search did not fit the existing interface; targeted table guidance and the established park style were used. References: [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [Firebase session verification](https://firebase.google.com/docs/auth/admin/manage-sessions).
