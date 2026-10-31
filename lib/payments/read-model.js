'use strict';

const { createHash } = require('node:crypto');
const { pesosToCentavos } = require('./money');
const { manilaDate, parseDate } = require('./calendar');
const { requireCondition } = require('./errors');

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 120) => typeof value === 'string' ? value.slice(0, max) : '';

function amount(value) {
  try {
    if (value === null || value === undefined || value === '') return null;
    const negative = String(value).startsWith('-');
    return pesosToCentavos(negative ? String(value).slice(1) : value) * (negative ? -1 : 1);
  } catch (_) { return null; }
}

function calendarDate(value) {
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      parseDate(value);
      return value;
    }
    const ms = typeof value === 'number' ? value : value && typeof value.toMillis === 'function' ? value.toMillis() : NaN;
    return manilaDate(ms);
  } catch (_) { return null; }
}

// Read-only compatibility view. Never fabricate a payment from a legacy status flag,
// merge records by email, recompute accepted schedules, or expose private admin notes.
function legacySummary(kind, id, data, cursor = null) {
  const presale = kind === 'presale';
  const plan = presale ? data : data.plan || {};
  const original = Array.isArray(data.payments) ? data.payments : [];
  const entries = original.map((payment, index) => ({
    id: String(index), date: calendarDate(payment.date), amountCentavos: amount(payment.amount),
    reference: text(payment.receiptNo || payment.ref || payment.referenceNumber),
    method: text(payment.method || (presale ? data.method : ''), 40),
    reversal: !!payment.reversalOf || Number(payment.amount) < 0
  }));
  const warnings = [];
  const total = amount(presale ? data.totalPrice : plan.totalPrice ?? plan.price);
  let paid = entries.reduce((sum, entry) => sum + (entry.amountCentavos || 0), 0);
  if (!Number.isSafeInteger(paid) || entries.some((entry) => entry.amountCentavos === null)) {
    paid = null;
    warnings.push('Some recorded amounts need an office review.');
  }
  if (presale && Number(data.reservationFeePaid) > 0) {
    warnings.push('An online reservation deposit needs reconciliation with the payment history. Ask the office to confirm your balance before paying again.');
  }
  if (presale && data.status === 'paid' && entries.length === 0) {
    warnings.push('This older record is marked paid but has no itemized payments. The office needs to confirm the balance.');
  }
  if (total === null || total < 0) warnings.push('The contract total needs confirmation from the office.');
  const balance = total !== null && paid !== null ? total - paid : null;
  if (balance !== null && balance < 0) warnings.push('Recorded payments exceed the contract total. The office needs to reconcile the credit.');
  const version = digest(entries);
  let offset = 0;
  if (cursor !== null) {
    requireCondition(typeof cursor === 'string' && cursor.length <= 256, 'INVALID_CURSOR', 'History cursor is invalid.');
    let parsed;
    try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch (_) { /* validate below */ }
    requireCondition(parsed && parsed.id === `${kind}:${id}` && Number.isInteger(parsed.offset) &&
      parsed.offset >= 0 && parsed.offset <= entries.length, 'INVALID_CURSOR', 'History cursor is invalid.');
    requireCondition(parsed.version === version, 'HISTORY_CHANGED', 'Payments changed. Refresh to see the latest history.', 409);
    offset = parsed.offset;
  }
  const ordered = entries.slice().reverse();
  const page = ordered.slice(offset, offset + 20);
  const nextCursor = offset + 20 < ordered.length ? Buffer.from(JSON.stringify({
    id: `${kind}:${id}`, offset: offset + 20, version
  })).toString('base64url') : null;
  const plots = presale ? (Array.isArray(data.plots) ? data.plots : [{ plotCode: data.plotCode }])
    .map((plot) => text(plot.plotCode, 40)).filter(Boolean).slice(0, 100)
    : [text(data.blockId && data.lotNo ? `${data.blockId}-${data.lotNo}` : plan.tierName)].filter(Boolean);
  return {
    id, kind, name: text(presale ? data.name : data.fullName || [data.firstName, data.lastName].filter(Boolean).join(' ')),
    label: presale ? id : text(plan.tierName) || 'Plot account', plots,
    planLabel: (presale ? data.plan === 'cash' : plan.termKey === 'cash') ? 'Spot cash' : 'Installment plan',
    cancelled: presale && data.status === 'cancelled', totalCentavos: total, paidCentavos: paid,
    balanceCentavos: warnings.length ? null : balance,
    monthlyCentavos: amount(presale ? data.monthly : plan.monthlyAmount),
    deadlineDate: calendarDate(data.firstPaymentDeadlineDate),
    nextDueDate: calendarDate(data.nextInstallmentDueDate),
    pendingCount: (Array.isArray(data.paymentSubmissions) ? data.paymentSubmissions : [])
      .filter((entry) => ['pending', 'pending_verification', 'resubmit_requested'].includes(entry.status || 'pending')).length,
    warnings, entries: page, nextCursor
  };
}

module.exports = { legacySummary, digest };
