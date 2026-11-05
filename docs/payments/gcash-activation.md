# Enable the authorized GCash QR

Updated November 2, 2026 (Asia/Manila). The user confirmed the replacement QR is authorized to receive park payments and that customers should see `JU**L B.` as the recipient. The original image is saved unchanged as `payment-qr/gcash-v1.jpg`; its SHA-256 is pinned in `lib/payments/qr-assets.json`. No mobile number was inferred from QR routing identifiers.

**The source is configured; the live site has not been activated by this change.** Vercel CLI was logged out and browser control was unavailable. The user requested these manual setup instructions. No deployment or Firebase writes were performed.

## 1. Prepare the correct Firebase project

Use the project belonging to this website and its server credential. Before enabling uploads, verify the composed Firestore rules prevent client reads/writes of payment proofs, sessions, receiving accounts, budgets, bookings and ledgers, including for admin browsers. Also protect the new reservation-operation and hold-limit collections. Do not switch Firestore to test mode. The exact boundaries and required indexes are in [access rules review](access-rules-review.md); deployed rules/indexes are not included in this checkout and were not certified here.

In Firebase Console → Firestore Database → Data, create the following document (use the exact ID, not Auto ID). If it already exists, compare its recipient and fields rather than overwriting an unrelated account. [Firebase console instructions](https://firebase.google.com/docs/firestore/using-console)

**Collection:** `paymentReceivingAccounts`  
**Document ID:** `gcash-qr-v1`

| Field | Firestore type | Value |
|---|---|---|
| `enabled` | boolean | `true` |
| `presaleEnabled` | boolean | `true` |
| `version` | number | `1` |
| `channel` | string | `gcash` |
| `label` | string | `GCash` |
| `accountName` | string | `JU**L B.` |
| `accountNumber` | string | Empty string |
| `instructions` | string | `Scan this QR in GCash and confirm the recipient is JU**L B. Enter the exact deposit shown, then keep the receipt and submit your payment details for admin verification.` |
| `qrAssetId` | string | `gcash` |
| `qrVerified` | boolean | `true` |

The same values are supplied in [gcash-receiving-account.json](examples/gcash-receiving-account.json). The console requires individual fields with the types above; this JSON file is a reference, not an automatically imported database change. Leave `accountNumber` empty: no verified mobile number was supplied. The QR binds the receiving account, and the UI hides the copy-number button.

Check **`paymentProofBudget/manual`**. If it does not exist and the private proof store has never been used, create:

| Field | Firestore type | Value |
|---|---|---|
| `usedBytes` | number | `0` |
| `limitBytes` | number | `67108864` |

If proofs/budget already exist, preserve the actual `usedBytes`; never reset it to zero. A missing budget with existing proof documents requires reconciliation. This is a 64 MiB application cap, not a Firebase billing or plan allowance.

Use the existing index review. At minimum, the basic proof list requires `payments` with `submissionScope ASC`, `submittedAt DESC`, `paymentId DESC`; the default admin queue uses `schemaVersion ASC`, `status ASC`, `submittedAt ASC`, `paymentId ASC`; ledger history uses `bookingId ASC`, `recordedAt DESC`, `receiptId DESC`. Additional admin filters need their corresponding reviewed indexes. Exempt proof image base64 from indexing. Ensure an existing authorized admin can open the review screen; a customer or staff login cannot approve money.

## 2. Set the Vercel environment variables

Open the website's Vercel project → Settings → Environment Variables. Choose **Production** for the live deployment, or the correct **Preview** branch environment for a preview. Do not assume `presale-system` is the production branch; check project settings. Variables must be present in the environment being deployed. [Vercel environment scopes](https://vercel.com/docs/environment-variables)

| Variable | Value |
|---|---|
| `PAYMENT_ACCESS_ENABLED` | `true` |
| `PAYMENT_SUBMISSIONS_ENABLED` | `true` |
| `PAYMENT_REVIEW_ENABLED` | `true` |
| `PAYMENT_PRESALE_ENABLED` | `true` |
| `PAYMENT_PRESALE_GCASH_ACCOUNT_ID` | `gcash-qr-v1` |
| `PAYMENT_ACCESS_ORIGIN` | `https://golden-harmonic-memorial-park-phi.vercel.app` |
| `PAYMENT_ACCESS_RATE_SECRET` | Existing stable random secret of at least 32 characters, or generate one if absent |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Base64 of the service-account JSON for this Firebase project |
| `BREVO_API_KEY` | Existing valid server-side Brevo key |
| `SENDER_EMAIL` | Existing authorized Brevo sender email |

The origin shown is from this project's configured website URL. If customers use a different domain, set its exact HTTPS origin instead. **No trailing slash, pathname or quotes.** A different origin will fail the request-origin check.

Customer reservations, QR/proof submission and payment access also accept this build's exact HTTPS deployment address from Vercel's server-provided `VERCEL_URL`, when `VERCEL=1`, the request host matches, and the browser reports `Sec-Fetch-Site: same-origin`. This fixes the reservation error when opening the deployment's Visit URL. No wildcard Vercel origins, forwarded hosts, other deployments or branch aliases are trusted. Keep `PAYMENT_ACCESS_ORIGIN` on the public website: verification emails and admin/payment-gateway tools continue to use it. Custom domains still need that exact configuration. See [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

If an older build says “Open the reservation form from the park website,” use the public `/presale` address or deploy the origin-check fix. GCash availability and a working image URL alone do not test reservation POST permissions. The origin rejection occurs before a reservation is created; retrying the same unrecognized address cannot resolve it.

If the rate secret is missing, generate a new one in PowerShell and copy it without printing:

```powershell
$paymentSecretBytes = New-Object byte[] 32
$paymentSecretGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$paymentSecretGenerator.GetBytes($paymentSecretBytes)
$paymentSecretGenerator.Dispose()
[Convert]::ToBase64String($paymentSecretBytes) | Set-Clipboard
```

Paste into Vercel's secret value. Preserve an existing secret; changing it affects rate buckets and creation-session recovery. Keep Firebase/Brevo credentials server-side and out of Git. Do not use the frontend Firebase API key as the service account.

Maya stays unavailable: do not set `PAYMENT_PRESALE_MAYA_ACCOUNT_ID` until its separately verified asset and receiving record exist. PayMongo's settings are independent and need no change for this manual GCash flow. Existing lifecycle/operations flags remain separate; enabling GCash does not automatically enable email dispatch or all payment admin tools.

## 3. Deploy this source revision

Commit and push the new QR, manifest, setup/test changes and updated UI to the intended deployment branch, then let Vercel build that revision. If environment variables were saved after the build, redeploy that revision. Redeploying an older commit cannot include the replacement QR. [Vercel redeployment requirement](https://vercel.com/docs/environment-variables/managing-environment-variables)

## 4. Verify availability without sending money

Open the deployed path `/api/presale?paymentOptions=1`. With the matching configuration and available proof storage, expect:

```json
{"gcash":true,"maya":false}
```

If GCash is false, check the variable environment, service account, exact receiving document fields, new image/manifest deployment and proof budget. This endpoint intentionally returns false rather than exposing configuration secrets.

The other configuration checks are `/api/payment-access`, `/api/payment-submission`, and `/api/payment-review`; each should return `{"enabled":true}`. Those flags alone do not prove database access, email delivery or indexes work.

Check the deployed image at `/payment-qr/gcash-v1.jpg`. In an authorized staging reservation, confirm holds occur before the QR, the displayed recipient is `JU**L B.`, the deposit for new reservations is ₱3,000 per plot, and proof submission reaches the admin queue without crediting money. Confirm correction retains holds/deadline and admin approval requires actual statement verification. Do not approve synthetic proof as real received money.

The application never marks a payment verified merely because a QR was scanned or a screenshot uploaded. Manual admin verification remains required.

If a saved reservation shows “Could not finish the request” before the QR, check the submission-history composite index first. See the [QR loading audit and recovery steps](qr-loading-audit.md). `GET /api/payment-submission` only reports a feature flag; it does not check Firestore indexes. The read-only `scripts/payments/check-readiness.cjs` script can verify the payment query prerequisites using the deployed project's server environment.
