# CP5 — cash record, print, photo and approval

Completed locally **November 1, 2026 · Asia/Manila**, starting from CP4 `f6230ff`. This is a source checkpoint. No live cash, production configuration/data, deployment, migration, email or remote push was performed. `PAYMENT_CASH_ENABLED` remains off by default.

## Confirmed workflow

The user confirmed **the same admin may record and approve cash**. Only current `admin`/`superadmin` users can use the cash API, including reads, print attempts, photos and replayed operations. Staff and customers cannot record or approve cash.

1. **Record:** load the exact customer/reservation ID and its approved canonical cash configuration. Enter actual cash received, Philippine received time, purpose, collector and the unique office intake reference. Review and confirm. Save one pending payment, immutable receipt snapshot, held economic identity and cash-on-hand reconciliation record atomically. Principal remains unchanged.
2. **Print:** review the print action, save an audited attempt and open the browser print dialog. Cancelling the dialog still counts as an attempt. The pending copy says **PROVISIONAL — pending verification; no account credit yet**. Reprints keep the same identity. Approved reprints show approved status over the same original received-money snapshot.
3. **Photo:** upload a readable photo of the printed copy. Inspect the compressed preview and confirm the upload. Each sanitized photo revision is immutable and privately bound to the snapshot and a print attempt; earlier revisions remain viewable. An online transfer screenshot is not valid cash evidence. File validation cannot establish physical authenticity or legibility; the approving admin must inspect it.
4. **Approve:** open the latest saved photo, confirm it matches, enter a reason and explicit per-plot principal allocations, then review the decision. Approval credits the recorded amount up to remaining principal; excess stays unapplied. The original received amount/time cannot be replaced at approval. The same receipt identity moves from pending to approved.

The cash screen is `/payment-cash.html`, linked as **Cash receipts** in admin navigation. Its oldest-first queue has 20-row cursor pages and pending/approved/all filters. Exact source-ID filtering is also supported by the API. Reloading the queue resumes saved records; private drafts/images are not stored in the browser. Uncertain responses keep the exact request for retry. After leaving a page, retrieve the existing record before starting again with the same office intake reference.

Customers and authenticated reservation guests can see their cash status/photos through the existing private payment view and canonical credit after approval. They cannot edit cash evidence. Internal approval reasons and actor data are not exposed in customer lists.

## Identities, configuration and invariants

These are **server-owned contracts to provision only through an authorized migration/configuration process**, not production seeds:

| Record | CP5 addition |
|---|---|
| `paymentSubmissionScopes/{scopeKey}` | Existing source/booking mapping, enabled/version and reconciled `openCases`; `cash: {enabled: true, receivingAccountId, receivingAccountVersion, purposes}`. Purposes are an approved subset of deposit/installment/advance/settlement. Increment scope version for configuration changes. |
| `paymentReceivingAccounts/{stableRegisterId}` | `channel: cash`, enabled/version and label. The stable ID represents the issuing office register/series; configuration versions must not reset uniqueness. |
| `payments/{CP-id}` | Schema 5, immutable received facts and snapshot, binding to canonical booking/terms/current owner, `pending_verification` → `verified`, independent case version/photo count, latest print/photo IDs. |
| `cashPrintEvents/{operationId}` | Server timestamp, actor, payment/receipt ID, snapshot hash and status at the attempted print. This proves an attempt, not a completed physical print. |
| `paymentProofs/{paymentId}_rN` and nested revisions | `evidenceType: printed_cash_receipt`, snapshot/receipt/payment/scope/print bindings and immutable sanitized content. |
| `paymentReconciliations/{paymentId}` | Confirmed cash-on-hand amount/time/register/reference, open until the same receipt posts; retains funds when later approval checks fail. |
| `economicPayments/{digest}` | Cash-specific permanent identity: `sha256(JSON.stringify(['cash-receipt-v1', stableRegisterId, trimmedOfficeReference]))`; held at recording, posted at approval. Case and leading zeroes are preserved. |
| `operationKeys/{digest}` | Actor-scoped request ID, action/payload hash and original result; changed retries conflict. Current authority is checked before returning a saved result. |

New receipt identities are `CASH-<digest-prefix>` internal acknowledgements. They are not official tax numbers. No public verification link or receipt QR is added; Q10/Q14 remain open. Existing `CR-` receipts/numbers from the other branch are neither imported nor renamed. Their one-time migration and cross-writer deduplication remain CP9/cutover work.

The office intake reference is required as an additional duplicate guard, including across admins and bookings. It must identify the same real cash handover, within its stable register/series. Different invented references can still represent the same physical cash; the software cannot detect that without reconciliation. Do not create a replacement reference to bypass a duplicate/error.

The printed snapshot, flattened posting facts, held identity, print events and photo revision must agree. Shared `posting.js` supplies CP4/CP5's canonical source, owner, scope/recipient versions, terms, opening-credit provenance, plot locks, totals and allocation checks. Receipt, ledger, item/booking projections, reconciliation resolution, economic key, pending counter, audit, notification, dormant outbox and operation result commit atomically. No provider call or print dialog occurs inside a transaction.

Recording increments the shared pending counter; approval decrements it once. The buyer's five-open-case submission cap does **not** prevent an admin retaining actual cash. Recording still requires valid configured canonical ownership. If cash arrives before those prerequisites exist, the office must retain its original intake record and reconcile through an authorized exception process before using this route; CP5 does not create an unassigned-cash suspense module. Approval failures after recording leave held cash visible. There is no reject/delete/refund shortcut for received cash.

## Storage, limits and security

- Reuses the **same** `paymentProofBudget/manual` budget as CP3; no second storage allowance. At most ten retained photos per receipt and 100 print attempts. HTTP traffic controls apply to all calls.
- Existing image validator: server input ≤512 KiB; JPEG/PNG/WEBP still images, dimensions 64 pixels minimum and 16 MP maximum, re-encode/strip metadata, output ≤300 KiB, charged document ≤420 KiB including conservative metadata allowance. Shared budget ≤64 MiB. Upload failure leaves recorded cash pending.
- Cash API body bound 720 KiB, same-origin JSON POST, bearer identity with revocation check, current transactional role, strict fields and no-store responses. GET reveals only enabled status. No Firebase configuration or browser financial writes added.
- Private UI clears on sign-out, identity change, bfcache restore or a 15-minute view timer. Print copies contain private customer information and are rendered only after authorized retrieval; use the office's document-handling process.
- Add `cashPrintEvents/**` to the composed server-only rules review. Keep all payment/proof/reconciliation/ledger/role/configuration authority protected, including against admin browsers. See [rules review](access-rules-review.md).

## Local validation

**102 automated tests passed**, including 84 previous checks and 18 CP5 checks. New coverage includes same-admin success, staff/revoked/changed-role denial, replay, cross-booking register/reference deduplication, missing print/photo, immutable evidence replacement, invalid/storage-full photos, recorded-fact integrity, wrong receipt bindings, ownership/terms/register/opening-balance races, photo-versus-approval races, atomic failure/retry, excess allocations, canonical customer/guest parity and pagination beyond 500 records.

All three local Edge suites passed: CP5 cash, CP4 review and CP2/CP3 access/submission. Cash browser checks covered staff denial, lost record/approval responses, pending print copy, photo upload/review, same-admin excess approval, customer status/history, cleared private print state and 320/390/768 px overflow. Desktop/phone/print screenshots were inspected. The browser test replaces the native print dialog with an observed invocation and checks print CSS; it does not certify a physical printer or photographed paper. Test photos are synthetic images, not evidence that a real receipt is readable.

Tests use the in-memory transactional double and mocked local identity, not Firebase emulator or production. Actual Auth/Firestore SDK, composed rules/indexes, staging, printers/real cameras and accessibility checks remain activation gates. No dependency upgrade was needed.

```powershell
npm.cmd run test:payments
npm.cmd run preview:payments -- --cash
```

Open `http://127.0.0.1:4173/payment-cash.html`. Use `admin@example.test` and any fake password; load `customer` / `c1` or `presale` / `PS-0001`. The preview uses sample in-memory data, never production credentials, email or money. Stop it with Ctrl+C. Do not import its records into production.

## Activation and next checkpoint

`PAYMENT_CASH_ENABLED=true` also requires the complete CP2 access configuration; no activation values were changed. Before enabling: reconcile canonical bindings, register identities/references, scopes/counters and storage; review/test actual composed rules and indexes; retire/reroute every incompatible legacy cash/manual/gateway writer; verify customer/office/report parity and operational exception procedures. `legacyWritesBlocked` remains an assertion until the actual writers/rules are changed. Legacy migration is not accomplished by shared library code.

CP5 does not implement customer cash-intention codes (`awaiting_cash`), unassigned cash intake, voids/refunds/reversals, public receipt verification, official tax numbering, deposit fulfillment, schedules, release decisions, provider reconciliation or outbox delivery. Buyer cash-intention routing can accompany CP7's reservation lifecycle; the remaining financial/operational work stays in CP6–CP9. The demo payment QR remains unchanged and cannot accept money.

Checkpoint subject: **`Payment CP5: add admin cash record print photo approval`**. Find its commit with `git log -1 --format='%h %s' --grep='Payment CP5:'`. Next checkpoint: **CP6 — secure PayMongo integration and shared reconciliation**, only after the user resumes. See [checkpoint backup guide](checkpoint-backup-guide.md); saving this commit does not create a backup archive.

Skills: Firebase authentication and its delegated rules/invariant review; UI/UX progress indicators, form labels and saved/error feedback; responsive design. Shared transaction/auth handling follows [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions) and [Firebase session verification](https://firebase.google.com/docs/auth/admin/manage-sessions).
