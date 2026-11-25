# Buyer Accounts — Modular Implementation Blueprint

Project: Golden Harmonic Memorial Park

Updated: November 25, 2026 (Asia/Manila)

Status: Planning complete; implementation has not started.

Inspected baseline: `presale-system`, commit `670038c`, plus the pre-existing working-tree changes listed in section 12.

This document is the durable plan for customer accounts covering presale and future payments. It supersedes the previous registration proposal in this file, including its direct browser email-matching linkage and example root security rules. Do not deploy those earlier examples. Existing financial requirements remain in [payment-feature-blueprint.md](payment-feature-blueprint.md).

The current request authorizes this documentation update only. No application implementation, live email, account creation, rules deployment, migration or hosting change has been performed. When implementation is requested, proceed through the checkpoints below and save progress after each small deliverable. Continuation must depend on repository records rather than chat memory.

## 1. Outcome and confirmed decisions

Buyer pays through the existing flow → payment is verified and recorded → buyer receives an activation email → buyer verifies email and chooses a password → account opens existing records and supports future payments.

| Decision | Status |
| --- | --- |
| Future login uses email and password | Confirmed by user |
| Invite after the first verified payment, not after proof submission | Confirmed by user |
| Use the buyer's own email | Confirmed by user |
| Cover presale and future customer payments | Confirmed by user |
| Implement by feature with durable checkpoints for continuation across chats/token exhaustion | Confirmed by user |
| Stay on Firebase | Existing project decision; Supabase migration cancelled |
| Preserve existing payment records, balances, ownership and contract terms | Architectural requirement |

The account email is the buyer's registered contact email. Do not replace it with a wallet sender, agent or provider billing email. Verified email proves mailbox control; the server must separately authorize access to each reservation or contract.

## 2. Open business decisions

Recommendations below are not approvals. Record answers and dates when received. Continue independent foundation work while a decision is pending.

| ID | Question | Recommendation | Blocks |
| --- | --- | --- | --- |
| D1 | Invite buyers who paid before this feature launches? | Yes, after reviewing contact details and existing links | Historical invitation campaign |
| D2 | Is activation optional or eventually mandatory for future payments? | Encourage activation; retain verified reservation email access during transition | Mandatory-access rollout; do not remove guest access by assumption |
| D3 | Does any positive verified payment qualify, or must the required deposit be fully funded? | Any positive payment successfully credited to the contract | Production invitation eligibility policy |

Model D3 as an explicit policy with tests for both choices. An unset policy must not send invitations. Pending proof, a browser success page, a printed cash receipt, an unverified cheque or funds awaiting reconciliation are insufficient.

Proposed multiple-purchase behavior: one login can have multiple individually authorized contracts. This does not approve changing the current rule rejecting another active reservation for the same mobile number. Address that reservation policy separately if needed.

## 3. Skills, references and review limits

Applied local skills:

- [Firebase Authentication](.agents/skills/firebase-auth-basics/SKILL.md): Firebase UID identity, verified email, server token checks and protected account linkage. Its rules guidance prompted a focused read-only access review.
- [UI/UX](.agents/skills/ui-ux-pro-max/SKILL.md): short forms, explicit states, accessible authentication and recovery. The local `accessible authentication` search returned a matching guideline supporting password managers, autofill and paste.
- [Responsive design](.agents/skills/responsive-design/SKILL.md): mobile-first layouts, flexible content and touch targets.

Use relevant skills during implementation. Skill setup examples do not establish that the live Firebase project is configured or authorized for deployment.

Official references checked during planning:

- [Firebase email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth): verified onboarding, cross-device email entry and session-injection considerations.
- [Firebase Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links): generate links for delivery through an existing mail provider.
- [Firebase user management](https://firebase.google.com/docs/auth/web/manage-users): password setup/recovery and recent authentication.
- [Firebase Auth limits](https://firebase.google.com/docs/auth/limits): confirm the actual project quotas before enabling delivery.

Recheck version-dependent behavior at implementation. The current stack uses browser Firebase compat scripts, React without a build framework, Firebase Admin and Vercel. No framework or database migration is needed for this feature.

The planning review covered account, presale, payment, approval, gateway, receipt, notification, staff provisioning and routing source paths. Live Auth users, deployed rules, feature flags, sender setup and production records were not inspected. Repository review fragments and local tests do not certify production security.

## 4. Existing system and constraints

| Area | Existing files / functions | Required integration |
| --- | --- | --- |
| Public account modal | `site.jsx`: `CustomerPortal`, `PortalLogin`, `PortalForgot` | Login/reset exists; replace first-record-only navigation with unified contract access |
| Staff provisioning | `admin-app.js`: `createPortalAccount` | Existing secondary-app Auth creation and Firestore linkage can fail separately |
| Payment portal | `my-payments.html`, `payment-view.js` | Reuse history, balance and contract selection |
| Guest access | `payment-link.js`, `lib/payments/access.js`, `access-http.js` | Reservation email sessions are not Firebase accounts |
| Presale proof | `presale.jsx`, `presale-payment.js`, `lib/payments/presale-payment.js` | Creation session is restricted and does not prove mailbox ownership |
| Manual/cash posting | `lib/payments/review.js`, `cash.js`, `posting.js` | Hook successful financial posting |
| PayMongo | `lib/payments/gateway.js`, `gateway-http.js` | Validated provider posting, never browser redirect, establishes payment |
| Account authorization | `access.js`, `submission.js`, `gateway.js`, `operations-access.js`, `auth.js` under `lib/payments/` | Extend every applicable path through one source resolver |
| Receipts/notices | `lib/payments/reports.js`, `outbox.js`; legacy `api/my-receipts.js` | Keep access consistent and avoid duplicate receipts |
| API routing | `api/payments.js`, `lib/payments/router.js`, `vercel.json` | Add account route through existing function where practical |
| Scheduling | `api/send-reminders.js`, `vercel.json` | Existing scheduled reminder invocation is daily; prompt invitations need a delivery/retry plan |

Important findings:

1. `canonical.ownerBinding()` derives customer identity from `authUid` and presale identity from `accessVersion`. Pending proofs, receipts, provider attempts and outbox events carry those bindings. Do not convert a presale into a customer record, copy balances or change its financial identity merely to enable login.
2. New presale bookings have `notificationContact.enabled=false`. The financial outbox requires a verified contact and cannot bootstrap initial verification unchanged.
3. Existing `authenticate()` returns UID only. Claim-specific verification must obtain trusted verified-email evidence, not a client Boolean.
4. Existing account operations authorize `customers.authUid`. Merely listing a presale in the account UI would still leave its proof, gateway and receipt operations inaccessible.
5. Broad matching Firestore allows can defeat narrow denials. Actual composed rules must be reviewed; Admin SDK operations still require server checks.
6. Account activation must not enable unconfigured payment channels, change installment formulas or bypass existing financial migration gates.

## 5. Customer experience

### Reservation and payment

Under the existing email field, explain: "Use your own email address. After your first payment is verified, we will send you a link to activate your account."

Show the email again on the review screen. Preserve first-payment QR, proof, cash and gateway flows without requiring a password upfront.

| State | Customer experience |
| --- | --- |
| Proof submitted | "Payment submitted — awaiting verification. We will email your account setup link once your payment is confirmed." |
| Correction requested | Existing correction instructions; no paid-account invitation |
| Qualifying payment posted | Queue invitation once and show setup guidance in an authorized view |
| Email delayed | Explain payment remains recorded; offer resend/recovery |
| Account active | Show **Open My Account**; do not invite again on every payment |

Approval can happen after the browser closes. Email is the primary invitation channel. Never disclose a full buyer email or payment information through an unauthenticated lookup response.

### Activation

1. Open branded email and select **Activate my account**.
2. Verify mailbox ownership through a purpose-specific Firebase setup flow. On another device, ask for the registered email when required. Never trust an email supplied in a redirect URL as identity proof.
3. New users choose their own password. Show the verified email, password/show-password control and necessary terms/privacy acknowledgement; reuse recorded buyer details.
4. Existing users sign in or recover their account, then confirm linking. Preserve their UID and password. A browser signed into a different account must show an explicit switch step.
5. Server rechecks the invitation, verified identity, current contact, eligibility and ownership conflict before committing the source claim.
6. Open My Account with the existing contract, receipts and balances.

Recommended technical approach: Firebase email-link authentication for initial verified onboarding, then password setup for future email/password login. This is a proposed implementation choice, not a change to the selected future login method. A02 must prototype new-user, existing verified/unverified user, password setup and interrupted flow behavior with the actual SDK before relying on it.

Firebase user creation alone does not activate source access. Auth creation, password setup and Firestore claiming are separate operations with recoverable state. Do not create duplicate customer records or delete an Auth user to compensate for interrupted linking.

### Future use and recovery

- One My Account entry leads to linked contracts, plots, balances, verified payments, pending submissions, available payment methods, receipts and notices.
- Use existing office-approved due dates and payment logic. Pending amounts do not reduce balances.
- Provide password reset, setup resend, expired-link recovery and clear sign-out.
- Keep guest email access during transition unless D2 explicitly changes that policy.
- A later contract can be claimed by the same UID without another login account.
- Incorrect email or loss of inbox access uses audited office-assisted verification in v1. Editing an email must not silently transfer account ownership.
- Full settlement retains history access. Cancellation/refund changes financial status, not automatically account identity or historical visibility.

### UI acceptance

Reuse the existing design. Do not add unrelated sex/address/profile questions solely for account access. Permit password managers, autocomplete and paste. Use visible labels, inline errors, keyboard focus, announced progress and 44px minimum touch targets. Verify 320px, 390px, 768px and desktop layouts without overflow. Keep payment status, delivery status and activation status distinct.

## 6. Feature modules and API contracts

The following paths are proposals, not files already created. Add them in their assigned checkpoint. Keep business logic separate from HTTP, providers and UI.

| Feature | Proposed modules | Responsibility |
| --- | --- | --- |
| Identity and policy | `lib/accounts/identity.js`, `policy.js`, `errors.js` | Trusted identity, verified email, eligibility and stable validation errors |
| Source access | `lib/accounts/access.js` | UID-to-source authorization; no financial calculations |
| Invitations | `lib/accounts/invitations.js` | Scoped lifecycle, expiry, replay and revocation |
| Firebase adapter | `lib/accounts/firebase-auth.js` | Native Auth/action-link operations; no custom password storage |
| Claiming | `lib/accounts/claims.js` | Transactional grant creation, conflicts, idempotency and audit |
| Delivery | `lib/accounts/delivery.js` | Minimal setup template, durable attempts and retries |
| HTTP | `lib/accounts/http.js` | Origin/token checks, body limits, rate limits and safe responses |
| Activation UI | `account-activate.html`, `account-activate.js`, `account-auth.js`, `account.css` | Setup, login, password and recovery components |
| Payment adapters | Small edits to existing payment modules | Typed source selection and shared authorization |
| Office support | `account-admin.js` and thin admin integration | Status, resend and audited correction/revocation |
| Verification | `tests/accounts/` | Domain, HTTP, Auth/rules integration and browser tests |

Avoid expanding `site.jsx` and `admin-app.js` with unrelated account business logic. No new framework migration is part of this work.

### Shared source authorization

Proposed internal contract:

```text
resolveBuyerSource(transaction, verifiedIdentity, sourceSelector)
  -> { kind, id, data, key, actor, renew }
```

A selector is a lookup hint, never authority. Check the current UID grant, revocation/contact versions and source-to-booking binding in the transaction protecting the operation. Then run existing canonical financial checks.

Use an explicit customer/presale selector; do not overload `customerId` with a presale ID. Update strict HTTP schemas deliberately. Apply the resolver to history, proof context/list/read/submit, gateway context/create/status, receipts and notifications. Review `requireBookingReader` and legacy receipt access too.

Preserve trusted existing `customers.authUid` access through a documented compatibility adapter. Email matching must never become an alternate authorization path.

### Proposed API and switches

Route `/api/account-access` through the existing function/router where practical. Suggested actions: `request_setup`, `setup_context`, `complete_claim`, `account_sources`, `setup_status`. Private actions require Firebase identity or the appropriate scoped setup proof. Public resend responses remain generic and rate limited.

Staff support actions use fresh role verification and separate schemas. The client cannot choose arbitrary recipients, grant roles, declare payment verified or set authoritative ownership. Whitelist redirect destinations. Use no-store/no-referrer protections and avoid analytics on credential-handling pages.

Proposed feature switches: `ACCOUNT_ACCESS_ENABLED`, `ACCOUNT_INVITES_ENABLED`, `ACCOUNT_EMAIL_DISPATCH_ENABLED`, `ACCOUNT_INVITE_POLICY`. New behavior defaults off. Existing payment and guest flags retain their meaning. A completed source checkpoint does not authorize live activation.

## 7. Data model and invariants

| Proposed collection | Purpose |
| --- | --- |
| `portalProfiles/{uid}` | Setup state, display preferences, terms/privacy versions and timestamps; no staff role authority |
| `portalAccess/{sourceKey}` | Active buyer UID, source kind/ID, booking ID where applicable, contact authority version, status and audit timestamps |
| `accountInvitations/{inviteId}` | Source, qualifying receipt, intended normalized email, contact/policy version, generation, expiry and claim state |
| `accountDeliveryEvents/{eventId}` | Invitation delivery intent, attempts, lease, outcome and provider message ID; no usable action URLs |
| `accountOperationKeys/{id}` | Idempotency hash and safe operation result |
| `accountAccessLimits/{id}` | Bounded server-managed counters without raw IP logging |

Authoritative account/link/invitation records are server-only. Expose minimal customer views through APIs. Any later direct profile editing requires a separate field allowlist. Protect these collections in the actual composed rules, including overlapping matches.

Required invariants:

- Firebase UID is stable identity. Normalize emails consistently without inventing provider-specific dot/plus alias equivalence.
- Claim one explicitly authorized source, not every record sharing an email. Ambiguous historical records require review.
- V1 allows one active buyer grant per source and multiple source grants per UID. A different UID cannot overwrite an existing owner.
- Preserve financial source/booking IDs, `ownerBinding`, economic payment identity, balances and receipts.
- Source contact changes invalidate applicable outstanding invitations and access according to an audited version policy. Do not increment presale `accessVersion` simply to add login; true contact corrections must coordinate existing financial binding/reconciliation behavior.
- After claim, provision verified notification contact using the correct version and existing booking binding. Email verification is not marketing consent.
- Passwords remain in Firebase flows. Never log/store passwords, refresh tokens or usable action links in Firestore, ordinary outbox content or handoff notes.
- If a custom invitation capability is needed, use strong randomness, a stored hash, scope, expiration and one-time claim. Firebase verification still establishes mailbox ownership.
- Claim transactions recheck current contact, identity, eligibility and ownership before consuming the invitation. Repeated successful requests from the same UID return the saved result.
- Customer setup never grants staff roles. Existing staff identities or conflicting legacy links follow an explicit reviewed path.

## 8. Payment trigger, delivery and recovery

Track payment, delivery and claim states separately. Suggested invitation states: `eligible`, `invited`, `claimed`, `expired`, `revoked`, `needs_review`. Delivery states: `queued`, `sending`, `accepted`, `retry`, `uncertain`, `failed`, `suppressed`. Provider acceptance does not prove human delivery/opening.

Record a deterministic invitation intent with the first qualifying successful posting, or use an equivalently durable reconciled event adapter. Respect Firestore read-before-write transaction ordering. Never call Auth or Brevo inside a retriable financial transaction.

Send after commit through awaited/bounded work or a supported durable runner. Do not rely on detached promises in a serverless response. Email failure must not turn a committed payment into a payment failure or cause another credit. Choose and verify a prompt retry mechanism supported by the actual hosting plan; the existing daily cron is not enough.

The initial setup message uses the stored buyer address and minimal information before verification. Recheck invitation/contact generation, eligibility and claim state before each send. Suppress obsolete invitations. Generate action links at delivery time and keep usable secrets out of durable ordinary logs/outbox text.

Use deterministic events to deduplicate approval/webhook retries. Bound attempts and preserve ambiguous provider outcomes for review. Resend supersedes obsolete application invitations. Define invitation expiration separately from Firebase action-code expiration; never promise a lifetime beyond Firebase's actual limit.

If account/password setup succeeds but linkage fails, resume claiming while authenticated. If claiming succeeds but its response is lost, return the saved result on retry. Do not create another reservation, receipt or Auth account.

## 9. Implementation checkpoints

Each checkpoint has a small scope, dependencies, acceptance criteria and saved handoff. Modular does not mean dependency-free. Implement behind disabled switches until the integrated feature is ready.

| ID | Feature | Depends on | Deliverables | Acceptance criteria |
| --- | --- | --- | --- | --- |
| A00 | Baseline and decisions | Implementation request | Inspect checkout; record drift/D1–D3; create progress records | Baseline, unrelated edits and external gates documented |
| A01 | Identity, policy and access | A00 | Verified identity adapter; eligibility contract; source grant schema; shared resolver and legacy adapter | Unauthorized sources denied; existing linked customer behavior covered |
| A02 | Invitations and claims | A01 | Firebase bootstrap prototype; invitation lifecycle; claim transaction; interrupted-flow recovery | New/existing/unverified users, conflicts, replay and concurrent claims tested |
| A03 | First-payment trigger | A02 | Posting event integration; D3 policy tests; deduplicated eligibility | Manual/cash/gateway queue once after qualifying posting; pending/held funds never queue |
| A04 | Delivery and resend | A02–A03 | Brevo setup message; delivery states; dispatch/retry adapter; resend limits | Email failure preserves payments; stale recipient suppressed; prompt delivery/retry plan verified |
| A05 | Activation, login and recovery | A02, A04 | Setup UI; password flow; existing-user and expired-link/resume screens | Mobile/keyboard/cross-device flows pass; private source access requires valid claim |
| A06a | Account list and history | A01, A05 | Typed source selection; multi-contract view; account navigation | Correct customer/presale records per UID; no first-record-only restriction |
| A06b | Proof and future payments | A06a | Submission HTTP/domain/UI integration | Presale account can submit/correct proof; wrong grants denied; pending credit unchanged |
| A06c | Gateway, receipts and notices | A06b | Gateway/operations adapters and legacy compatibility | Uniform authorization and unchanged financial bindings/receipts |
| A07 | Office support and prior buyers | A04, A06c | Status/resend; audited correction; historical dry-run report | Role checks pass; campaign gated by D1; no bulk email-match auto-linking |
| A08 | Integration and release readiness | A03–A07 | Auth/rules integration; payment regression; staging and rollback evidence | Required checks pass; production gates and activation status recorded accurately |

Within each checkpoint, work in smaller saved substeps. For example A02: prototype SDK behavior and save evidence; implement invitation validation and save tests; implement transaction and recovery and save tests. A new chat resumes the first unfinished substep.

### A00: inspect before continuing

Recheck branch, current source, tests and applicable `AGENTS.md` instructions. The baseline in this file is historical evidence, not permission to overwrite later work. Resolve D3 before real invitation dispatch; independent A01/A02 work can proceed without it.

### A01–A02: access before screens

Build the source-scoped resolver without changing money records. Keep claim logic separate from network/provider calls. Prototype native Firebase email-link/password behavior in isolation and record SDK/provider/domain requirements. Cover unverified pre-created accounts, existing passwords and staff identities explicitly.

### A03–A04: keep payment success independent

Integrate active posting paths and review any remaining compatibility writers. Do not trigger from generic status labels or imported opening balances without the approved historical policy. Accounts being disabled must not block ordinary payment posting. Include a bounded reconciliation scan for missed eligible events with deterministic deduplication.

### A05–A06: integrate every access path

Build small components and reuse payment functions. Account grants must work across history, proof, gateway, receipts and notices. Include approval-status refresh while a buyer remains on the page. An expired presale creation session leads to email recovery, not history or claim privileges. Preserve existing tests of guest isolation and source identity.

### A07: historical and office operations

Preserve existing UIDs and trusted links. First produce a read-only report of missing emails, duplicates, conflicting owners, staff identities and already activated accounts. Legacy paid records without canonical bookings require a reviewed eligibility adapter. Never create a receipt or re-credit a payment just to trigger an invitation. Support operations are audited server calls, not direct browser ownership writes.

### A08: stage and recover

Use synthetic domain/browser fixtures, real Firebase emulator/rules checks and isolated staging evidence. Live sender/Auth configuration, deployment and campaigns are separate release work. Activate by flag and an approved small cohort. On failure, stop new invites/claims while preserving payment intake, active users and audit records. Do not restore an old database over newer payments or delete accounts as rollback. Document the guest-access fallback.

## 10. Verification matrix

Test real authorization and recovery outcomes, not implementation-shaped assertions. Documentation-only edits do not require application test runs.

| Area | Required cases |
| --- | --- |
| Eligibility | Pending/rejected/held funds, partial vs complete deposit policy, duplicate approval/webhook |
| Identity | Verified/unverified/wrong email, pre-created account, existing account, wrong current browser account |
| Links | Expiration, malformed link, resend, replay, simultaneous claims, cross-device completion |
| Grants | Another buyer, arbitrary selector, conflicting UID, disabled/revoked user, revoked grant |
| Contacts | Changes before send/claim/read, change-away-and-back, correction without broken financial identity |
| Recovery | Auth success/claim failure, password success/response lost, claim success/response lost, provider timeout/retry |
| Data integrity | Same booking/source/receipt IDs, balances, ledger totals, pending proofs and provider attempts before/after setup |
| Route coverage | History, proof context/read/submit/correction, gateway, receipts, notices and legacy paths |
| Roles/rules | No role escalation or client ownership/financial edits; actual composed rules and overlapping grants |
| UX | Keyboard, autofill/paste, errors, mobile widths, repeated clicks and clear status messages |
| Operations | Resend limits, generic public responses, historical dry run, delivery observability and rollback |

Use existing `npm run test:payments` for broad regression after meaningful account/payment integration. Add an account test command when tests exist and record its exact invocation. Run relevant browser tests with the available runtime. Save pass/fail and limitations; local transaction doubles do not certify deployed Firebase behavior.

## 11. Durable continuation protocol

Save progress during work, not only when tokens are nearly exhausted. Source files and repository handoffs must contain enough information to continue without the previous chat.

1. Read this blueprint, applicable instructions and existing checkpoint/handoff/decision records. Inspect Git status before editing.
2. Choose the first incomplete checkpoint whose dependencies are satisfied. Verify earlier completion evidence against actual files; do not restart completed features without a reason.
3. Mark the checkpoint `in_progress` and record its current substep before substantial edits.
4. Complete a bounded change, run relevant checks and save exact results plus the next action. Distinguish implemented, locally verified, staging-tested and live.
5. If interrupted, leave changed files, known failures, unrun checks, pending decisions and the next concrete command/action. Never mark unfinished work complete to tidy the handoff.
6. Continue through authorized checkpoints; a checkpoint boundary does not itself require fresh permission. Missing business decisions block only dependent work.
7. A token/context limit is not approval for deployment or unanswered choices. Preserve work for the next chat.

At A00, create these proposed durable files:

- `docs/accounts/checkpoints.md`: status and implementation/test evidence per checkpoint.
- `docs/accounts/handoff.md`: current substep, changed files and next action.
- `docs/accounts/decisions.md`: confirmed answers, date/source and affected modules.

Until these files exist, section 12 is the starting record. Link them here once created; never assume proposed files already exist.

Handoff template:

```text
Updated (Asia/Manila):
Branch / HEAD:
Checkpoint and current substep:
Completed since previous handoff:
Files changed by this feature:
Pre-existing/unrelated changes:
Tests run: exact command, result and relevant summary:
Tests not run and why:
Open decisions / external blockers:
Flags or environment changes actually made:
Next concrete action:
Known risks and recovery constraints:
Commit reference, if one was made:
```

If committing during authorized implementation, stage only relevant changes and inspect the diff. Never use blanket reset/clean/stage operations to handle unrelated work. Saved files and a handoff can be resumed without a new commit. Do not fabricate test or commit evidence.

## 12. Progress tracker and initial handoff

Allowed statuses: `not_started`, `in_progress`, `implemented_unverified`, `verified_local`, `blocked_external`, `complete`. Complete means the checkpoint's stated acceptance criteria are met, not that the system is live.

| Checkpoint | Status | Evidence / next action |
| --- | --- | --- |
| Blueprint | complete | Modular account plan documented; no application implementation |
| A00 | not_started | On implementation request, inspect baseline and create continuation records |
| A01 | not_started | Depends on A00 |
| A02 | not_started | Depends on A01 |
| A03 | not_started | Depends on A02; production D3 policy unresolved |
| A04 | not_started | Depends on A02–A03 |
| A05 | not_started | Depends on A02, A04 |
| A06a | not_started | Depends on A01, A05 |
| A06b | not_started | Depends on A06a |
| A06c | not_started | Depends on A06b |
| A07 | not_started | Depends on A04, A06c; D1 campaign unresolved |
| A08 | not_started | Depends on integration and actual release evidence |

Current next action: when implementation is requested, start A00. No account code or account tests have been created by this documentation task.

Pre-existing modified files observed November 25, 2026:

- `lib/payments/submission.js`
- `payment-submit.js`

Pre-existing untracked files:

- `docs/payments/remaining-balance-payments.md`
- `tests/payments/remaining-balance-browser.cjs`
- `tests/payments/remaining-balance-fixture.js`
- `tests/payments/remaining-balance.test.js`

These are existing remaining-balance changes, not account implementation. Preserve them and recheck current status on continuation.

Key findings to retain: customer login and presale sessions currently have different access paths; account activation must preserve financial bindings; every payment access route needs the shared resolver; first setup email needs a dedicated verification path rather than the verified-contact financial outbox unchanged. Production configuration and deployed rules remain unverified.

## 13. Copyable resume prompt

> Continue the buyer account feature in `blueprint.md` using the relevant `.agents` skills. Read its confirmed decisions, open decisions, tracker and initial handoff, then read `docs/accounts/checkpoints.md`, `handoff.md` and `decisions.md` if they exist. Inspect the current branch, working tree and applicable repository instructions. Implement the next unfinished checkpoint whose dependencies are satisfied, starting at A00 if none have begun. Preserve unrelated changes and existing payment/ownership records. Save progress and exact test results after each small deliverable so another chat can resume. Do not repeat completed work without evidence that it needs repair. Keep unresolved business decisions explicit and continue independent work. Do not deploy, send live emails or change production data unless authorized in the current session.
