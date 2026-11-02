# CP7 — deposit, dates and retained-hold review

Completed locally November 2, 2026 (Asia/Manila), starting from CP6 `4bdd8fa`. Checkpoint subject: **`Payment CP7: track deposits and reservation review`**. No live activation, deployment, migration, payment, email or backup archive was performed.

The user confirmed two decisions for CP7:

- When several verified payments reach the required deposit, use the **actual received date of the deposit-completion payment** as the installment anchor.
- **Flag overdue reservations for review and keep all plots held.** CP7 has no release, cancellation or extension action.

## Implemented flow

1. An explicitly enabled canonical contract supplies the original verified reservation timestamp and accepted plan/term.
2. The required credited deposit is `number of plots × 500000` centavos. Count verified principal across the booking, preserving the existing explicit item allocations. Claimed proof amounts, pending cash, provider/buyer fees and unapplied excess do not fulfill it.
3. Sort verified receipts by actual `receivedAt` (with receipt ID as a stable tie-breaker). The payment crossing the aggregate deposit threshold establishes `depositCompletedAt`. Late verification does not move that date. New earlier verified evidence can correct the derived anchor; receipt evidence remains immutable.
4. The original deadline is three calendar months after reservation submission, using Manila dates. The whole deadline date is included; the following Manila day is past due. This cutoff convention must be disclosed in contract wording before activation.
5. Installment plans show a timing calendar for the selected 12/24/36/60 months, starting one month after deposit completion. Each month is calculated from the original anchor, so Oct 31 → Nov 30 → Dec 31 does not drift. **Amounts are null and explicitly await accountant confirmation.** No binding amount schedule, installment allocation/overdue charge, penalty, waiver or settlement quote is generated.
6. Spot cash requires full principal by the original deadline. A deposit creates no extension and no monthly calendar. Principal settlement is distinguished from final clearance of other agreed obligations.
7. An unmet deadline appears in the admin review list and customer view. Admins can inspect current deposit history, pending case count, active provider checkout and plot bindings, then save an audited **retain hold** note. The original deadline, money and inventory remain unchanged; an unresolved deadline remains flagged after review.

All CP4 manual, CP5 cash and CP6 gateway receipts use the shared posting path. For enabled bookings it computes the lifecycle before writes, then saves the receipt, ledger, balances and lifecycle projection atomically. Replays do not create credit or move dates. Source/owner/terms, role, evidence and financial checks from earlier checkpoints still apply. Linking an already-posted provider receipt does not create another lifecycle credit.

## Code and access

| File | Responsibility |
|---|---|
| `lib/payments/lifecycle-model.js` | Verified-principal derivation, dates, timing calendar and bounded reconciliation fallback |
| `lib/payments/lifecycle.js` | Current-admin queue/detail and idempotent retained-hold decision |
| `lib/payments/lifecycle-http.js`, `api/payment-lifecycle.js` | Separately gated, same-origin, rate-limited, allowlisted admin API |
| `lib/payments/posting.js` | Atomic lifecycle projection alongside shared financial posting |
| `lib/payments/canonical.js`, `access.js` | Fresh lifecycle on owner-bound account/reservation history reads |
| `payment-lifecycle.js` | Shared customer/admin deposit and timing presentation |
| `payment-lifecycle-admin.html`, `payment-lifecycle-admin.js` | Admin review, confirmation and identical retry after uncertain responses |

Admin page: `/payment-lifecycle-admin.html`, linked from the admin dashboard. Customers continue using `/my-payments`; existing account UID or reservation email-link authorization applies. Customers do not receive internal review notes. Auth changes, sign-out, restored browser history and idle expiry clear private admin views.

## Server-owned schema and gates

The admin HTTP route defaults off. It requires `PAYMENT_LIFECYCLE_ENABLED=true` and complete CP2 access configuration. This flag enables review availability; it is **not** a global switch for the shared posting/read model. Those use an additional, server-provisioned `bookings.lifecycleEnabled === true`. No booking or environment was enabled during this checkpoint.

An eligible schema-4 booking retains all existing canonical requirements and adds:

```js
// Schema illustration only, not a provisioning command or a production value.
lifecycleEnabled: true,
lifecycleTerms: {
  version: 1,
  bookingTermsVersion: /* exact current booking.termsVersion */,
  reservationVerified: true,
  reservedAt: /* original trusted reservation submission time, epoch milliseconds */,
  plan: 'installment', // or 'spot_cash'
  termMonths: 12       // installment only: 12, 24, 36 or 60
}
```

These are reviewed migration/provisioning decisions, never fields accepted from a customer or the review form. Changing policy/ownership/provenance must increment the canonical booking version and, for terms changes, termsVersion. `reservationVerified` and `legacyWritesBlocked` are assertions, not substitutes for real source validation or writer restrictions.

- `bookings.lifecycle` is a schema-7 projection with `basisVersion`, original deadline, verified deposit totals/completion receipt/date, plan, first installment date, date-only calendar, principal-settled time and policy gates. Persisted review/as-of fields are snapshots; queue/read presentation recomputes deadline passage from the server's current Manila date. No midnight job is needed to release anything.
- The admin list paginates enabled bookings by **Firestore document ID**, 20 at a time, including records without a redundant `bookingId` field. Stale/missing projections prompt detail review. Detail/customer reads recompute from ledger evidence.
- `reservationReviews/{bookingId}` holds the latest internal retained-hold note. Immutable `auditLogs` preserve each decision; actor/request-scoped `operationKeys` return the original result on an identical retry. Current admin authority is checked before replay. Reviews increment the booking version, so an older financial command must reload/reconcile.
- No `plots`, source reservation status, deadline, receipt, penalty or principal amount is changed by a retained-hold decision. There is no auto-release cron or lazy-expiry mutation.

## Provenance and bounded work

This implementation supports zero-opening-credit contracts with complete positive receipt histories in the canonical ledger. It checks one matching zero opening entry, unique receipt identities, valid actual dates, current terms, allocation shapes and exact item/booking principal totals. History is capped at **500 entries including the opening entry**. The query reads at most 501; it never computes a schedule from a truncated history.

Positive historical opening credit, reversals/adjustments, changed terms, malformed history or exceeded limits produce `needs_reconciliation`. Valid new money can still be recorded under the existing financial checks while lifecycle dates await review. Database failures remain retryable failures; they are not converted into successful posting. The checkpoint does not guess old payment dates or implement a historical-data repair endpoint.

Existing accepted monthly amounts and next-due fields are retained. A recorded next-due date remains visible separately when present. Q01 post-deposit amount policy and Q02 penalty calculation remain OPEN; no accepted obligation is silently waived or replaced. Buyer cash-intention codes remain a proposed follow-up, separate from CP5 recording/approval and this verified-deposit lifecycle. Reservation creation, authoritative product quotes, historical migration, refunds/reversals, extensions and explicit inventory release still need their corresponding reviewed work.

## Verification and activation

**145 unit/HTTP tests passed; all five local Edge browser suites passed.** Tests cover chronological multi-payment completion, Manila cutoff, month-end clamping, spot cash, partial/late receipts, duplicate delivery, fee/excess exclusion, cash approval gates, historical/malformed provenance, bounded history, role removal, ownership, idempotency, atomic failure, document-ID pagination, HTTP opt-in/origin/allowlists, privacy and 320/390/768px layouts. Desktop/mobile screenshots were inspected. Syntax/JSON and whitespace checks passed.

The Firebase skill's delegated review found malformed-history exceptions that could abort real-money posting and a redundant-field pagination issue; both were fixed with regressions. UI/UX guidance informed explicit confirmation/saved/uncertain states, and responsive-design guidance informed the reused mobile layout. No dependencies were upgraded.

Before activation: validate actual Firebase SDK transaction/query behavior and indexes in an emulator/staging environment; deny direct browser writes/access to server-owned state; retire legacy writers for migrated contracts; provision trusted source/owner/quote/contact/lifecycle data; reconcile historical credit and existing schedules; disclose the cutoff; and confirm policy-dependent amounts/penalties before exposing binding calculations. See [rules review](access-rules-review.md). No deployed rules or production data were inspected. CP8 notifications/reminders/reports are next, only when requested.
