# CP2–CP5 access controls — review artifact, not deployment rules

## Presale QR integration additions

Keep `presalePaymentRequests/**` and `presaleHoldLimits/**` server-only, including against authenticated admin browsers. The recovery capability is hashed at rest; protect its payload hash/result and the session records from direct reads and writes. Extend source/plot/booking protections to atomic new manual reservations, `accessVersion`, `paymentMigrationLock`, receiving QR/account identity and version, zero opening balances and submission scopes. These notes are not a replacement ruleset. Test the composed baseline before enabling `PAYMENT_PRESALE_ENABLED`.

Creation sessions authorize only proof operations for their own newly created reservation for 30 minutes. They must fail at history, provider and reporting endpoints; they do not verify email ownership. Test another-tab session changes, changed contact/version, logout, expiry, replay, correction versus approval, unauthorized QR configuration, and concurrent plot claims against the actual SDK/rules. See [presale integration](presale-qr-checkpoint.md).

## CP4 canonical money and review additions

Extend the composed server-only boundary to `paymentReconciliations/**`, `bookings/**`, `receipts/**`, `ledgerEntries/**`, `economicPayments/**` and `operationKeys/**`. No admin-browser exception. Protect audit/outbox/notification writes, canonical source links, scope/recipient versions and plot booking/ownership-version fields. A `legacyWritesBlocked` flag does not block existing writers; actually retire or route them through reviewed rules/endpoints before enabling a source.

Queue indexes consist of schemaVersion plus each supported combination of equality filters (status, channel, sourceId), followed by submittedAt ASC/paymentId ASC; date/age inequalities use submittedAt. Canonical history needs bookingId ASC/recordedAt DESC/receiptId DESC. Duplicate observations use referenceClaims.claimKey. Keep proof base64 exempt and exempt unqueried large reconciliation/audit text after reviewing the complete inventory.

Emulator gates include role removal during reads/idempotent replay, two admins, competing CP1/CP4 economic claims, correction versus approval, source/plot changes, opening/item invariants, held-money reconciliation, terminal counters and canonical customer/guest cutover. See [CP4 implementation and limits](review-checkpoint.md). The fragments below remain non-deployable review notes.

This fragment is deliberately outside the root Firebase configuration. It is NOT a complete ruleset and must not replace the deployed rules. The `.agents` Firebase authentication skill's rules-author review recommended this boundary.

```text
// Inside the existing match /databases/{database}/documents block:
match /reservationAccess/{document=**} { allow read, write: if false; }
match /reservationSessions/{document=**} { allow read, write: if false; }
match /paymentAccessLimits/{document=**} { allow read, write: if false; }
```

These collections are server-only, including against authenticated admin browsers. Firestore overlapping allows are OR-combined: the fragment does not override a broad `allow` elsewhere. The actual composed rules must exclude all three collections from broad grants and be tested before setting `PAYMENT_ACCESS_ENABLED=true`.

Also protect `presaleApplications.email`, `mobileKey`, `accessVersion`, `customers.authUid` and `users.role` against unauthorized changes. Authorize contact corrections through the office; increment `accessVersion` monotonically in the SAME transaction as each contact change. A fingerprint catches current mismatches but not a change away and back. Existing records with no positive accessVersion are deliberately ineligible for links; initial trusted version provisioning and fixing legacy contact writers are enabling prerequisites, not automatic changes by this checkpoint.

Emulator scenarios required against the real composed baseline: anonymous, owner, other buyer, staff and admin cannot get/list/write any private access collection; unauthorized users cannot relink customers/change contacts/raise roles; authorized legacy operations remain compatible. Add a broad-allow counterexample to ensure the review catches overlapping grants. Unit transaction doubles are not a substitute for these tests.

Server-side checks still apply because Admin SDK bypasses rules. Test token replay, two simultaneous exchanges, contact/version changes racing exchange and reads, logout racing idle renewal, expiry boundaries, scoped guest reads and request limits. CP2 closes the legacy reference/mobile lookup rather than providing a bypass.

Sources: [Firebase rule structure](https://firebase.google.com/docs/firestore/security/rules-structure), [Firebase rules tests](https://firebase.google.com/docs/rules/unit-tests).

## CP3 additions — still a review artifact, not deployable rules

The user chose capped private Firestore image documents. The following server-only boundaries are required in the **composed** rules after reviewing legacy compatibility:

```text
match /paymentSubmissionScopes/{document=**} { allow read, write: if false; }
match /paymentReceivingAccounts/{document=**} { allow read, write: if false; }
match /payments/{document=**} { allow read, write: if false; }
match /paymentProofs/{document=**} { allow read, write: if false; }
match /referenceClaims/{document=**} { allow read, write: if false; }
match /submissionOperationKeys/{document=**} { allow read, write: if false; }
match /paymentProofBudget/{document=**} { allow read, write: if false; }
```

This includes all revisions and authenticated admin browsers. Existing broad grants, `auditLogs` and `notifications` write authority, legacy financial writers, source cancellation state and account linkage must be reviewed too. These denials do not override another matching allow. No deployment or replacement root ruleset is included.

Before activation, exempt `paymentProofs.base64` from indexing and merge the collection-scope `payments` composite index (`submissionScope ASC`, `submittedAt DESC`, `paymentId DESC`) into the actual project inventory. Future OCR payloads need their own exemption. Raw proof documents are never queried for a list view.

Extend emulator negatives to anonymous, owner, other owner, guest, staff and admin get/list/create/update/delete on every private collection, including nested revisions and a deliberately broad overlapping allow. Add transactional budget/race, missing-budget, replay, quote/contact/ownership changes, closed source, correction-versus-verification and proof-read revocation scenarios. Local unit tests are not a substitute for this deployed-rule/integration work. See [CP3 contract and activation gates](submission-checkpoint.md).

## CP5 cash additions — not deployable rules

Keep `cashPrintEvents/**` server-only for reads and writes, including against admin browsers. Existing recursive payment/proof/reconciliation/economic/operation/audit/outbox boundaries cover schema-5 cash, nested photo revisions and immutable snapshots. Protect `paymentSubmissionScopes.cash` and stable register identities in `paymentReceivingAccounts`, plus canonical source/role/plot authorities. An overlapping allow still defeats a collection-specific denial.

Cash queue indexes: `payments`, collection scope, `schemaVersion ASC` plus each supported combination of `status ASC` and `sourceId ASC`, followed by `submittedAt ASC`, `paymentId ASC`. No full-collection newest-500 shortcut. Photo revisions are read from one payment's subcollection, ordered by `createdAt`; private image payloads are fetched by ID. Review index exemptions for base64, cashSnapshot, unqueried print metadata and internal reasons. Merge against actual indexes rather than deploying a replacement inventory.

Cash shares the existing proof budget; account for all retained transfer/cash revisions in provisioning and recovery. Test actual rules against anonymous/owner/other-owner/guest/staff/admin direct access, role revocation during replay, print/photo/snapshot identity mismatches, concurrent recording/approval/photo replacement, register/reference collision across bookings, exhausted storage retaining cash, and exactly-once held-to-posted reconciliation. Local tests include these domain cases but do not certify the deployed rules or SDK. No production rules/indexes were accessed or deployed.

See [CP5 contract and operational gates](cash-checkpoint.md). The skill-directed reviewer identified snapshot-versus-posting and cross-record receipt identity checks; both were added with negative tests. `legacyWritesBlocked` remains an assertion; legacy writer retirement and migration still gate release.

## CP6 provider additions — not deployable rules

Deny all browser access (including admin clients) to `paymentIntents/**`, `providerEvents/**`, `providerSessionBindings/**`, `providerIntentBindings/**` and `providerReceiptLinks/**`. Continue server-only economic/operation/ledger/receipt/audit/outbox scopes. Protect server quote allocations, `gatewayActiveId`, `gatewayHistory`, provider environment/account binding and receiving accounts. No collection-specific deny overrides an overlapping broad allow.

Merge indexes for `paymentIntents`: submissionScope ASC, createdAt DESC, intentId DESC; admin attempts: providerAccountId ASC, environment ASC, createdAt DESC, intentId DESC. `providerEvents`: providerAccountId ASC, environment ASC, createdAt DESC, eventKey DESC. Confirm actual query inventory before deployment. Exempt unqueried evidence/quote snapshots and private checkout URLs from indexing; no raw signed bodies/card data are retained.

Run deployed-rules/SDK negatives and concurrency tests, and staging tests for the `.mjs` named POST Web Request raw bytes, correct test/live keys, crash recovery, authentic provider events, duplicate event types, owner/role races and legacy overlap. Skill-directed review found and fixed owner return races, invalid evidence poisoning, conflicting duplicates and missing admin audit. Local tests are not deployed-rule certification.

## CP7 reservation lifecycle additions — not deployable rules

Keep `reservationReviews/**` server-only for both read and write, including authenticated admin browsers. Existing server-only `auditLogs` and `operationKeys` preserve decision history and idempotency. Protect `bookings.lifecycleEnabled`, `lifecycleTerms`, `lifecycle`, version/termsVersion and all related canonical source/plot bindings against every legacy browser write path. An overlapping permissive allow still defeats a collection-specific denial.

Admin queue: `bookings`, `lifecycleEnabled == true`, ordered by document ID (`FieldPath.documentId()`) ascending, 20 per page plus one cursor lookahead. Do not require a redundant bookingId field. Ledger derivation: `ledgerEntries`, bookingId equality, bounded at 501 to detect a 500-entry support limit; no silently truncated financial history. Check these queries against actual single-field/composite index inventory and emulator SDK behavior. Exempt unqueried calendar/review reason/snapshot fields where appropriate. No replacement/deployable index or rules inventory is supplied.

Emulator/staging cases must include direct anonymous/owner/other-owner/guest/staff/admin get/list/create/update/delete on private review/lifecycle state, current role revocation before cached replay, canonical source/terms races, concurrent posting/review, missing/mismatched redundant IDs, out-of-order receipts, malformed/oversized history and preservation of plot/money state after deadline passage or retain-hold decisions. Local tests cover domain behavior only. Skill-directed review found malformed-ledger TypeErrors and pagination omissions; both were fixed with regressions. No production rules, credentials or data were accessed.

## CP8 communications and reports — not deployable rules

Keep `emailOutbox/**`, `emailAttempts/**`, `paymentWorkerState/**` and `notifications/**` server-only for read/write, including against admin browsers. Extend the existing private ledger/receipt/review/audit/operation boundaries. Protect `bookings.notificationContact`, its monotonically increasing version and verified owner/email assertions; protect recorded allocation snapshots and every legacy contact/allocation writer. Historical receipt `ownerBinding` must not be changed to make a new owner pass authorization. No collection-specific denial overrides a matching broad allow.

Merge the actual query shapes into the existing project index inventory; do not deploy a replacement inventory from these notes:

| Collection | Query/order |
|---|---|
| `emailOutbox` | state equality, document ID ASC for queue/preparation cursors |
| `emailOutbox` | state equality, nextAttemptAt <= now, nextAttemptAt ASC for ready/retry work |
| `emailOutbox` | state == sending, leaseUntil <= now, leaseUntil ASC for expired attempts |
| `notifications` | submissionScope equality, createdAt DESC, document ID DESC |
| `ledgerEntries` | bookingId equality, recordedAt ASC, receiptId ASC for statements |
| `ledgerEntries` | receivedDate range, receivedDate ASC, receiptId ASC for collections |
| `bookings` | lifecycleEnabled equality, document ID ASC for reminder scans |

The final document-ID order is explicit via `FieldPath.documentId()`, not a redundant field. Validate actual SDK query/index behavior, required fields on migrated historical records, and Firestore transaction limits. Exempt unqueried outbox text, OCR candidate arrays, allocation snapshot arrays and attempt/audit reasons where appropriate. Define monitored retention for private messages and attempts; preserve uncertain records needed for recovery.

Extend emulator/staging tests to all direct-access roles, current owner/contact/terms changes, role removal before cached recovery, source remapping, guest expiry/renewal, two worker claims, crashes after provider acceptance, expired leases and stale reminders. Check report gross/principal/fees, zero opening balances, linked manual/provider receipts, scoped cursors and oversized/reversal ranges. Exercise realistic reservation counts and queue drainage with the intended scheduler; the bounded worker is not proof of adequate production capacity. The skill-directed reviewer identified reminder starvation, stale stages, notice chronology and the missing provider idempotency header; these were corrected with local regressions. No actual rules or indexes were inspected/deployed. See [CP8 contract](operations-checkpoint.md).

## CP9 cutover and recovery — actual composed rules still required

Repository inspection found no `firebase.json`, `.firebaserc`, deployed `.rules` or index inventory. No root replacement was invented. The CP9 release audit reports these gates as unverified and cannot promote a sample to production-ready. No Java emulator runtime was available; local tests use a transaction double and synthetic browser/HTTP data.

Keep future `paymentMigrationSnapshots/**` and any migration registry/lock audit server-only, including against authenticated admin browsers. Protect source `canonicalBookingId`/`paymentMigrationLock`, plot `paymentBookingId`/`paymentOwnershipVersion`/migration locks, financial arrays, accepted terms, owner UID/contact versions, recorded allocations and authoritative roles. Prevent marker removal, destructive replacement, delete/recreate, stale trash restoration and dot-field bypasses. Enforce current non-disabled admin authority for financial actions. Overlapping permissive grants must be removed or narrowed in the real composed rules; client helper checks cannot override them.

`payment-legacy-guard.js` supplies fresh transactional compatibility checks and related-write atomicity. Cached old clients/direct SDK calls still need deployed rule enforcement. A plot without a canonical lock must still check its associated source; a deleted target's absent marker cannot establish safe restore. CP9 conservatively disables financial trash actions. Auth account creation and already-started email/provider calls are external side effects: quiesce/drain them, then reconcile their results before migration.

Required rule/SDK scenarios: anonymous/owner/other buyer/guest/staff/disabled admin/admin direct get/list/create/update/delete on every private collection; marker removal and full replacement; old client writes after migration; changed plot owner during cancel/hold release; source/commission atomicity; current role revocation during transaction retry; contact changes away/back; deletion followed by unmarked restoration; duplicate reference/counter collision; and a deliberately broad matching allow. Verify document-ID query indexes and actual transaction retries/limits against the complete deployed baseline. No new query index is needed for the offline CLI or document-ID guard reads; prior CP2–CP8 indexes remain prerequisites.

The skill-directed review identified stale reservation overwrite, plot omission, missing opening allocation provenance, disabled-role checks and unmatched-provider/item-audit gaps. They were corrected with regressions. Review [CP9 release procedure](release-checkpoint.md) before requesting any real staging or production change.
