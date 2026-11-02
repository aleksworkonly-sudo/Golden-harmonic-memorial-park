# Payment implementation checkpoints

For saved commit references, unfinished work and backup/restore steps, see the [checkpoint backup guide](checkpoint-backup-guide.md).

## Working agreement

The user selected Option A and authorized application implementation on October 30, 2026 (Asia/Manila). Implement one reviewable feature at a time, validate it, save a checkpoint, then pause before the next feature. This supersedes the earlier blueprint-only edit restriction. It does not authorize production deployment, a live payment, migration, or database changes.

Starting checkout: `presale-system` at `b5dd24ef1c309a1c3101126ac2b77e706ca91149`. The only starting modification was the previously reviewed `payment-feature-blueprint.md`; preserve that work. No branch switch or merge from `origin/main` is part of this checkpoint. The newer cash module is a candidate for CP5, after its documented defects are addressed.

The requested payment QR is a random decorative **demo image**, created with the customer payment screen in CP3 and clearly marked “Demo QR — not for payment.” It contains no configured receiving account and cannot accept money. A receipt-verification QR is a different feature; its public-access policy remains open.

| Checkpoint | Scope | State |
|---|---|---|
| CP0 | Capture baseline, dependencies, scope, open policy and acceptance criteria | Complete |
| CP1 | Internal shared payment foundation and isolated tests | Complete; checkpoint `4102bc3` |
| CP2 | Account/guest access and read-only payment screens | Implemented and tested locally; activation remains disabled pending the gates below |
| CP3 | Manual GCash/bank submission, private proofs and demo QR | Implemented and tested locally; disabled pending activation gates |
| CP4 | Admin review/corrections and end-to-end manual posting | Implemented and tested locally; disabled pending canonical cutover and activation gates |
| CP5 | Admin-only Record → Print → Photo → Approve cash workflow | Implemented and tested locally; disabled pending activation/cutover gates |
| CP6 | Secure PayMongo integration and shared reconciliation | Implemented and tested locally; activation disabled |
| CP7 | Deposit, original deadlines, installment timing and retained-hold review | Implemented and tested locally; amounts/penalties and live activation remain gated |
| CP8 | Notifications/reminders, read-only statements/collections, recorded allocations and OCR | Implemented and tested locally; dispatch and activation disabled; unconfirmed formulas remain gated |
| CP9 | Migration, recovery and release validation | Local rehearsal tools/cutover guards implemented and tested; actual migration, rules and production release pending |

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

**Handoff at CP2:** CP3 was next and was resumed by the user on October 31; its result follows below. The installment/penalty policy decisions remain open. No deployment or migration is authorized by saving a checkpoint.

Skills applied: Firebase authentication and its delegated rules review; UI/UX `accessible authentication` search (password-manager/paste support, labels and feedback); responsive design (content-driven grids, 44px+ controls and mobile layout). Reference checks: [OWASP link-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Brevo transactional email](https://developers.brevo.com/reference/send-transac-email), [Vercel requester headers](https://vercel.com/docs/headers/request-headers).

## CP3 — manual proof submissions (October 31, 2026)

Starting commit `ddb7a78`, clean working tree. The user authorized CP3 and selected **capped private Firestore image documents**. Implemented source and sample-only preview; activation remains off.

- Added GCash/bank receiving instructions, manual claimed fields, compressed image preview/zoom, confirmation, saved/pending acknowledgement, list pagination, private proof retrieval and immutable corrections/earlier proof viewing for account and reservation access.
- Added the generated decorative `payment-demo-qr.png`, clearly labeled “DEMO / NOT FOR PAYMENT.” It is not a payment destination.
- Added a separately gated submission API with current transactional owner/session checks, server-owned quote/recipient snapshots, idempotent submission, concurrency-safe proof/case/day limits, immutable reference observations, audit and notification events. No financial posting or email dispatch.
- Added pinned Sharp decoding/format/dimension/size checks and metadata stripping. Proof data is separate from list documents; storage is charged for every retained revision. No persistent staging upload is needed because validation precedes one atomic save.
- New schemaVersion 3 cases are deliberately incompatible with the isolated CP1 posting primitive. CP4 must implement approval/reconciliation and canonical linkage; no money/deadline/schedule changes occurred here.
- **62 tests passed**, including CP1/CP2 regressions. Local Edge checks passed account/guest proof flows, invalid image errors, review/mismatch, lost-response retry, correction/old evidence, expired access clearing and 320/390/768 px layouts. Screenshots, JavaScript syntax and whitespace were checked. Actual Firebase emulator/rules/indexes, staging/native Linux deployment and real receipt readability remain release gates.

Read [CP3 implementation, schemas, limits and activation requirements](submission-checkpoint.md) before resuming. New environment flag: `PAYMENT_SUBMISSIONS_ENABLED`, disabled by default and dependent on the full CP2 configuration. No environment credentials, production data or deployment was touched. Receiving-account/offer/budget provisioning remains a separately authorized task; previews must never be imported into production.

Checkpoint subject: **`Payment CP3: add private manual proof submissions and demo QR`**; find with `git log -1 --format='%h %s' --grep='Payment CP3:'`. CP4 was subsequently requested; its result follows below. Keep all confirmed rules; do not infer Q01/Q02 or enable live collection by changing a flag.

## CP4 — admin review and canonical posting (November 1, 2026)

Starting commit `26f8b3d`. The user authorized CP4 and confirmed crediting the verified actual amount, retaining excess as unapplied credit. During implementation the user also requested the [checkpoint backup guide](checkpoint-backup-guide.md), which tracks completed/pending work and source backup/restore steps; no backup archive or remote push was created.

- Added admin-only oldest-first filtered/paginated queue, current/previous private proof review, correction/rejection/reconciliation and confirmed principal approval with explicit per-plot allocations. Internal reasons remain separate from buyer notes.
- Added transactional current-role, case/evidence, source/quote/recipient, canonical contract, opening-credit and plot-ownership checks. Receipt, ledger, item/booking credit, unapplied money, case/counter, economic key, audit, notification and dormant outbox commit together.
- Canonical source routing and customer/guest history avoid combining legacy and new representations. It requires approved schema-4 booking/source/plot mappings and reconciled opening balances; no mapping or migration was provisioned. `legacyWritesBlocked` is only an assertion until actual legacy rules/writers are changed.
- Confirmed funds can be held in reconciliation without credit, then resolved into one receipt with the same economic identity. All terminal actions close existing reconciliation records and counters once. CP1/CP4 share permanent manual-transfer keys.
- Split evidence revision counts from admin decision versions. Customer corrections retain prior proof and no longer lose their allowance through admin actions. Reference warnings cannot be hidden by the case's own ten revisions.
- **84 tests passed**, plus CP4 and CP2/CP3 local Edge browser suites and inspected desktop/mobile previews. Real Firebase emulator/rules/indexes, migration/cutover, provider integration and production validation remain gates.

Read [CP4 implementation, canonical schema and activation limits](review-checkpoint.md). New flag: `PAYMENT_REVIEW_ENABLED`, off by default and dependent on CP2 configuration. No deployment, live payment, email, production data/configuration or environment-file change occurred. Schedules, deposit lifecycle, refunds, penalties and automatic plot release remain outside CP4.

Checkpoint subject: **`Payment CP4: add admin review and canonical manual posting`**. Resolve with `git log -1 --format='%h %s' --grep='Payment CP4:'`. **Next checkpoint: CP5 only**, after review.

## CP5 — admin cash workflow (November 1, 2026)

Starting commit `f6230ff`, clean working tree. The user requested the next checkpoint and confirmed **the same admin may record and approve cash**. Applied Firebase authentication (with delegated rules/invariant review), UI/UX progress/form guidance and responsive design.

- Added separately gated cash API and admin screen: record confirmed cash → print provisional receipt → retain private immutable printed-photo revisions → approve with explicit principal allocations/unapplied excess.
- Cash recording atomically reserves one receipt/economic identity and retains confirmed funds in reconciliation. No credit until approval. Duplicate register/reference, stale versions, missing/mislinked print/photo, changed roles/ownership/configuration and invalid allocations fail closed.
- Extracted CP4 canonical posting checks/writes into shared `posting.js`; cash and online approvals use the same ledger/projections. Recorded amount/time and printed snapshot agree; all receipt/evidence identities are checked. Same-admin approval is allowed.
- Added customer/guest cash status/photo display without customer edit authority, resumable bounded admin queue, print-specific layout and lost-response recovery. New receipts use internal `CASH-` identities; existing `CR-` migration/public verification/official tax numbering remain separate.
- **102 unit/HTTP tests passed**; CP5, CP4 and CP2/CP3 browser suites passed. Inspected desktop, 390px phone and print screenshots. Real Firebase SDK/rules/indexes, physical printing/receipt legibility, migration and production gates remain unverified.

Read [CP5 implementation and limits](cash-checkpoint.md). `PAYMENT_CASH_ENABLED` remains disabled by default. No production data/configuration, environment credentials, deployment, live cash, email or remote push was accessed or changed. The receipt itself has no public QR; the existing demo payment QR remains unchanged.

Checkpoint subject: **`Payment CP5: add admin cash record print photo approval`**. Resolve using `git log -1 --format='%h %s' --grep='Payment CP5:'`. Updated the [backup guide](checkpoint-backup-guide.md); no actual backup archive was created. **Next: CP6 only**, when requested. Cash intention codes are deferred to the reservation lifecycle, and void/refund/unassigned-cash exceptions remain later operational work.

## CP6 — PayMongo and reconciliation (November 1, 2026)

Starting commit `fb8d38a`. User confirmed retaining the existing 2.5% buyer fee, then explicitly requested CP6 review followed by CP7 in this turn. Applied Firebase authentication/rules review, UI/UX submission feedback and responsive design skills.

- Replaced unauthenticated amount-driven checkout with durable server-quoted, owner-bound intents, shared active attempts and recovery of uncertain creation without repeating a provider POST.
- Replaced the legacy webhook with a native Web Request adapter preserving original bytes, required test/live signatures, timestamp checks, durable inbox and atomic provider/economic deduplication.
- Shared canonical posting credits principal once, separates buyer/provider fees, retains unmatched evidence, and supports admin retry, distinct-money allocation or linking an existing manual receipt without another credit.
- Added customer checkout review/status and admin provider recovery/reconciliation UI; retired the two legacy browser checkout callers. Pending manual evidence blocks automatic provider credit; manual approval checks provider history.
- Review fixed stale-owner returns (including ownership/mapping changes during provider calls), malformed-event identity poisoning, cross-checkout duplicate receipt disclosure, and missing retry/recovery/expiry audit records. Regression tests cover the fixes.
- **127 tests passed**. CP6 plus CP5, CP4 and CP2/CP3 local Edge browser suites passed; desktop/mobile images inspected. These use synthetic provider/Firestore data. No real provider API/payment, Firebase SDK/emulator/rules, production environment, deployment or email was used.

Read [CP6 implementation and activation gates](gateway-checkpoint.md). Both gateway flags default off. Changing a flag is insufficient: approved canonical quote/configuration, actual legacy writer retirement, rules/indexes and staging verification remain mandatory. Existing in-flight legacy sessions need reconciliation; they are not automatically migrated.

Checkpoint subject: **`Payment CP6: secure PayMongo checkout and reconciliation`**. Find using `git log -1 --format='%h %s' --grep='Payment CP6:'`. CP7 is explicitly requested next. No remote push or backup archive was created.

## CP7 — verified deposits and retained-hold review (November 2, 2026)

Starting commit `4bdd8fa`. User confirmed anchoring installments to the payment completing the aggregate verified deposit, and **flagging overdue reservations for review while keeping plots held**. Work resumed after a usage-limit interruption. Applied Firebase authentication and delegated invariant/rules review, UI/UX confirmation feedback and responsive design skills.

- Shared posting derives verified principal deposit fulfillment and receipt-date anchors atomically with money. Fees, unapplied excess and pending evidence do not count. Receipt replay does not move dates or duplicate credit.
- Preserves the original three-month Manila deadline, spot-cash full-balance rule and original-anchor month-end arithmetic. Installment dates are visible; amounts and penalties remain explicitly accountant-gated. Existing accepted amounts/next-due fields remain intact.
- Added admin-only paginated reservation review, fresh detail checks, confirmation and idempotent retained-hold notes with immutable audit. Review never clears an unmet deadline, extends dates, releases plots or changes money.
- Customer/guest history shares current lifecycle results without admin notes. Historical credit, reversals, malformed provenance and more than 500 ledger entries require reconciliation; valid new receipts remain recordable under existing financial checks.
- Review corrected malformed-history exceptions and redundant-ID pagination. **145 unit/HTTP tests passed; all five local Edge browser suites passed.** Desktop/mobile screenshots, JavaScript/JSON syntax and whitespace were checked. No real Firebase/emulator/index/rules, provider payment, deployment, production configuration or email was used.

Read [CP7 contract](lifecycle-checkpoint.md). `PAYMENT_LIFECYCLE_ENABLED` gates the admin route; server-owned `bookings.lifecycleEnabled` separately opts approved canonical contracts into posting/read derivation. Neither was enabled in production. Policies, provisioning, actual legacy writer retirement, rules/indexes and staging remain activation gates. Buyer cash-intention codes remain proposed follow-up; binding schedule amounts, penalties, historical repair, refunds/extensions/releases are not silently implemented.

Checkpoint subject: **`Payment CP7: track deposits and reservation review`**. Resolve with `git log -1 --format='%h %s' --grep='Payment CP7:'`. **Next: CP8 only when requested.** No push or backup archive was created.

## CP8 — communications, reports and receipt reading (November 2, 2026)

Starting commit `64c0d83`. The user requested CP8 and confirmed reminders **three days and one day before, then one day after the original deadline**, plus **recorded allocations only** while commission/tax formulas remain unapproved. Work resumed after a usage-limit interruption. Applied local Firebase authentication with delegated rules/invariant review, UI/UX feedback guidance and responsive design skills.

- Added customer account/guest notices and immutable private print acknowledgements; an admin operations screen provides outbox inspection, fixed-recipient message preparation, uncertain delivery recovery, collection CSV/print and read-only customer monitoring statements.
- Added separately gated Brevo dispatch with durable bounded claims, stable provider idempotency keys, attempts/backoff, conservative uncertain outcomes and audited admin recovery. Payment posting remains independent of email outcomes. The worker integrates with the existing authenticated cron; actual capacity/frequency must be configured and verified before activation.
- Added deduplicated reservation reminders with current lifecycle, contact, pending-proof and gateway checks. Catch-up selects the latest applicable stage; it never bills unapproved installment/penalty amounts or releases plots.
- Reports reconcile canonical credit, separate fees/unapplied money, avoid double counting linked provider receipts and exclude opening balances from collections. Only recorded allocation snapshots are displayed; broader portfolio/settlement/refund exports and financial sheet edits remain follow-ups.
- Added optional local receipt reading, explicit suggestion acceptance, progress/cancel/timeout, preserved manual input and immutable bounded review metadata. The demo QR remains unchanged.
- Review fixed invalid mappings starving reminder progress, obsolete reminder stages, notification chronology, provider idempotency header use and oversized worker batches. **167 unit/HTTP tests and all six browser suites passed.** The pinned OCR reader successfully read a synthetic receipt on a diagnostic rerun after an initial timeout; manual fallback passed. Desktop/mobile screenshots were inspected; final syntax/whitespace checks passed.

Read [CP8 contract, configuration, limits and release gates](operations-checkpoint.md). Both new flags default off. No production contact/configuration, credentials, real email/payment, migration or deployment was used. Actual composed rules/indexes, Firebase SDK/emulator, provider delivery, dispatch capacity, real receipt samples and retention remain gates. Old canonical reminder writers are skipped, so coordinate cutover and messaging activation deliberately.

Checkpoint subject: **`Payment CP8: add communications reports and receipt reading`**. Resolve with `git log -1 --format='%h %s' --grep='Payment CP8:'`. **Next: CP9 only when requested.** No remote push or backup archive was created.

## CP9 — local migration/recovery rehearsals and cutover guards (November 2, 2026)

Starting commit `a28045c`. The user requested CP9 and continuation. No sanitized data or deployed rules/index baseline was supplied; after explaining those terms, work proceeded with synthetic records. Applied Firebase authentication with delegated rules/cutover review, UI/UX recovery guidance and responsive design. This checkpoint implements local tooling; it does not complete live migration or certify production readiness.

- Added bounded portable JSON inventory, explicit reviewed migration drafts, deterministic source/target hashes, offline application, manifest verification and restore into an empty/identical isolated snapshot. Changed/newer records are refused; no Firebase connection or live-apply mode exists.
- Drafts preserve original sources, accepted amounts/dates and immutable opening/item allocations, require exact plot coverage, and keep posting/lifecycle/notifications disabled. Ambiguous deposits/provider overlap, signed history, duplicates and pending evidence require review rather than fabricated credit.
- Added release data reconciliation for ledger/receipt/item/economic identities and plot locks, orphan records and unresolved external money/email states. Every production gate remains explicitly unverified; the tool cannot assert production readiness.
- Guarded legacy source/plot edits using fresh transactions and current roles. Presale plot effects and commission links are atomic; migrated portal records route to secure history. Financial trash restoration/deletion is disabled, provisioned contact versions advance atomically, stale reservation counters cannot overwrite existing sources, and old acknowledgements/reminders reject or skip migration markers.
- **186 unit/HTTP tests passed; all seven local browser suites passed.** The CP9 browser check parses the full JSX, exercises protected portal routing/legacy fallback/logout and 320/390/768 px layouts. Its screenshot was inspected. All seven CLI operations were rehearsed with synthetic examples; the draft audit returned expected exit 2. Syntax/JSON and whitespace checks passed.

Read [CP9 scope, CLI usage, restore procedure and real release gates](release-checkpoint.md). Actual rules/index files and Java/emulator support were absent, so no composed-rule or real SDK/emulator certification is claimed. Cached/direct SDK writers, full historical receipt/economic adapters, portfolio reader cutover, in-flight Auth/email/provider handling, real backups and staging evidence remain release work. No production credentials/data, deployment, live payment/email or remote push were used. Only synthetic temporary backup artifacts were created; these are not backups of the user's database.

Checkpoint subject: **`Payment CP9: add migration recovery rehearsals and cutover guards`**. Resolve with `git log -1 --format='%h %s' --grep='Payment CP9:'`. **Pause for review.** Next work requires the real baseline and explicitly authorized staging/migration/release scope; there is no implied CP10 or production activation.

## Hosting follow-up — Vercel Hobby function budget (November 2, 2026)

After CP9 `ddcd40d`, the user reported the 12-function deployment limit and requested a fix preserving all flows and design. Applied the local Vercel deployment and Firebase authentication guidance. Seven payment routes now share `api/payments.js` through explicit rewrites; the reminder helper moved to `lib/presale-reminders.js`. HTTP handlers, business logic, frontend assets, feature flags, PayMongo webhook and cron schedules are unchanged.

**196 payment tests passed.** Vercel CLI 65.4.0 built an isolated copy with synthetic project settings successfully: **nine generated functions and fourteen payment rewrites**. **42 packaged-handler checks passed.** The initial local build hit a Node compiler memory error; the retry used one build worker with JIT disabled. No authenticated Vercel dev session or hosted deployment was performed. Read [routing details and redeployment steps](vercel-routing.md). All CP9 production gates remain in force. This is a hosting fix, not CP10 or payment activation.

## Presale QR/proof follow-up (November 2, 2026)

The user authorized the held-plot → QR → proof → admin-verification flow, then confirmed the supplied GCash image is a placeholder after local decoding returned `09090909999`. The receiving name is Golden Harmonic; no Maya QR was supplied. Applied Firebase authentication with delegated security review, UI/UX form feedback and responsive-design skills.

- Added atomic new manual-reservation provisioning, original deadlines, zero opening credit, server-approved deposit scopes, restricted creation sessions and bounded hold creation. Recovery reuses the same reservation and does not extend dates or reprice existing contracts.
- Added QR-first customer screens, payer name/mobile/time, private proof upload, pending acknowledgement, correction history and current/previous payer details in admin review. Existing approval/actual-excess posting is reused; no parallel ledger was introduced.
- QR assets must match receiving document ID, account number/name, channel and version. Placeholder and missing QR configuration fail closed. New tab/cookie reservation mismatches are rejected. Maya is supported by the manual channel checks but remains unavailable until configured.
- **207 unit/HTTP tests passed.** The new presale browser suite plus existing customer-proof and admin-review browser suites passed with synthetic data. Mobile layouts at 320/390/768 px and screenshots were checked; JavaScript syntax and whitespace checks passed. The existing source function-budget guard still confirms nine API entry points; this follow-up did not run another Vercel build or deployment.

Read [presale QR checkpoint](presale-qr-checkpoint.md) for the implementation, exact configuration and unresolved release prerequisites. Real receiving QR/account configuration, composed Firestore rules/indexes and staging validation remain required. No live money, production credentials, database migration, external email, git commit, push or deployment was performed for this follow-up. Changes remain in the working tree for review.


## GCash receiving QR configuration (November 2, 2026)

The user replaced the placeholder with an InstaPay/GCash QR and explicitly confirmed the encoded recipient `JU**L B.` is authorized to receive park payments. The original replacement JPG is bundled unchanged and its hash is pinned. The active manifest binds it to `gcash-qr-v1`, version 1, with no invented mobile number. Maya remains unconfigured. A matching receiving-document JSON and [exact Firebase/Vercel activation guide](gcash-activation.md) are included.

**209 unit/HTTP tests passed**, including availability and submission context using the actual manifest/configuration against synthetic Firestore. No live payment was sent. Vercel CLI was logged out and browser control unavailable; the user selected manual setup instructions. No Firebase records, deployed environment variables, deployment, commit or push were changed. The source is ready for setup/deployment; live availability was not claimed.
