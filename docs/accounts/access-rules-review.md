# Buyer account access — rules and security review

Reviewed: November 26, 2026 (Asia/Manila).

Scope: implementation requirements for the [buyer account blueprint](../../blueprint.md), informed by the local [Firebase Authentication rules guidance](../../.agents/skills/firebase-auth-basics/references/security_rules.md). This artifact does not deploy rules, provision users or contacts, send invitations, or certify a live project. Application implementation and test evidence belong in the account checkpoint records.

Implementation review update: the confirmed [decisions](decisions.md) are D1, only payments posted after the explicit launch time trigger invitations; D2, an account is required for new future payments after the qualifying payment, while guest history, setup recovery and correction of existing evidence remain available; and D3, any positive verified principal credit qualifies, including a partial deposit. There is no historical invitation campaign. A pre-launch buyer's next qualifying post-launch payment establishes eligibility. This review covers account modules and payment access adapters; it does not review activation UI.

The inspected checkout has payment-rule review fragments but no complete deployable Firestore rules/index inventory. Obtain the actual composed project rules before activation. This file is not a replacement root ruleset. Retain the financial boundaries in [the payment access review](../payments/access-rules-review.md).

## 1. Authority and data boundaries

Firebase UID identifies the authenticated person. A verified mailbox is necessary for new claims; it does not by itself authorize every record with that email. Claim one specific source after validating its invitation and current ownership. Checkout uses the buyer's email, not a wallet sender, agent, or payment provider billing address.

The following collections, including every nested document, must deny direct browser get/list/create/update/delete for anonymous users, buyers, other buyers, staff, and administrators. Admin operations use authenticated server endpoints with fresh role checks.

| Collection | Protected authority or data |
| --- | --- |
| `portalProfiles` | Setup completion, identity/profile binding, accepted document versions and timestamps; no staff role authority |
| `portalAccess` | Active UID, typed source and booking binding, contact version, grant status and revocation |
| `accountInvitations` | Intended recipient, source, qualifying receipt, generation, policy/contact versions, expiry and claim state |
| `accountInvitationSources` | The current invitation pointer for each source; protects supersession and claim-generation authority |
| `accountPaymentEvents` | Durable receipt-triggered onboarding intent, source/booking binding and worker preparation state |
| `accountDeliveryEvents` | Dispatch intent, recipient authority, leases, attempts, provider outcome and message identifier |
| `accountAccessLimits` | Rate-limit counters and hashed requester identities |

This inventory includes the implemented collections. The blueprint's proposed `accountOperationKeys` collection is not implemented: claim replay uses the invitation's claimed UID/status and the current grant; invitation/delivery documents and the source pointer provide the other retry state. If a later checkpoint introduces operation-key or attempt collections, add their server-only boundaries before activation. Do not grant an owner-read exception to an entire invitation or grant collection just to display setup status. Return a minimal authorized projection through the server. Future direct preference edits require a separately reviewed field allowlist that cannot change setup, identity, ownership or consent provenance.

Keep existing payment collections server-only: reservation access/sessions, proof submissions and revisions, receiving accounts, canonical bookings, receipts, ledger/economic entries, payment/provider operations, reconciliation, private outbox/attempt records, and authoritative audit writes. Account login does not relax their boundaries.

Protect authoritative fields on existing source documents and indexes as well: `customers.authUid`, `customers.accountContactVersion`, `presaleApplications.accountContactVersion`, canonical source links, source email/phone fields, `presaleApplications.mobileKey`, `accessVersion`, migration locks, booking/plot ownership bindings, `bookings.notificationContact`, and `users.role`/disabled state. No customer-controlled field or token claim may create a staff role. A buyer profile must not become a `users` role document.

`paymentSubmissionScopes.accountRequiredAfterReceipt` is a server-owned payment-intake gate. Only successful qualifying financial posting or an explicitly reviewed recovery operation may establish it. Browsers must not set, clear or swap its receipt ID, including admin browsers. Validate that the referenced receipt belongs to the same submission scope and canonical booking, carries the same financial binding, has positive principal credit and was recorded on or after launch. It gates new guest payments, not existing receipt/history reads or authorized correction of an already submitted case. Preserve the field through later scope updates; do not infer that an unlinked or revoked account means the gate may be cleared.

Firestore matching allows are additive: a collection-specific denial does not defeat another matching broad allow. Audit recursive wildcard rules, collection-group access, legacy customer self-registration/linking grants, role-based global grants and nested revisions. Remove conflicting grants in the composed baseline instead of appending these boundaries beneath them. The old browser email-match registration proposal was superseded and must not be restored.

## 2. Server checks that rules cannot replace

The Admin SDK bypasses client rules. Every server entry point must enforce its own identity, scope, role and transaction requirements.

1. Verify Firebase tokens, including disabled/revoked-user handling. New account claims must use verified-email evidence from trusted Firebase identity, not a client Boolean or contact form value. After email verification/password setup, refresh identity before claiming. Recheck current account/contact state for sensitive claims so stale tokens cannot authorize an old email after an identity correction.
2. Normalize addresses consistently using the application's policy. Do not invent provider-specific dot/plus alias equivalence. Never make a token-email query an alternative ownership check.
3. Treat `sourceKind`, `sourceId`, `bookingId`, `customerId`, receipt IDs, cursors and invitation IDs as lookup hints. Reject malformed/unknown fields and explicitly distinguish customer from presale selectors. Do not interpret a presale reference as a customer ID.
4. Resolve the current grant, source and source-to-booking binding inside the transaction protecting the operation. Check active UID, grant state, applicable contact authority and canonical integrity before returning data or committing a mutation. Recheck after asynchronous work such as image decoding.
5. Preserve trusted existing `customers.authUid` access through the explicit compatibility adapter. A present revoked, disabled, conflicting or stale grant must not silently fall back to that legacy field. Define and test precedence so revocation remains effective. Missing new grant data alone must not silently migrate an existing buyer.
6. Public setup/resend responses must not reveal whether an email, source or Firebase account exists. Rate-limit by bounded requester/source dimensions and overall capacity. Use stored recipient authority, not arbitrary recipient or redirect values supplied by the caller.
7. Apply exact permitted-origin checks, JSON/body limits, action allowlists, no-store responses and no-referrer handling to account routes. Never derive email destinations or allowed return URLs from arbitrary Host/forwarded headers. Restrict action handlers to approved return paths.
8. Keep passwords, refresh tokens, ID tokens and usable action/capability URLs out of logs, error messages, audit payloads, ordinary outbox content and saved test artifacts. Generate Firebase action links at delivery time. Custom bearer capabilities, if used, require cryptographic randomness, hashed storage, explicit scope, expiry and one-time consumption.

## 3. Claim transaction and recovery contract

Before a new claim commits, atomically read and validate the invitation generation/status/expiry, intended email, source contact authority, qualifying receipt and current eligibility, source/booking identity, existing grant, and operation replay state. Complete all reads before staging writes. A browser success page, submitted proof, printed cash receipt, imported opening balance or held reconciliation funds is not a qualifying posted payment.

The confirmed production policy is `positive_credit`, using the server receipt's `recordedAt` against the explicit launch timestamp. An unset or unsupported policy must fail closed for invitation issuance/dispatch. Pending proof and money held without principal posting do not qualify. Fully funding the deposit is not a prerequisite under D3.

One source has at most one active buyer UID; one UID may have multiple individually authorized sources. A competing UID cannot overwrite the grant. Same-UID retries of a completed claim reconstruct the safe success result from the claimed invitation after checking that current access has not been revoked or transferred; they do not create another grant, receipt or audit side effect. Distinguish this recovery path from replaying an expired/unclaimed or superseded invitation. Trusted legacy customer `authUid` links are preserved as already active and do not receive new invitations merely because the account feature launches.

Auth creation, password setup and Firestore linkage cannot form one database transaction. Never call Auth or Brevo from a retriable Firestore transaction. Preserve resumable state when Auth/password setup succeeds but claiming fails. Do not delete a Firebase user, reset an existing user's password or recreate financial records as compensation. Existing verified/unverified accounts and existing staff identities need explicit tested paths; no account enumeration response or unchecked UID merge is acceptable.

A normal public or office resend preserves an unexpired invitation with the same contact stamp. After the cooldown it queues another bounded delivery attempt, retaining the validity of a link already received. Only an expired/stale invitation or an explicitly authorized replacement creates a new application invitation and revokes the earlier one. An older Firebase action link might still authenticate a mailbox until Firebase expires it; that must not let a revoked application invitation claim a source. Separate Firebase authentication success from active source authorization. Public setup requests queue work without waiting on provider delivery, preserving generic response behavior.

## 4. Financial identity and contact changes

The current canonical binding uses `uid:<customers.authUid>` for customers and `reservation:<accessVersion>` for presales. Pending proofs, gateway attempts, receipts and financial outbox records retain this identity. Add portal access without converting the source, copying balances, rewriting historic receipts, or changing `ownerBinding` merely to add login.

Contact correction is a separate audited operation. The implemented `admin_contact`/`confirmContact` path supports only a source with a qualifying receipt, no `portalAccess` document (including revoked documents), and no existing `authUid`. It checks the fresh admin role and expected `accountContactVersion` in the write transaction, requires an explicit buyer-verification confirmation and reason, increments the version, revokes the current invitation, disables the notification destination and records the change. It does not transfer an existing login or grant. A comparison of the current email alone cannot detect an address changed away and back. Records lacking trusted contact provenance/version need office review, not an inferred default during claiming.

Changing presale `accessVersion` also changes its financial binding. The new unlinked-source correction path instead advances `accountContactVersion`, which is included in account contact stamps and, when present, the existing guest-session fingerprint. Presale creation recovery now checks that same fingerprint. This invalidates old guest links/sessions/recovery capabilities even after changing the email away and back while preserving `ownerBinding`, bookings and pending financial records. Existing linked/revoked identities and corrections through legacy `accessVersion` writers still need the separate reviewed reconciliation path. Protect the new version against deletion/reset, and review all old source/contact writers and cached clients.

Use the stored buyer email to bootstrap a minimal setup message. New presale bookings currently have disabled notification contact; the financial outbox requires verified enabled contact. The initial setup sender therefore needs its own restricted delivery authority. After successful claim, provision the verified notification destination with the existing booking binding and correct version. Verification is not marketing consent. A changed recipient must suppress stale queued delivery. Resend authorization, a source cooldown and audit must survive concurrent requests and role removal. Public requests must not repeatedly invalidate a still-valid invitation merely because the requester knows a reference and email.

Preserve existing access and history across full settlement, cancellation and refunds according to the blueprint. Financial status is not automatically account revocation. D1 excludes a historical campaign: old credit alone must not trigger invitations or retroactively force activation. Never bulk-claim all same-email records or create synthetic payments to trigger invitation eligibility.

## 5. Access-route integration inventory

Every applicable route must share the same source-grant decision. A successful account list is insufficient if another path either refuses valid presales or permits revoked access.

| Surface | Existing integration points to verify |
| --- | --- |
| Source list and history | `lib/payments/access.js`; replace customer-only account selection with explicit source handling |
| Proof context/list/read/submit/correction | `lib/payments/submission.js`, `submission-http.js`; preserve post-decoding transaction checks |
| Gateway context/create and attempt access | `lib/payments/gateway.js`, `gateway-http.js`; retain provider evidence and canonical bindings |
| Receipts and notifications | `lib/payments/operations-access.js`, operations/report handlers, `api/my-receipts.js` compatibility path |
| Booking readers | `lib/payments/auth.js` and all `requireBookingReader` callers |
| Portal and saved/cached clients | `payment-view.js`, `site.jsx`, client request builders, service-worker behavior and strict schemas |
| Office linking and support | `admin-app.js` provisioning/linking paths and new account support endpoints |

Presale creation sessions remain limited to proof operations. They must not become setup-claim authority, Firebase identity, history access or gateway access. Under D2, after a qualifying receipt, verified guest sessions retain history/setup recovery and correction of existing evidence but cannot create a new transfer submission or new gateway checkout. Test corrections and idempotent recovery separately from new payment creation. Staff recording of money already received must not lose financial evidence because the buyer has not activated.

## 6. Required emulator and integration evidence

Use the actual composed rules with Firebase SDK clients for rule tests. Unit transaction doubles exercise domain behavior but cannot certify rules, real transaction retry ordering, Auth action-link semantics or production configuration.

| Test group | Required result |
| --- | --- |
| Direct private access | Anonymous, owner, other owner, staff and admin clients cannot get/list/create/update/delete any private account/payment collection, including nested documents |
| Broad matching grants | A deliberately permissive overlapping match is detected by the negative suite; the intended composed baseline denies access |
| Authority tampering | Browser writes cannot change UID grants, source contact/version, roles, setup verification, balances, receipts, invite generation, delivery attempts or throttles |
| Claim identity | Unverified email, wrong email, wrong current browser account, disabled/revoked token and conflicting UID cannot claim |
| Account collisions | Existing verified account retains UID/password; unverified pre-created account, staff identity and duplicate legacy records follow the reviewed recovery/review path |
| Claim concurrency | Two requests/UIDs compete for one invitation/source; exactly one valid ownership result survives and retries remain scoped |
| Link lifecycle | Malformed, expired, consumed, revoked, superseded and cross-device links have correct outcomes; email-link authentication alone cannot revive an obsolete application invitation |
| Contact races | Changes before delivery, claim, history read, proof decode/commit and gateway creation invalidate stale authority; changing away and back cannot revive it |
| Compatibility precedence | Legacy owner access remains valid where intended; a revoked/conflicting new grant cannot fall back to `customers.authUid` |
| Route isolation | Valid buyer can use each supported history/proof/gateway/receipt/notice action; another buyer and a creation cookie cannot substitute source, receipt, revision, cursor or selector |
| Payment eligibility | Pending/rejected proof, printed unapproved cash, unverified provider return, held funds and historical opening balances never generate an unauthorized invitation; positive partial credit at/after launch qualifies, earlier credit and unset policy do not |
| Future-payment requirement | Guest new proof and gateway creation fail after `accountRequiredAfterReceipt` is set; prior evidence correction/history and safe idempotent recovery work; a valid active account can continue the same source |
| Payment invariants | Account setup preserves source/booking/receipt IDs, balances, ledger totals, existing pending proofs and gateway attempts |
| Interrupted operations | Auth success plus claim failure, password success plus lost response, and claim success plus lost response recover without duplicate accounts/grants/payments |
| Delivery recovery | Duplicate posting/webhook events queue once; provider timeout preserves uncertainty; source resend/cooldown and global capacity are bounded; fresh queued work cannot starve due retries or expired lease recovery; stale contact/generation is suppressed; mail failure never rolls back credit or exhausts the payment response time budget |
| Role races | Support action/replay rechecks live role; losing staff/admin authority blocks the operation; customer setup never grants a role |
| Office contact correction | Only an eligible unlinked source with no `authUid` can be confirmed; stale expected version, role loss and a concurrent claim fail; old invitations, guest access and creation recovery remain invalid after changing the address back; financial bindings stay unchanged |
| HTTP/browser boundary | Origin, redirect, schema/body limit, generic public responses, rate limit, caching, sensitive URL cleanup and sign-out/access-change handling work over HTTPS |

Confirm queries/indexes from implemented source rather than deploying a replacement index inventory. Account lists should be UID-scoped and bounded; invitation/delivery scans need their actual status/time/order indexes. Do not index secrets, large unqueried payloads or raw identifiers unnecessarily. Define retention for expired invitations, delivery attempts and rate records; cleanup must not erase active grant authority, unresolved delivery evidence or required audit provenance.

## 7. Activation gates and rollback

Before enabling account invitation/claim/dispatch switches:

1. Reconcile this collection/field/route inventory with final source and actual deployed rules. Review legacy broad grants, direct staff linking and contact writers; test the composed baseline and documented compatibility paths.
2. Configure and record `positive_credit` and an explicit launch timestamp for D1/D3. Do not run a historical campaign. Enable the D2 gate only with a functioning onboarding/recovery path for the supported cohort; preserve the documented guest-history/correction behavior.
3. Validate Firebase email-link onboarding and password setup against the actual SDK/provider/domain configuration, including new and pre-existing verified/unverified accounts. Record emulator and isolated staging results; do not treat mocked Auth as proof of those behaviors.
4. Verify approved origins/action handlers, sender identity and applicable quotas. Confirm secrets stay server-side, links are absent from ordinary logs, and public resend cannot become an arbitrary email sender.
5. Validate durable prompt delivery/retry on the actual hosting plan. The existing daily reminder cron alone does not satisfy prompt invitations. No detached serverless promise is a delivery guarantee.
6. Provision required indexes, contact authority and supported recipient state through reviewed processes. Preserve financial migration/receiving-account gates; account activation must not enable payment methods or schedules.
7. Run account tests, payment regressions, composed-rule/Auth integration and isolated end-to-end checks; record results and unresolved limitations in account checkpoints before a small approved live cohort.

Rollback stops new invitation generation, dispatch and claims while preserving existing Auth users, grants, newly accepted funds and audit records. Define how already activated buyers retain history and how an unactivated buyer whose `accountRequiredAfterReceipt` is already set gets assisted payment/setup recovery. Disabling the feature flags alone does not remove a persisted gate; do not silently erase it or promise unrestricted guest intake as a fallback. Do not restore an old database over newer receipts or delete Auth users as rollback. Preserve uncertain mail outcomes and pending provider events for reconciliation.

No live rules, Auth users, credentials, feature switches, email sender or production records were inspected or changed for this review. The requirements above are release gates, not assertions that they have passed.

## 8. Local implementation re-review evidence

The final backend re-review covered `lib/accounts` authorization, invitations, claims, contact confirmation, delivery and HTTP services, plus shared payment authorization and legacy receipt access. The five earlier findings were addressed: legacy readers use grant precedence, role checks are repeated inside support writes, ordinary resends preserve valid invitations, retries/expired leases are selected fairly, and post-payment work prepares one durable event without Auth/provider calls. Public traffic and setup requests also have global capacity limits.

`node --test tests/accounts/*.test.js` passed 17 tests on November 26, 2026. The suite includes actual manual/cash/gateway posting hooks against the transaction double, source/grant isolation, concurrent claims and recovery, stale contacts, mandatory-account corrections, role-race checks, retry fairness and legacy-reader revocation. `npm run test:accounts` could not start through the local npm shim because its referenced `npm-cli.js` was missing; the exact underlying script was run directly with Node. This is domain/integration-double evidence, not real Firebase Auth, composed-rule emulator or staging certification. No UI review was performed in this pass.

Reference baseline: [Firebase rule matching](https://firebase.google.com/docs/firestore/security/rules-structure), [rules unit tests](https://firebase.google.com/docs/rules/unit-tests), [email-link authentication](https://firebase.google.com/docs/auth/web/email-link-auth), and [Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links), as linked in the planning blueprint. Verify version-dependent provider behavior during implementation/staging.
