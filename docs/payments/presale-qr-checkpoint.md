# Presale QR and proof integration — November 2, 2026

This follows CP9 and the Vercel routing fix. The user authorized a held-plot → QR → proof → admin-verification flow. Keep the original three-month deadline, credit the ₱5,000-per-plot deposit toward the plan, and retain plot holds when corrected proof is requested.

## Current availability

**Real collection remains unavailable.** The user identified the receiving method as GCash and the name as **Golden Harmonic**, then confirmed the supplied image is a placeholder after local decoding returned only `09090909999`. It is stored unchanged at `payment-qr/gcash-placeholder.png`; `lib/payments/qr-assets.json` marks it unverified. The customer payment UI does not display this as payment instructions. No Maya QR was supplied. No credentials, production records, payment flags or deployed settings were changed.

The complete flow is exercised with separate synthetic receiving configuration in local tests. Production code has no preview bypass. Merely setting an environment flag cannot enable a placeholder QR.

## Customer flow

1. The presale form checks method availability through the existing `/api/presale` endpoint. GCash explains why it is unavailable; Maya is disabled until configured. Cash, bank, cheque and PayMongo keep their existing paths.
2. For an available GCash/Maya method, submit the reservation with a random 256-bit recovery capability kept in tab session storage. The server validates same-origin JSON, traffic limits and input; clients never select their own deposit or receiving destination.
3. One transaction rechecks prices, exact receiving configuration, proof-storage readiness, plot availability, duplicate mobile and reservation numbering. It creates the source, canonical booking, zero opening balance, plot bindings, submission scope and restricted session. New holds are capped at five requests per requester per Manila day. No historical records are migrated.
4. The QR screen appears only after the hold commits. Show the reference, selected plots, original deadline, deposit, recipient and saveable QR. “I have paid — submit proof” reveals the form; this click is not payment confirmation.
5. Require wallet name, Philippine mobile, reference, actual amount, Philippines date/time and a receipt image. Reuse existing bounded decoding, private image documents, preview, immutable revisions and duplicate-safe submission.
6. Show “Payment submitted — pending admin verification.” The balance stays unchanged and plots remain held. Corrections keep the original case, previous proof and deadline. Existing pending proof blocks another new deposit case.
7. Admins inspect the image and payer details, including earlier revisions, and verify the receiving statement. Approval reuses the shared atomic receipt/ledger/balance/economic-identity transaction. Actual received principal is credited; excess remains unapplied. A correction applies no credit and releases no plots.
8. Verified partial deposits reduce the next offered deposit amount. When the deposit is funded, the deposit offer disappears. Further installment/settlement offers need separately approved office configuration; no unapproved schedule formula is invented.

## Access and recovery

- The creation cookie is Secure, HttpOnly, host-scoped and SameSite=Strict, with a fixed 30-minute lifetime. Its `presale_creation` session authorizes only the proof workflow. It does not establish email ownership or grant payment-history, PayMongo or reporting access.
- The presale proof UI supplies its expected reservation reference on every request, preventing a changed cookie in another tab from silently submitting to a different reservation.
- Later access uses the existing email-verification link. New manual reservations receive `accessVersion: 1`, making this flow eligible without manual legacy-contact provisioning. Notification contact remains disabled/unverified; email ownership is not inferred from form entry.
- Retrying the same reservation capability returns the original result without new plots, new references, repricing or deadline/session extension. Changed input, revocation, contact changes or expiry cannot recreate access. Raw recovery capabilities and session secrets are not persisted in database documents or logged.
- An uncertain response leaves a recovery screen that retries the exact saved request. Completed reservation metadata lets a page refresh return to the payment step. Expired proof access directs the buyer to email verification. Tab data is not proof of authorization; the server checks every private operation.

## Activation prerequisites

Retain all CP9 composed-rule, index, provider, backup and staging release gates. Do not enable this path until they pass.

For each supported wallet, supply and verify the **real** receiving QR in its wallet app. Add a versioned non-placeholder asset under `payment-qr/`. Its reviewed `qr-assets.json` entry must match the receiving document's exact `channel`, `accountName`, `accountNumber`, `receivingAccountId`, `receivingAccountVersion` and `imagePath`, with `verified: true`. A same-name different wallet must not reuse that asset. Replace the placeholder with an actual reviewed asset; never just flip its verification flag.

The server-only `paymentReceivingAccounts/{id}` needs the matching `version`, `channel`, `label`, `accountName`, `accountNumber`, `instructions`, `qrAssetId`, `qrVerified: true`, `presaleEnabled: true` and `enabled: true`. `paymentProofBudget/manual` must have valid bounded capacity (maximum 64 MiB), with at least one proof document's capacity available before a new hold is accepted. Existing proof submission rechecks actual capacity; availability is not a promise of unlimited storage.

Required existing configuration: `FIREBASE_SERVICE_ACCOUNT_B64`, complete HTTPS payment access/Brevo sender configuration, and the submission/review feature flags. This integration adds:

- `PAYMENT_PRESALE_ENABLED=true` only after release checks.
- `PAYMENT_PRESALE_GCASH_ACCOUNT_ID` for the verified GCash receiving document.
- `PAYMENT_PRESALE_MAYA_ACCOUNT_ID` only when a verified Maya account and QR exist.

There are still **nine Vercel function entry points**. New logic is under `lib/`, not new `api/` files. No push, deployment, live money, email or production migration was performed.

## Validation

Local tests cover atomic holds, competing buyers, failed transactions, recipient/price races, placeholder rejection, receiving-account identity/version binding, lost-response and repricing recovery, restricted sessions, changed contacts, mismatched reservation scope, email verification, correction, actual/excess approval and exactly-once credit. Browser checks cover the actual presale JSX/payment component, QR before input fields, image upload, review, uncertain retries, immutable corrections and 320/390/768 px layouts. Existing customer-proof and admin-review browser suites are regression checks. Synthetic tests do not certify deployed rules or real GCash/Maya payments.
