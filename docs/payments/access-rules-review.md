# CP2–CP5 access controls — review artifact, not deployment rules

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
