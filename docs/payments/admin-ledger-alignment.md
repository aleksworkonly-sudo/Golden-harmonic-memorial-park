# Verified payments in admin records

The legacy Admin Panel calculated balances and exports from `customers.payments` and
`presaleApplications.payments`. Manual payment approval writes the canonical booking,
receipt and ledger instead. This left a verified GCash payment invisible in the older
reservation modal and exports.

The Admin Panel now resolves canonical records through the authenticated
`/api/payment-review` `record` action. Existing approvals are included immediately on
loading the screen; no backfill or repeat approval is required. Customers, linked
reservation records, monitoring sheets and presale reports share the verified data.
The Sales CSV includes verified paid and balance columns. Read failures pause affected
reports with a retry instead of falling back to stale zero balances. Posting remains
in the existing transaction; report reads do not create payments or write legacy arrays.

The read endpoint checks the current admin role, source ownership binding, booking
integrity and ledger credit total. It uses a bounded equality query, without introducing
another compound index. Accounts exceeding 500 ledger entries explicitly require a
paginated export; partial results are never presented as complete. Historical opening
credit is not reported as a new payment. Actual unapplied money remains separate from
principal credit in the ledger response.

## Monitoring sheet refresh

Both the reservation's Customer sheet button and the list's Print sheet button open
the same editor, outside the legacy-payment controls. Opening the editor reads the
reservation from Firestore's server and resolves its verified ledger again. This also
handles a list snapshot that predates canonical binding. A failed read shows Retry
sheet and prevents a blank or stale download.

Canonical sheets display verified paid and remaining balance, and include payment
date, reference, credited amount and channel in the form and Word download data.
Payment cells are read-only; the obsolete legacy Save to record action is hidden
for these reservations. Approvals are already recorded and must not be copied into
legacy payment arrays. Reload sheet re-fetches the data, with confirmation before
discarding any unsaved sheet-only edits. The 60-row paper form refuses larger
ledgers instead of silently truncating them.

The synthetic browser regression covers both entry points, stale snapshots,
download payloads, protected payment cells, read failures, retry and reload. It
does not inspect or modify production reservation PS-0033.

## New reservation policy

New reservations quote a ₱3,000 deposit per plot. It is part of the contract total.
New installment quotes divide the total less the required deposit by the selected
number of months. Canonical approval calculates the schedule from verified principal
credit when the deposit becomes fully funded. The last installment absorbs remaining
cents. For ₱22,000 less ₱3,000 over 12 months: 11 × ₱1,583.33 and 1 × ₱1,583.37.

New canonical lifecycle terms snapshot `depositPerPlotCentavos: 300000` and
`installmentCalculation: remaining_after_deposit_v1`. Existing terms without those
fields retain the former ₱5,000-per-plot requirement and original schedule behavior.
No existing quotes, verified amounts, database records, deadlines or penalties were
rewritten. Spot-cash plans continue to have no monthly schedule.

## Validation and rollout

Unit/HTTP coverage checks existing approved receipts, replay without duplication,
admin authorization, inconsistent ledgers, new installment cents and legacy terms.
The browser integration verifies reservation balance/history, Sales/VAT/Allocation
CSV downloads and recovery from a ledger outage. It uses synthetic data only.

Deploy the frontend and API changes together, then reopen the Admin Panel. No live
Firebase data or deployment was changed during implementation. The repository's
pre-existing API file-count test remains failing; this change adds no API entry file.
