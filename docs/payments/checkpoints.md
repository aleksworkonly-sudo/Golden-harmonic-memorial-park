# Payment implementation checkpoints

## Working agreement

The user selected Option A and authorized application implementation on October 30, 2026 (Asia/Manila). Implement one reviewable feature at a time, validate it, save a checkpoint, then pause before the next feature. This supersedes the earlier blueprint-only edit restriction. It does not authorize production deployment, a live payment, migration, or database changes.

Starting checkout: `presale-system` at `b5dd24ef1c309a1c3101126ac2b77e706ca91149`. The only starting modification was the previously reviewed `payment-feature-blueprint.md`; preserve that work. No branch switch or merge from `origin/main` is part of this checkpoint. The newer cash module is a candidate for CP5, after its documented defects are addressed.

The requested payment QR will be a random decorative **demo image**, clearly marked “Demo QR — not for payment,” created with the customer payment screen in CP3. It will not contain a receiving account or imply it can accept money. A receipt-verification QR is a different feature; its public-access policy remains open.

| Checkpoint | Scope | State |
|---|---|---|
| CP0 | Capture baseline, dependencies, scope, open policy and acceptance criteria | Complete |
| CP1 | Internal shared payment foundation and isolated tests | Complete within the bounded scope below; ready for review |
| CP2 | Account/guest access and read-only payment screens | Not started |
| CP3 | Manual GCash/bank submission, private proofs and demo QR | Not started |
| CP4 | Admin review/corrections and end-to-end manual posting | Not started |
| CP5 | Admin-only Record → Print → Photo → Approve cash workflow | Not started |
| CP6 | Secure PayMongo integration and shared reconciliation | Not started |
| CP7 | Deposit, reservation deadlines, schedules and review lifecycle | Not started |
| CP8 | Notifications/reminders, reports/sheets/commissions, OCR and UI polish | Not started |
| CP9 | Migration, recovery and release validation | Not started |

## CP0 — baseline and policy gates

- Existing runtime: React UMD/JSX, Firebase compat in the browser, Firebase Admin in Vercel Node functions. Keep CommonJS for server libraries and the current runtime; no framework/package upgrade is required.
- Existing payment writers are not changed at CP1: portal reference submissions/confirmation, customer manual logging, presale recording, PayMongo webhook, and sheet editing. All must be mapped and retired/routed for migrated contracts before live activation.
- Preserve confirmed no-percentage-downpayment policy, credited ₱5,000 per plot deposit, original three-month deadline, next-month installment anchor, admin-only manual actions and the four cash steps.
- Q01 installment amounts and Q02 penalty calculation remain explicitly deferred. Other receiving-account, private-storage, fee, refund, allocation and migration questions remain in blueprint Section 21. CP1 does not infer an answer.
- No deployed rules/indexes or production baseline have been inspected. Existing checkout/webhook vulnerabilities remain outstanding; the new library does not secure endpoints that have not adopted it.

## CP1 — implementation and boundaries

Added `lib/payments/` as internal server libraries outside Vercel's `api/` routes:

| Module | Responsibility |
|---|---|
| `errors.js` | Stable domain error codes/statuses without leaking identity-service details |
| `money.js` | Exact decimal-to-centavo conversion, checked integer totals, per-plot deposit amount |
| `calendar.js` | Manila calendar dates, original-anchor month-end clamping, deadline/due-date helpers |
| `auth.js` | Revocation-aware token verification, current transactional admin role, current customer ownership |
| `firebase.js` | Lazy Firebase initialization before Auth/Firestore access, including cold starts |
| `service.js` | Atomic manual receipt primitive, request/economic deduplication, safe paginated history |

**No HTTP endpoint imports this library yet. No live database was contacted or changed.** No new UI, guest session, payment submission, image, rules deployment, index deployment, email dispatcher, gateway action, or migration is included.

The posting primitive intentionally handles only a **server-prepared, exact-amount GCash/bank balance credit on an active approved test contract**, where that credit leaves a remaining balance. It is not the complete CP4 approval flow. It rejects cash, gateway payments, deposits, final settlement, excess money, amount mismatch, unapproved policies, cancelled/unfunded contracts, stale versions and unvalidated/mislinked proofs. Later workflows must account for actual money received even when posting needs reconciliation; a rejected posting call does not mean funds never arrived.

Successful posting atomically creates a receipt, ledger entry, permanent economic-payment key, audit, in-app notification event, dormant email-outbox event and actor-scoped operation result, and updates the payment/booking projection. An uncertain response can be retried with the same request ID and payload; changed payload conflicts. Actual received time is separate from approval time. No email or provider call occurs in a retryable transaction callback.

`paymentHistory` rechecks `customers.authUid` or current admin role, returns only safe receipt fields, and uses bounded pagination with a stable timestamp/receipt cursor. Guest access is deliberately absent until CP2. This reader is receipt-only at CP1; extend its projection for signed reversal/adjustment entries before those writers exist.

### Data contract for the isolated fixtures

- `bookings/{id}`: `schemaVersion: 1`, `postingEnabled: true`, `policyStatus: approved`, `status: active`, `currency: PHP`, positive `version`, established `customerId`, `totalCentavos`, `netCreditCentavos`, `balanceCentavos`. These flags are server-owned migration/policy decisions, never browser input. CP1 provides no booking creator.
- `payments/{id}`: `schemaVersion: 1`, `status: pending_verification`, `version`, `bookingVersion`, `bookingId`, `currency: PHP`, `channel: gcash|bank`, `purpose: balance`, exact `expectedAmountCentavos`, stable `receivingAccountId`, `proofId`, `revisionId`. CP1 provides no submission/quote creator.
- `paymentProofs/{id}`: matching booking/payment/revision plus server-established `validationStatus: validated`. This flag is not an upload validator. A real decoder/storage/revision pipeline must be implemented at CP3.
- `economicPayments/{digest}`: permanent uniqueness record for stable receiving account plus verified statement reference. Configuration version and channel labels do not reset uniqueness. Reference trimming preserves leading zeros/case; approved provider-specific normalization and cross-channel/provider reconciliation must be added later. This is not a universal fraud detector.
- `operationKeys/{digest}`: actor/action/request scope, decision hash and original result. Permanent receipt uniqueness does not depend on request-record retention.
- `receipts`, `ledgerEntries`, `auditLogs`, `notifications`, `emailOutbox`: deterministic identities tied to the original payment. `PAY-<digest>` is an internal acknowledgement identity, not official tax numbering; existing `CR-` and AR numbers must be preserved by migration/adapters.
- Outbox events have `state: awaiting_configuration`; they contain no recipient copied from the approval request. CP8 must resolve/store the approved recipient/template and activate dispatch deliberately.

History query prerequisite: a collection-scope composite index on `ledgerEntries` with `bookingId ASC`, `recordedAt DESC`, `receiptId DESC`. No index file is deployed in CP1; integrate this with the reviewed project index inventory before connecting the reader.

### Verification

Run from the repository root with Node 22:

```powershell
npm.cmd run test:payments
```

Result on October 30: **21 tests passed, 0 failed**. The suite exercises exact centavos/invalid amounts, Manila midnight/month ends/leap year, cold-start initialization, revocation handling, ownership, staff/unknown/disabled roles, payload allowlists, role removal during commit, identical/concurrent retries, changed-payload conflict, duplicate transfer evidence, atomic failure/retry, policy/state/proof gates and history pagination/privacy.

The transaction double models read-version conflicts and staged atomic commits. It is not the Firebase emulator and does not prove deployed Security Rules, index availability, network behavior, Auth/Firestore SDK integration, or production concurrency. No blueprint A01–A39 case is certified end-to-end; these are foundation-level checks supporting portions of those criteria. No app build script existed; no dependency install was needed.

### Required before connecting or enabling a route

1. Review deployed Firestore rules. Deny browser writes to server-owned payment/booking/receipt/proof/role/uniqueness/audit/outbox state; a permissive overlapping rule can defeat a new collection-specific denial. Review users/profile linkage as well. Use the Firebase skill's rules-author workflow when implementing rules.
2. Run Auth/Firestore emulator integration tests for actual SDK transactions, permissions, revoked/disabled users, concurrent role/booking changes, indexes and retry behavior. Do not replace the existing deployed rules with an incomplete sample.
3. Add route input/authentication, Origin/CSRF/session handling as appropriate, rate limits, safe error responses and request-size limits. Core functions alone are not an HTTP security boundary.
4. Add authoritative quote/submission/proof generation and a reconciliation path. Do not write test fixtures into production or turn `postingEnabled` on for legacy records.
5. Expand lifecycle/item/installment allocations, cash/provider paths, reversals and settlement only with approved policy and their checkpoint tests. Never silently treat this primitive as their implementation.

### Saved checkpoint and resume

The CP0/CP1 checkpoint commit is identified by subject **`Payment CP1: add isolated posting foundation and checkpoint`**. Find it with `git log -1 --format='%h %s' --grep='Payment CP1:'`. The commit is a source checkpoint, not a deployment.

Next review: inspect the modules and run the test command. After review, resume **CP2 only**: secure account/reservation access and read-only payment views. Read this file and the current blueprint first; verify the current branch/status; preserve unrelated work; do not merge the cash branch automatically. The demo payment QR belongs to CP3. Revert/disable new integrations rather than deleting accepted financial history if later checkpoints need rollback.

Reference checks used for this foundation: [Firebase revoked-token verification](https://firebase.google.com/docs/auth/admin/manage-sessions), [Firestore transactions and retries](https://firebase.google.com/docs/firestore/manage-data/transactions), and [Node test runner](https://nodejs.org/api/test.html). The local `.agents/skills/firebase-auth-basics/SKILL.md` guided authorization. UI/UX and responsive skills apply when screens start at CP2; CP1 makes no visual accessibility claim.
