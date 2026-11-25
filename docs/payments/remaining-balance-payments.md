# Presale payments after a verified deposit

The reservation provisioner stores a single deposit offer. Previously the submission
service removed that offer once the deposit was funded, leaving the email-linked
My payments page with a correct balance but no receiving QR or payment option.

For canonical presales provisioned by `new-presale-deposit-v1`, the service now
derives a `remaining-balance` offer after the deposit is funded. It uses the existing
scope's verified receiving account and its pinned account version/QR binding. The
amount comes from the current canonical booking inside the transaction. Existing
single-deposit scopes work without migration or another deposit approval. Explicit
multi-offer configurations are preserved.

Buyers may submit a positive partial amount up to the remaining principal, or the
full balance. Valid partial amounts are not marked as quote mismatches. The server
rechecks the current balance at submission; amounts above it require refresh/office
assistance. Pending evidence never changes the balance. Existing single-open-case,
correction, authorization, idempotency and admin-verification controls still apply.
After approval, subsequent reads use the reduced balance. Fully paid bookings have
no new offer and show a paid message. Disabled/changed recipients, invalid booking
bindings and closed bookings cannot supply a payment option.

The customer UI provides Pay remaining balance / submit proof, verified QR download,
partial-payment instructions and the existing proof review step. Payment deadlines
and installment contract terms remain unchanged. PayMongo enablement is independent
of this manual GCash workflow.

Validation: `remaining-balance.test.js` exercises an email-verified ₱22,000 contract,
₱3,000 deposit, ₱5,000 partial payment, correction, retry and final ₱14,000 settlement.
`remaining-balance-browser.cjs` opens the actual email exchange page and My payments
UI against synthetic services, uploads proof and verifies the refreshed balance.
It uses a synthetic QR and does not access production PS-0034 or send money.
