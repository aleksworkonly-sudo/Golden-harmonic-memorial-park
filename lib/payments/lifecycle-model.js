'use strict';

const { requireCondition, PaymentError } = require('./errors');
const { centavos, addCentavos, depositForPlots } = require('./money');
const { timestamp, manilaDate, reservationDeadline, installmentDueDate } = require('./calendar');
const { documentId } = require('./auth');

const MAX_ENTRIES = 500;
const review = (message) => requireCondition(false, 'LIFECYCLE_REVIEW', message, 409);

// Only verified principal ledger entries establish funding. Neither proof claims nor fees enter this model.
function deriveLifecycle(booking, entries, at) {
  if (!Array.isArray(entries) || entries.some((e) => !e || typeof e !== 'object' || Array.isArray(e))) review('Ledger entry format needs reconciliation.');
  const terms = booking.lifecycleTerms;
  if (!terms || terms.version !== 1 || terms.bookingTermsVersion !== booking.termsVersion ||
      terms.reservationVerified !== true || !['installment', 'spot_cash'].includes(terms.plan)) {
    review('Reservation terms need office reconciliation.');
  }
  timestamp(terms.reservedAt);
  if (terms.reservedAt > at || (terms.plan === 'installment' && ![12, 24, 36, 60].includes(terms.termMonths))) {
    review('Reservation date or term needs office reconciliation.');
  }
  const required = depositForPlots(booking.items.length);
  if (required > booking.totalCentavos || entries.length > MAX_ENTRIES) review('Deposit or ledger history needs office reconciliation.');
  const opening = entries.filter((e) => e.kind === 'opening_balance');
  if (opening.length !== 1 || opening[0].receiptId !== booking.openingBalanceId ||
      opening[0].contractCreditCentavos !== 0 || booking.openingCreditCentavos !== 0) {
    review('Historical deposit dates must be reconciled before activating the new lifecycle.');
  }
  const receipts = entries.filter((e) => e.kind !== 'opening_balance');
  const ids = new Set(), itemTotals = new Map(booking.items.map((i) => [i.itemId, 0]));
  for (const e of receipts) {
    documentId(e.receiptId);
    if (e.kind !== 'receipt' || ids.has(e.receiptId) || e.bookingTermsVersion !== booking.termsVersion) {
      review('Adjusted or changed-term ledger history needs office reconciliation.');
    }
    ids.add(e.receiptId); centavos(e.contractCreditCentavos); timestamp(e.receivedAt);
    if (e.receivedAt < terms.reservedAt || e.receivedAt > at || !Array.isArray(e.allocations)) review('Verified receipt dates or allocations need review.');
    const allocated = new Set();
    for (const a of e.allocations) {
      if (!a || typeof a !== 'object' || Array.isArray(a)) review('Receipt allocation format needs reconciliation.');
      documentId(a.itemId);
      centavos(a.centavos, { positive:true });
      if (!itemTotals.has(a.itemId) || allocated.has(a.itemId)) review('Receipt item allocation needs reconciliation.');
      allocated.add(a.itemId); itemTotals.set(a.itemId, addCentavos(itemTotals.get(a.itemId), a.centavos));
    }
    if (addCentavos(...e.allocations.map((a) => a.centavos)) !== e.contractCreditCentavos) review('Receipt credit and allocations disagree.');
  }
  if (addCentavos(...receipts.map((e) => e.contractCreditCentavos)) !== booking.netCreditCentavos ||
      booking.items.some((i) => itemTotals.get(i.itemId) !== i.creditCentavos)) review('The ledger and contract totals disagree.');

  receipts.sort((a, b) => a.receivedAt - b.receivedAt || a.receiptId.localeCompare(b.receiptId));
  let cumulative = 0, completion = null, settlement = null;
  for (const e of receipts) {
    cumulative = addCentavos(cumulative, e.contractCreditCentavos);
    if (!completion && cumulative >= required) completion = e;
    if (!settlement && cumulative === booking.totalCentavos) settlement = e;
  }
  const deadlineDate = reservationDeadline(terms.reservedAt);
  const firstInstallmentDate = terms.plan === 'installment' && completion ? installmentDueDate(completion.receivedAt, 1) : null;
  // Dates are confirmed policy; amounts/allocation/penalties are explicitly not approved.
  const calendar = firstInstallmentDate ? Array.from({ length:terms.termMonths }, (_, i) => ({
    sequence:i + 1, dueDate:installmentDueDate(completion.receivedAt, i + 1), amountCentavos:null
  })) : [];
  const fulfilled = terms.plan === 'spot_cash' ? settlement : completion;
  return { schemaVersion:7, state:settlement ? 'principal_settled' : completion ? 'deposit_funded' : cumulative ? 'partial_deposit' : 'awaiting_deposit',
    plan:terms.plan, reservedDate:manilaDate(terms.reservedAt), deadlineDate,
    depositRequiredCentavos:required, depositCreditCentavos:Math.min(cumulative, required),
    depositRemainingCentavos:Math.max(0, required - cumulative), depositCompletedAt:completion?.receivedAt ?? null,
    depositCompletionReceiptId:completion?.receiptId ?? null, firstInstallmentDate, calendar,
    principalSettledAt:settlement?.receivedAt ?? null, deadlineSatisfied:!!fulfilled,
    fulfilledAfterDeadline:!!fulfilled && manilaDate(fulfilled.receivedAt) > deadlineDate,
    scheduleStatus:terms.plan === 'spot_cash' ? 'not_applicable' : 'awaiting_accountant',
    penaltyStatus:'awaiting_accountant', bookingStatus:booking.status, basisVersion:booking.version, termsVersion:booking.termsVersion };
}

function presentLifecycle(model, at) {
  if (!model || model.state === 'needs_reconciliation') return model;
  const today = manilaDate(at);
  const closed = ['cancelled', 'released'].includes(model.bookingStatus);
  return { ...model, asOfDate:today, reviewRequired:!closed && today > model.deadlineDate && !model.deadlineSatisfied,
    holdMessage:closed ? 'This contract is closed. Contact the office for its inventory and accounting status.' :
      'The deadline never releases a plot automatically. Contact the office to confirm its current hold or ownership status.' };
}

async function readLifecycle(tx, db, booking, bookingId, at, extraReceipt = null) {
  if (booking.lifecycleEnabled !== true) return null;
  try {
    const result = await tx.get(db.collection('ledgerEntries').where('bookingId', '==', bookingId).limit(MAX_ENTRIES + 1));
    const entries = result.docs.map((d) => d.data());
    if (extraReceipt) entries.push({ ...extraReceipt, kind:'receipt' });
    return presentLifecycle(deriveLifecycle(booking, entries, at), at);
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e;
    // Retain real financial credit even if lifecycle provenance needs a separate reconciliation.
    return { schemaVersion:7, state:'needs_reconciliation', reviewRequired:true, basisVersion:booking.version,
      message:'The office must reconcile reservation dates and historical credits before confirming a schedule.',
      reason:e.code, calendar:[], firstInstallmentDate:null, deadlineDate:null };
  }
}

module.exports = { deriveLifecycle, presentLifecycle, readLifecycle, MAX_ENTRIES };
