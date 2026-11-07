# Presale proofs and the Admin sidebar

On November 7, 2026 the public production `admin.html` did not include
`payment-review.js`, and its `admin-app.js` still mounted `PendingPayments` directly.
That older panel reads only customer documents' `paymentSubmissions` arrays. Presale
proofs live in the canonical `payments` collection and cannot appear in that panel.
The current checkout already embeds `PaymentReview`; deploy the complete current
checkout to production, rather than rebuilding an older deployment. Existing proofs
do not need to be submitted again.

The sidebar now uses authenticated `POST /api/payment-review` with `action: count`.
It counts schema version 3 cases in `pending_verification`, using the same query and
index as the default review queue, across all pages. Verified/rejected cases and
cases awaiting customer correction are excluded. A corrected submission is counted
again once it returns to pending verification. Cash receipts and older portal
references remain separate workflows. The older list has an explicit label to
avoid presenting its zero count as the Presale queue.

Notifications refresh every 30 seconds while the tab is visible, when focus returns,
after a review decision, and when Refresh queue is selected. A failed request shows
`!` with an accessible explanation, not zero. An idle first-page queue refreshes
with notifications; open reviews, unsaved decisions and paginated results are not
replaced. Background refresh retains the saved-decision confirmation.

The count is a server aggregation, not a browser read of payment/proof documents.
Current admin authorization is checked in the same read transaction. This adds no
API deployment entry point and no new composite-index shape. Admin assets now
require cache revalidation. Deploy HTML, JavaScript and the API together.

Local tests cover authorization, counts beyond the first page, correction/resubmission,
incoming Presale proof visibility, error/recovery, retained review input and mobile
layout. The browser test uses synthetic records and does not submit production proofs
or approve actual money. No production deployment was performed here.
