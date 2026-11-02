# CP8 — communications, reports and receipt reading

Implemented locally on **November 2, 2026 (Asia/Manila)**, starting from CP7 `64c0d83`. Production activation remains disabled. Checkpoint subject: **`Payment CP8: add communications reports and receipt reading`**. Resolve the saved hash with `git log -1 --format='%h %s' --grep='Payment CP8:'`.

## Confirmed scope

- Reservation reminders: **three days before, one day before, then one day after the original deadline**. Pending evidence and open gateway attempts suppress reminders; no reminder releases a plot or extends a deadline.
- Report **recorded allocation snapshots only**. New commission, tax, installment-amount and penalty calculations remain disabled pending business/accountant decisions.
- Preserve all earlier payment rules, private evidence, admin-only financial decisions, actual received dates, the 2.5% gateway buyer fee and the decorative demo QR.

## Implemented flow

1. Manual proof submission/correction, admin review, cash recording and shared verified posting save a notification or email event in the same transaction as the business change. Existing gateway posting supplies its receipt notification. An email failure cannot undo money already posted.
2. An admin opens `/payment-operations-admin.html`, inspects the delivery queue and prepares a stored message. Preparation resolves the current verified contact and a fixed text template; the request cannot choose an email recipient. Customer notices and private acknowledgements appear in `/my-payments` for the current account or reservation session.
3. A separately enabled worker prepares and sends bounded batches. The admin screen itself never sends email. It displays provider acceptance, failed/uncertain attempts and an audited recovery action.
4. A reminder scan evaluates current canonical reservation lifecycle and creates one stable event for each booking, terms version, original deadline and reminder stage. It checks fresh balances and pending cases again before preparation and delivery.
5. Admins generate a collection report for Manila received dates or a customer monitoring statement for a canonical booking. Reports are read-only, printable and derived from the canonical ledger. Collections also export CSV.
6. A buyer may choose **Read receipt image** after selecting proof. Processing runs on the device using a lazy-loaded worker. Suggestions never replace typed values until the buyer presses **Use … suggestion**. The admin can inspect saved suggestions for each immutable proof revision and independently verify the actual funds.

## Files and interfaces

| Area | Files |
|---|---|
| Current identity and contract checks | `lib/payments/operations-access.js` |
| Acknowledgements, statements, collections and notices | `lib/payments/reports.js` |
| Delivery preparation, leases, reminders and recovery | `lib/payments/outbox.js` |
| HTTP access and worker authentication | `lib/payments/operations-http.js`, `api/payment-operations.js`, `api/payment-messaging-worker.js` |
| Admin interface | `payment-operations-admin.html`, `payment-operations-admin.js`, `payment-operations.css` |
| Customer notices and print acknowledgements | `payment-communications.js`, `payment-view.js`, `my-payments.html` |
| Optional receipt reading | `payment-ocr.js`, `payment-submit.js`, `payment-review.js` |
| Existing scheduler integration | `api/send-reminders.js`, `api/_presale-reminders.js` |
| Synthetic verification | `tests/payments/operations-fixture.js`, `operations.test.js`, `operations-http.test.js`, `operations-browser.cjs` |

`POST /api/payment-operations` supports `notices` and `receipt` through current buyer access; `statement`, `collections`, `queue`, `prepare`, `reconcile` and `reminders` require a current admin/superadmin record. Same-origin JSON, 8 KiB body bounds, field allowlists, shared traffic limits and no-store responses apply. Provider errors/secrets are not returned. Private receipt access checks current source/booking mapping and retained owner binding.

The worker supports authenticated GET/POST and requires a separate constant-time-checked bearer secret. It has no customer or admin-browser send action. The existing cron verifies `CRON_SECRET` before invoking the separately gated worker. No new cron was added; canonical customers/presales are excluded from legacy arithmetic reminders, even while CP8 dispatch is disabled. **Cutover must account for this reminder coverage gap.**

## Delivery and reminder semantics

Outbox states: `awaiting_configuration → ready → sending → accepted`, with `retry`, `uncertain`, `failed` and `suppressed` alternatives. `accepted` means the provider returned a message ID, not that the buyer received or read the email.

- Preparation binds an event to its original owner/terms and snapshots recipient, template, contact fingerprint and stable provider key. Historical events lacking that binding require a reviewed migration; they are not automatically mailed to a new owner.
- Before claiming a send, the worker rechecks current contact/version, source ownership and contract terms. Reminder delivery also rechecks deadline stage, fulfillment, contract state, pending cases and active checkout.
- One attempt has a 60-second durable lease and a unique attempt record. The send occurs outside the transaction with a 10-second provider timeout. Parallel workers cannot claim the same attempt.
- A provider HTTP 429 is retried with exponential backoff, starting at 60 seconds, with at most five total attempts. Network errors, 5xx responses, missing message IDs and expired send leases become uncertain; they are not blindly resent. Other provider rejections are failed and require review.
- A crash after sending but before saving the result leaves a durable lease that becomes uncertain. Admins must investigate the provider and either record its acceptance/message ID or explicitly confirm non-acceptance before queuing the same stored message. This decision is version checked, idempotent and audited; role removal also blocks a replay.
- Brevo receives a deterministic UUID `idempotencyKey` in the JSON `headers`. Its documented deduplication window is **30 minutes**. This supplements the local attempt state; it is not an indefinite exactly-once guarantee. An admin must not infer non-acceptance merely from a timeout.
- Missed runs catch up to the latest applicable reminder stage: three/two days before uses the three-day stage, one day before/on the deadline uses the one-day stage, and the first eligible run after the deadline uses the after stage. Older queued stages are suppressed. There is only one after-deadline event per booking/terms/deadline, not a daily overdue campaign.
- Each invocation scans at most 20 opted-in bookings, prepares at most five events, recovers at most five expired leases and dispatches at most five due emails. Durable cursors rotate through reminder/preparation work. Invalid mappings do not block other bookings; operational review must resolve them.

**Capacity is a release gate:** the existing daily cron alone is insufficient for large queues. Configure and validate enough authenticated worker invocations, hosting duration and monitoring to complete all reservation scans and due messages within their Manila date windows. Five sequential sends can consume up to 50 seconds plus database work. No hosting schedule, duration, quota or monitoring service was changed. Do not activate without testing realistic queue size, oldest-event age and failure recovery.

## Contact and data requirements

For each approved canonical booking, a trusted provisioning process must supply:

```text
notificationContact: {
  enabled: true,
  verified: true,
  version: positive integer,
  email: normalized stored source email,
  ownerBinding: current canonical owner binding
}
```

This is not a browser-writable assertion. Verify the recipient through the approved contact process, protect all writers and increment its version monotonically on every change. Reservation access-version changes also invalidate prepared contact fingerprints. No contacts were provisioned here. Contact changes after a send has already been claimed cannot retract an external email; use the claim time as the authorization boundary and investigate in-flight attempts during sensitive changes.

`emailOutbox`, `emailAttempts`, `paymentWorkerState` and `notifications` are private server collections. Receipts now retain `ownerBinding`. Existing financial/audit/idempotency collections retain their private boundaries. Outbox templates contain financial details and addresses: exclude unqueried text from indexes, avoid sensitive request logging, and approve retention/archive policy before activation. Do not TTL-delete uncertain attempts needed for reconciliation.

Optional trusted `bookings.recordedAllocationSnapshot.rows` contains references and existing `agentCentavos`, `brokerCentavos`, `companyCentavos`, `vatCentavos` values. Without it, statements use only explicitly stored legacy `payments[].alloc` values. Missing values remain **Not recorded**. No amount/rate fallback, commission clock reset, VAT inference or payout is performed. Source legacy snapshots must be reconciled and protected at cutover.

## Reporting boundaries

- Receipt acknowledgements use immutable amounts and balance **after that receipt**, even if later money changes the current balance. They are explicitly not official tax invoices. Current owner/session checks still apply; no public receipt URL or QR was added.
- Statements validate ledger credit against the canonical booking, display current total/credit/balance/unapplied funds, per-plot balances, reservation lifecycle and recorded allocation snapshots. Signed reversal/adjustment entries can appear in a reconciled statement; this does not add a reversal writer.
- Collection dates are actual Manila received dates. Opening balances are excluded. Receipt principal, unapplied credit, gross, buyer fee and actual recorded provider fee are separate. Missing provider fees are not guessed.
- A gateway payment linked to an existing manual receipt contributes principal once. Its provider gross and buyer fee appear in separate CSV columns; the immutable manual receipt is not rewritten and those linked fields are not added again to collections.
- CSV uses integer centavos, quoted fields and formula-injection protection. It is not a settlement or tax return. Reports identify their as-of read time.
- More than 500 queried entries fails explicitly instead of returning truncated financial totals. Narrow collection dates or use a separately reviewed historical export. Ranges containing reversals/adjustments also require a reviewed export; CP8 does not silently omit them.
- Portfolio sales, settlement matching, cash-on-hand/payout ledgers, refund reports, editable monitoring sheets, agent payout processing and accountant-gated installment/penalty reports remain follow-up work. Existing CP4/CP6/CP7 queues cover case, provider and reservation review; this checkpoint does not claim every target report in blueprint Section 17 is complete.

## OCR and interface details

Tesseract.js **6.0.1**, its worker, core **6.0.0** and English language assets load only on demand from the configured public asset hosts. `cacheMethod: none` avoids retaining an OCR language cache through this integration. The receipt is passed to a local worker, not an OCR API. CDN requests still expose ordinary network metadata; review CDN/CSP policy before deployment.

Progress, cancellation, a 20-second timeout and worker termination preserve the image and typed fields. Only bounded reference, amount, ISO date and recipient candidates/confidences are retained: at most 12 suggestions, 100 characters each. No full OCR text is saved. Metadata distinguishes `manual`, `ocr` and `ocr_edited`; these are untrusted assistance labels, never financial authority. Real receipt-format coverage remains limited until sanitized bank/GCash samples are tested.

The interfaces reuse the existing green/cream design, visible labels, focusable feedback, confirmations and responsive controls. Reports use horizontally scrollable tables rather than shrinking dates/amounts; print CSS shows the selected report/acknowledgement. No package or framework upgrade was needed.

## Activation gates and validation

Keep `PAYMENT_OPERATIONS_ENABLED` and `PAYMENT_EMAIL_DISPATCH_ENABLED` unset/false. The operations route also depends on full CP2 configuration; dispatch additionally requires `PAYMENT_WORKER_SECRET` of at least 32 characters and the configured Brevo sender. Do not reuse the public API, access HMAC or provider secret as the worker secret. No environment file or credential was read/changed.

Before enabling: complete existing canonical migration and legacy-writer retirement; verify/provision contacts and historical event ownership; compose/test actual Firestore rules/indexes; validate recipient/provider configuration, dispatch capacity, retention and monitoring; run real SDK/emulator and staging integration tests. See [rules review](access-rules-review.md). No deployed rules, production records, real money or real email were used here.

Local validation: **167 unit/HTTP tests passed**, all **six payment browser suites passed** against synthetic data, including real pinned OCR assets reading a generated sample. The first real OCR attempt reached the fallback timeout; the diagnostic rerun passed. This demonstrates recovery and integration, not a guaranteed download/recognition time on every device. Desktop/mobile screenshots were inspected. JavaScript/JSON syntax and whitespace checks are recorded in the checkpoint log. Actual Firebase/emulator/index/rules, provider inbox delivery, physical printing and real-device/sample receipt testing remain release gates.

For a sample-only preview:

```powershell
npm.cmd run preview:payments -- --operations
```

Open `/payment-operations-admin.html` or `/my-payments` at `http://127.0.0.1:4173`. Use fake login details only. Mock sends never contact Brevo; the optional real OCR test downloads public assets and reads a synthetic image on the device. No synthetic fixture is a production migration input.

Skills applied: local Firebase authentication with delegated rules/invariant review, UI/UX form/progress guidance and responsive design. Official references: [Brevo transactional send](https://developers.brevo.com/reference/send-transac-email), [Brevo idempotency header and window](https://developers.brevo.com/docs/heterogenous-versions-batch-emails), [pinned Tesseract API](https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/api.md).

**Handoff:** review/save CP8, then pause. CP9 migration, backup/recovery and release validation require a separate request; saving this source checkpoint does not authorize production changes.
