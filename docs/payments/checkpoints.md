# Payment implementation checkpoints

## Working agreement

The user selected Option A and authorized application implementation on October 30, 2026 (Asia/Manila). Implement one reviewable feature at a time, validate it, save a checkpoint, then pause before the next feature. This supersedes the earlier blueprint-only edit restriction. It does not authorize production deployment, a live payment, migration, or database changes.

Starting checkout: `presale-system` at `b5dd24ef1c309a1c3101126ac2b77e706ca91149`. The only starting modification was the previously reviewed `payment-feature-blueprint.md`; preserve that work. No branch switch or merge from `origin/main` is part of this checkpoint. The newer cash module is a candidate for CP5, after its documented defects are addressed.

The requested payment QR will be a random decorative **demo image**, clearly marked “Demo QR — not for payment,” created with the customer payment screen in CP3. It will not contain a receiving account or imply it can accept money. A receipt-verification QR is a different feature; its public-access policy remains open.

| Checkpoint | Scope | State |
|---|---|---|
| CP0 | Capture baseline, dependencies, scope, open policy and acceptance criteria | Complete |
| CP1 | Internal shared payment foundation and isolated tests | Complete; checkpoint `4102bc3` |
| CP2 | Account/guest access and read-only payment screens | Implemented and tested locally; activation remains disabled pending the gates below |
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

**At the CP1 checkpoint, no HTTP endpoint imported this library. No live database was contacted or changed.** CP1 included no new UI, guest session, payment submission, image, rules deployment, index deployment, email dispatcher, gateway action, or migration. CP2 now imports shared initialization/authentication into a separately gated read-only access route; the CP1 posting service is still not exposed.

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

The user resumed CP2 on October 31. Its completed work and next handoff are recorded below. Read this file and the current blueprint before resuming; verify the current branch/status; preserve unrelated work; do not merge the cash branch automatically. Revert/disable new integrations rather than deleting accepted financial history if later checkpoints need rollback.

Reference checks used for this foundation: [Firebase revoked-token verification](https://firebase.google.com/docs/auth/admin/manage-sessions), [Firestore transactions and retries](https://firebase.google.com/docs/firestore/manage-data/transactions), and [Node test runner](https://nodejs.org/api/test.html). The local `.agents/skills/firebase-auth-basics/SKILL.md` guided authorization. UI/UX and responsive skills apply when screens start at CP2; CP1 makes no visual accessibility claim.

## CP2 — secure access and read-only screens (October 31, 2026)

Starting commit: `4102bc3`; working tree was clean. The user requested the next checkpoint with `.agents` skills. No deployment, production data read/write, real email, or real payment was performed.

### Implemented

- `my-payments.html`, `payment-view.js`, `payment-view.css`: reservation email request, account login, explicit selection of multiple linked accounts, private recorded-payment history, pagination, pending-submission counts, errors/retry, logout and idle view clearing. Existing park colors, responsive cards, labels, keyboard focus and announced feedback are retained. The existing portal links to this view.
- `payment-link.html` / `payment-link.js`: a separate page with only local resources, no third-party SDK/analytics/font requests. It takes a fragment token into memory, immediately removes it from the address bar, and exchanges it only after a button click. A GET/email scanner visit never consumes the token. Uncertain exchange responses require a fresh link rather than minting another session.
- `lib/payments/access.js`: 256-bit random single-use links (15 minutes), hashed token/session records, atomic exchange with current contact/version checks, reservation-scoped sessions (30-minute idle, eight-hour absolute), revocation/logout, and transactional throttles. Only the stored matching email receives a link; responses do not confirm whether the reservation exists. No automatic account association by email/mobile.
- `lib/payments/access-http.js`, `api/payment-access.js`: disabled-by-default adapter, configured HTTPS origin, same-origin JSON POST checks, 4 KB input cap, field allowlists, revocation-aware Firebase bearer tokens, `__Host-` Secure/HttpOnly/SameSite=Strict session cookie, no-store responses and safe errors. Logout remains available even if traffic limits are saturated. This route changes only access tokens/sessions/limits, never money.
- `lib/payments/read-model.js`: read-only compatibility projection over existing `customers` and `presaleApplications`. Actual array entries are displayed with centavos and reversals. A missing gateway deposit or legacy paid-without-rows record requires office review; it is not fabricated as credit. No next due date is guessed from the first due date or paid/monthly arithmetic. Cursor version checks prevent mixing changed histories.
- `api/presale-track.js`: returns 410 and directs users to email verification. Reference/mobile alone no longer exposes private history. **This retirement is unconditional in source; deploying CP2 before its enabling prerequisites would make the old lookup unavailable while the new screen shows an office-contact message.** Release these changes together after review.
- `vercel.json`: no-store/referrer headers and a restrictive CSP for the exchange page. Existing crons/rewrites stay intact.
- `docs/payments/access-rules-review.md`: non-deployable rules review fragment and required tests, informed by the skill-directed rules-author review. No root rules/config file was invented or deployed.

### Activation requirements — not completed by local tests

1. Review/test the actual composed rules as described in `access-rules-review.md`. No browser, including an admin browser, may read/write access secrets, sessions or throttle state. Existing customer linkage, contact and role authorities must be protected too.
2. Provision a positive trusted `accessVersion` on eligible reservations through an authorized migration/office process. Every contact update must atomically increment it; this includes fixing legacy direct writers. Records without a positive version do not receive access links. Current fingerprint checks alone cannot detect contact changes away and back. No versions were provisioned by this checkpoint.
3. Run actual Firebase Auth/Firestore emulator and staging integration tests; review public request limits, provider delivery and cookie/HTTPS behavior. No Java/emulator runtime was available in the inspected environment, so the tests below use a transaction double and a mocked browser preview.
4. Configure `PAYMENT_ACCESS_ORIGIN` as the exact HTTPS origin with no trailing slash, `PAYMENT_ACCESS_RATE_SECRET` as a separately generated secret of at least 32 characters, and existing `BREVO_API_KEY` / `SENDER_EMAIL`. Only then deliberately set `PAYMENT_ACCESS_ENABLED=true`. No environment files or credentials were read/changed. Host headers never define email-link destinations.
5. Review retention and monitored cleanup for expired `reservationAccess`, revoked/expired `reservationSessions` and inactive `paymentAccessLimits`. CP2 does not provision TTL billing or a cleanup cron. Throttle keys are HMACs, not stored IP addresses. Defaults per 15-minute window: three link requests per reservation, ten per requester, 300 total link requests; 30 exchanges per requester; 120 general requests per requester and 2,000 overall. These are conservative technical defaults to tune before activation. Vercel requester identity uses its platform `x-vercel-forwarded-for`; other adapters use the socket or a conservative shared bucket.

Access emails use a fixed text template through Brevo outside transactions, with a timeout and delivery-state recording. This is not the financial CP8 outbox dispatcher. Failed/uncertain delivery is not retried automatically; a buyer can request a fresh link subject to limits. One-second minimum response padding reduces obvious differences but does not promise constant-time network behavior. Configure provider/logging to avoid capturing bodies/cookies; the token fragment keeps the secret out of ordinary page URL logs.

CP2 does not yet read CP1 canonical bookings into a migrated public view; legacy records remain the data source. A version-aware reader cutover remains required before future canonical posting goes live. Existing PayMongo/direct payment writers and their previously documented risks remain unchanged; no new posting route is enabled.

### Validation and preview

- `npm.cmd run test:payments`: **43 passed, 0 failed**, including CP1 regressions. New tests cover generic responses, stored recipients, no raw persisted secrets, request limits, expiry, concurrent exchanges, replay, contact/version races, logout/renewal, UID ownership, multiple accounts, read-model reconciliation, cursor isolation, origin/body/cookie controls, disabled configuration and retired lookup access.
- Optional `tests/payments/browser-smoke.cjs` ran with the existing bundled Playwright and headless Edge. It passed request confirmation/retry and focused errors, account selection/switching, history/pagination/logout, explicit token exchange, invalid links, disabled state, and no whole-page horizontal overflow at 320/390/768 px. No browser console exceptions occurred. Desktop/mobile screenshots were inspected. These tests use synthetic local data, not Firebase or actual email; no full screen-reader, real-device or production security certification is claimed.
- JavaScript syntax checks and `git diff --check` passed. No dependency install/upgrade was needed.

For a sample-only visual review:

```powershell
npm.cmd run preview:payments
```

Open `http://127.0.0.1:4173/my-payments` for access screens, or `/my-payments?mode=reservation` for sample history. Use fake login details only. The loopback server serves an allowlisted set of UI assets, mocks access/Firebase identity, and never loads `.env`, queries production, sends mail or posts payments. React assets load from their pinned public CDN. Stop the local server with Ctrl+C.

The CP2 commit is identified by subject **`Payment CP2: add secure access and read-only payment views`**. Find it with `git log -1 --format='%h %s' --grep='Payment CP2:'`.

**Next checkpoint: CP3 only**, after review. Add manual GCash/bank instructions, the clearly labeled random demo QR image, private validated proof submission/revisions and pending status; do not enable credit before CP4. Resolve private evidence storage before implementing uploads. The installment/penalty policy decisions remain open. No deployment or migration is authorized by saving this checkpoint.

Skills applied: Firebase authentication and its delegated rules review; UI/UX `accessible authentication` search (password-manager/paste support, labels and feedback); responsive design (content-driven grids, 44px+ controls and mobile layout). Reference checks: [OWASP link-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Brevo transactional email](https://developers.brevo.com/reference/send-transac-email), [Vercel requester headers](https://vercel.com/docs/headers/request-headers).
