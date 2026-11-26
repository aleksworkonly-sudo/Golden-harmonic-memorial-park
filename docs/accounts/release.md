# Buyer account release and operations

Updated November 26, 2026. Local implementation is saved; this is a release runbook, not evidence of deployment. Read [decisions](decisions.md), [checkpoints](checkpoints.md), and [access rules review](access-rules-review.md) before enabling anything.

## Implemented flow

1. The existing canonical manual approval, approved cash evidence, or validated gateway posting creates a receipt. If account flags/policy are valid and `recordedAt >= ACCOUNT_LAUNCH_AT` with positive principal credit, the **same transaction** creates `accountPaymentEvents/{receiptId}` and sets `paymentSubmissionScopes/{sourceKey}.accountRequiredAfterReceipt`.
2. A post-commit callback prepares at most one invitation using database work only. If preparation fails, the durable payment event remains for the worker. Payments never wait for Firebase action-link generation or email transport. Repeated posting/webhook requests retain the existing receipt/event.
3. The authenticated worker prepares queued events and dispatches due invitations. It generates a Firebase email sign-in link in memory, sends minimal setup instructions through Brevo, and stores only delivery metadata. Public recovery requests enqueue mail without calling providers, so provider timing cannot expose email matches.
4. Buyer enters the receiving email, verifies it with Firebase, chooses a password (or signs in with an existing password), accepts the displayed terms/privacy notice, and claims the one source. Claim writes an active grant/profile/audit and verified notification destination. It never converts a presale, copies a balance, changes `ownerBinding`, or rewrites receipts.
5. `/my-payments?mode=account` (also `/my-account`) lists individually authorized contracts. The same source resolver protects history, new/corrected proofs, gateway actions, receipts and notifications. Existing `customers.authUid` logins remain supported; a present revoked/conflicting new grant overrides that fallback.
6. After qualifying credit, new guest proof submissions and gateway checkouts require an account. Guest history, existing proof correction and safe retry of prior requests/attempts still work. Office staff must still record funds already received. Pre-launch paid buyers are not retroactively gated until a new qualifying post-launch payment.

Only the canonical reconciled payment pipeline qualifies. Legacy unconverted receipts/opening balances are not migrated or re-credited. Existing trusted customer logins are retained instead of receiving duplicate invitations.

## Configuration required before launch

| Server setting | Requirement |
| --- | --- |
| `ACCOUNT_ACCESS_ENABLED` | `true` enables account setup/support endpoints; absent/false defaults off |
| `ACCOUNT_INVITES_ENABLED` | `true` enables qualifying events and invitations when launch/policy are valid |
| `ACCOUNT_EMAIL_DISPATCH_ENABLED` | `true` enables mail dispatch; keep false while staging without live mail |
| `ACCOUNT_INVITE_POLICY` | Exactly `positive_credit`; unsupported/unset sends nothing |
| `ACCOUNT_LAUNCH_AT` | Explicit reviewed ISO timestamp with timezone; choose actual launch, not a historical placeholder |
| `ACCOUNT_WORKER_SECRET` | Random server-only secret, at least 32 characters; independent from public credentials |
| `PAYMENT_ACCESS_ORIGIN` | Exact trusted HTTPS origin, no trailing slash; used for the activation callback |
| `PAYMENT_ACCESS_RATE_SECRET` | Existing server-only rate secret, at least 32 characters |
| `BREVO_API_KEY`, `SENDER_EMAIL` | Existing verified transactional sender configuration and capacity |
| Firebase Admin credentials | Existing server credential setup used by payment services |

Keep all three account flags off until the following release evidence is recorded. Enabling invitations without a working sender/runner would require accounts for the next payment while leaving buyers waiting for setup.

Firebase Console: enable Email/Password and Email link (passwordless sign-in) for bootstrap, authorize the intended domain, and confirm the generated action URL returns to `/account-activate.html` with its Firebase parameters and invitation reference. Future login remains email/password. Verify callback handling with the repository's pinned compat SDK, actual password policy and any existing custom action handler. Setup displays an eight-character minimum; Firebase's configured policy may impose additional requirements. The current terms/privacy URLs exist, but their account-use content and the recorded `2026-11-26` consent version must be reviewed before launch.

Provider behavior must be exercised with fresh accounts, existing password accounts, pre-created unverified accounts, cross-device links, wrong/current sessions, disabled/revoked users and interrupted password/claim responses. Synthetic Auth tests do not certify this behavior. Use isolated staging accounts; do not test against real buyer identities.

## Scheduler and delivery

Configure an authenticated runner to call `POST /api/account-worker` (GET is also supported) with `Authorization: Bearer <ACCOUNT_WORKER_SECRET>` approximately every minute. The existing daily reminder cron is insufficient. No new production cron or third-party integration was configured in this task.

The worker prepares up to five payment events and attempts up to five due emails per call. New mail, retries and expired leases are bounded; old retries cannot be starved by fresh mail. A send allows up to three seconds for Firebase link generation and five seconds for the email HTTP request, plus database overhead. Verify a hosting execution budget of at least 60 seconds and overlapping-run behavior on the actual plan, or reduce batch size after measuring capacity. Leases are 60 seconds, retries back off, and each invitation has at most five send attempts. Application invitations expire in 24 hours; actual Firebase action-link expiration is independently enforced by Firebase.

Delivery states: `queued`, `sending`, `accepted`, `retry`, `failed`, `uncertain`, `suppressed`. Provider acceptance is not proof of inbox delivery. Timeout/expired sending leases become `uncertain`; they are not blindly retried. Buyer/office resend after a 60-second cooldown explicitly queues another attempt. A still-valid invitation is reused; an expired/obsolete invitation is replaced. Uncertainty can mean duplicate mail, never duplicate account claims or payments. After the attempt cap, office support must wait for an expired invitation to be renewed or investigate delivery; do not delete evidence or alter counters casually.

Monitor queued age, `needs_review` payment events, stale sending leases, `uncertain`/`failed` deliveries and sender quotas without logging action links, tokens or passwords. Restrict database monitoring to server/office operations. A worker outage does not lose credit or eligibility. Recover by restoring the runner, then review delivery status per source. No historical invitation sweep is part of this rollout.

## Firestore and source protection

The repo does not contain the actual composed deployed rules or index inventory. Obtain them and merge reviewed changes; do not deploy a replacement ruleset based only on this feature. Deny direct browser access (including staff/admin SDK clients) to all seven account collections: `portalProfiles`, `portalAccess`, `accountInvitations`, `accountInvitationSources`, `accountPaymentEvents`, `accountDeliveryEvents`, `accountAccessLimits`, including subcollections. Use server endpoints for support. Protect existing source identity/contact/version fields, roles, booking ownership, submission gates, receipts and financial records against direct client mutation. Broad overlapping allows can defeat a narrow deny.

Merge the following account composite indexes into the existing index inventory, retaining all current payment indexes:

```json
{
  "indexes": [
    {"collectionGroup":"accountDeliveryEvents","queryScope":"COLLECTION","fields":[{"fieldPath":"state","order":"ASCENDING"},{"fieldPath":"nextAttemptAt","order":"ASCENDING"}]},
    {"collectionGroup":"accountDeliveryEvents","queryScope":"COLLECTION","fields":[{"fieldPath":"state","order":"ASCENDING"},{"fieldPath":"leaseUntil","order":"ASCENDING"}]}
  ]
}
```

UID grants, legacy customer UID and queued-payment state queries use their normal single-field indexes. Validate these queries against actual Firestore; the local memory store cannot prove index or transaction semantics. Keep usable action URLs out of Firestore and ordinary logs. Define retention for expired invitations, limits and delivery metadata with audit requirements; do not delete active grant decisions or unresolved outcomes.

Run the negative SDK/rules matrix in [access-rules-review.md](access-rules-review.md) against the actual composed baseline. Local Java/emulator execution was unavailable during implementation. Neither the browser smoke test nor memory Firestore tests replace this gate.

## Office support

Open `/account-admin.html` from **Buyer account support** in the admin sidebar, using a current admin/superadmin session. Every mutation rechecks the live role inside its transaction.

- Check one customer/presale reference for link, invitation and email state; resend setup instructions.
- For an **unlinked** source with qualifying payment, verify the buyer's identity using office records, confirm/correct their own email, enter an audit reason and save. The server increments `accountContactVersion`, invalidates old invitations and guest sessions (even if an email later changes back), and disables stale financial email delivery. It preserves presale `accessVersion` and the financial owner binding. Then resend setup.
- Revoke an existing grant with an audit reason. Existing password login may still authenticate, but source reads/payment operations fail. Revocation is authoritative even where a legacy `authUid` also exists.
- Already linked/revoked account email transfers, incorrect legacy UID links, staff identities, uncategorized legacy records and noncanonical bookings require separate reviewed reconciliation. This screen intentionally cannot transfer ownership or repair those financial bindings. Do not delete a revoked grant to recover access; that could revive a legacy fallback.

Existing legacy browser provisioning is gated off in the admin UI when accounts are enabled, and canonical legacy guards already block source edits. Actual rules must enforce the same boundary against cached/modified clients.

## Verification and rollback

Run `npm run test:accounts`, then `node --test tests/accounts/*.test.js tests/payments/*.test.js`. Browser test: set `PAYMENT_PLAYWRIGHT_MODULE` to an installed Playwright module and run `node tests/accounts/browser.cjs` using Edge. It uses synthetic users/payment records and fake Auth/email; no live writes. See checkpoints for exact current results and two inherited regression failures that remain release issues.

Before release, demonstrate the full staging path for manual, cash and provider payment, delivery, cross-device activation, password login/reset, source selection, new payment, receipt/notice access, correction, contact drift and revocation. Confirm mobile keyboard and screen-reader behavior, headers, provider timing, indexes and worker capacity. Current local browser evidence includes widths 320, 390, 768 and 1365, wrong email, interrupted claim recovery, resend and disabled flags.

To pause rollout, disable invitations/dispatch and, if needed, account setup. Existing active grants remain readable through payment APIs. **Persisted `accountRequiredAfterReceipt` restrictions remain effective**: do not promise restored guest intake by switching flags off. Keep account login available and assist unactivated buyers through office intake or restore their setup path. Preserve current Auth users, money, receipts, grants and audit; never restore old data over newer payments or delete/recreate users as compensation.
