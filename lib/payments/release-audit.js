'use strict';

const { validateSnapshot, digest } = require('./rehearsal-snapshot');
const { checkBooking } = require('./canonical');
const { centavos, addCentavos } = require('./money');
const { requireCondition } = require('./errors');

const RELEASE_GATES = [
  'deployed_rules_and_indexes', 'emulator_authorization_and_contention', 'legacy_writer_cutover',
  'historical_economic_identity_reconciliation', 'approved_financial_policies_and_quotes',
  'provider_test_live_and_raw_webhook', 'owner_contact_and_private_evidence',
  'email_capacity_and_uncertain_delivery', 'native_backup_and_isolated_restore',
  'rollback_preserves_new_payments', 'production_change_approval'
];

function auditRelease(input) {
  const snapshot = validateSnapshot(input), records = new Map(snapshot.documents.map((r) => [r.path,r.data]));
  const findings = [], bookings = snapshot.documents.filter((r) => /^bookings\/[^/]+$/.test(r.path));
  const issue = (path,code) => findings.push({path,code});
  for (const {path,data:b} of bookings) {
    const id = path.split('/')[1];
    try {
      const source = records.get(`${b.sourceKind === 'customer' ? 'customers' : 'presaleApplications'}/${b.sourceId}`);
      requireCondition(source?.canonicalBookingId === id, 'SOURCE_MAPPING', 'Source mapping differs.');
      checkBooking(b,b.sourceKind,b.sourceId,source);
      const ledger = snapshot.documents.filter((r) => /^ledgerEntries\/[^/]+$/.test(r.path) && r.data.bookingId === id).map((r) => r.data);
      requireCondition(ledger.length > 0 && ledger.length <= 500, 'LEDGER_COVERAGE', 'Missing or oversized ledger.');
      let credit = 0n, unapplied = 0n;
      const itemCredits = new Map(b.items.map((item) => [item.itemId,0n])), identities = new Set();
      for (const e of ledger) {
        requireCondition(['receipt','opening_balance','reversal','adjustment'].includes(e.kind) && Number.isSafeInteger(e.contractCreditCentavos), 'LEDGER_INVALID', 'Invalid ledger row.');
        requireCondition(!identities.has(e.receiptId), 'DUPLICATE_LEDGER_IDENTITY', 'Repeated ledger identity.');identities.add(e.receiptId);
        const allocations = e.allocations || (e.kind === 'opening_balance' && e.contractCreditCentavos === 0 ? [] : null);
        requireCondition(Array.isArray(allocations), 'ITEM_ALLOCATION_REVIEW', 'Historical item allocations require review.');
        let allocated = 0n;const allocatedItems = new Set();
        for (const a of allocations) {
          requireCondition(itemCredits.has(a.itemId) && !allocatedItems.has(a.itemId) && Number.isSafeInteger(a.centavos), 'ITEM_ALLOCATION_REVIEW', 'Invalid item allocation.');
          if (['receipt','opening_balance'].includes(e.kind)) centavos(a.centavos);
          allocatedItems.add(a.itemId);allocated += BigInt(a.centavos);itemCredits.set(a.itemId,itemCredits.get(a.itemId)+BigInt(a.centavos));
        }
        requireCondition(allocated === BigInt(e.contractCreditCentavos), 'ITEM_ALLOCATION_REVIEW', 'Allocation sum differs.');
        credit += BigInt(e.contractCreditCentavos);
        if (e.kind === 'receipt') {
          const r = records.get(`receipts/${e.receiptId}`);
          const {actor,...receiptFields} = r || {};
          const {kind,...ledgerFields} = e;
          requireCondition(r && digest(receiptFields) === digest(ledgerFields), 'RECEIPT_LEDGER_MISMATCH', 'Receipt snapshot differs.');
          centavos(r.unappliedCentavos);unapplied += BigInt(r.unappliedCentavos);
          requireCondition(addCentavos(r.contractCreditCentavos,r.unappliedCentavos,r.buyerFeeCentavos || 0) === r.receivedCentavos, 'GROSS_MISMATCH', 'Receipt gross differs.');
          const key = records.get(`economicPayments/${r.economicId}`);
          requireCondition(key?.receiptId === r.receiptId && key.state === 'posted', 'ECONOMIC_IDENTITY_MISSING', 'Receipt lacks a permanent money identity.');
        }
        if (['reversal','adjustment'].includes(e.kind)) issue(path,'ADJUSTMENT_REQUIRES_REVIEW');
      }
      requireCondition(credit === BigInt(b.netCreditCentavos), 'CREDIT_MISMATCH', 'Booking and ledger credit differ.');
      requireCondition(unapplied === BigInt(b.unappliedCentavos), 'UNAPPLIED_REVIEW', 'Unapplied liability requires reconciliation.');
      const opening = records.get(`ledgerEntries/${b.openingBalanceId}`);
      requireCondition(opening?.kind === 'opening_balance' && opening.bookingId === id && opening.contractCreditCentavos === b.openingCreditCentavos,
        'OPENING_MISMATCH', 'Opening provenance differs.');
      for (const item of b.items) {
        requireCondition(itemCredits.get(item.itemId) === BigInt(item.creditCentavos), 'ITEM_CREDIT_MISMATCH', 'Item projection differs from its ledger.');
        const plot = records.get(`plots/${item.plotId}`);
        requireCondition(plot?.paymentBookingId === id && plot.paymentOwnershipVersion === item.ownershipVersion && !['available','released'].includes(plot.status), 'PLOT_BINDING', 'Plot lock differs.');
      }
    } catch (e) { issue(path,e.code || 'CANONICAL_REVIEW'); }
  }
  for (const {path,data} of snapshot.documents) {
    if (/^(receipts|ledgerEntries)\/[^/]+$/.test(path) && path.split('/')[1] !== data.receiptId) issue(path,'RECEIPT_PATH_MISMATCH');
    if (/^(customers|presaleApplications)\/[^/]+$/.test(path) && data.canonicalBookingId && !records.has(`bookings/${data.canonicalBookingId}`)) issue(path,'MISSING_BOOKING');
    if (/^receipts\/[^/]+$/.test(path) && !records.has(`ledgerEntries/${data.receiptId}`)) issue(path,'ORPHAN_RECEIPT');
    if (/^ledgerEntries\/[^/]+$/.test(path) && !records.has(`bookings/${data.bookingId}`)) issue(path,'ORPHAN_LEDGER');
    if (/^economicPayments\/[^/]+$/.test(path) && data.state === 'posted' && !records.has(`receipts/${data.receiptId}`)) issue(path,'ORPHAN_ECONOMIC_IDENTITY');
    if (/^economicPayments\/[^/]+$/.test(path) && data.state === 'held') issue(path,'HELD_ECONOMIC_MONEY');
    if (/^providerEvents\/[^/]+$/.test(path) && data.state === 'needs_reconciliation') issue(path,'UNMATCHED_PROVIDER_EVIDENCE');
    if (/^emailOutbox\/[^/]+$/.test(path) && ['sending','uncertain'].includes(data.state)) issue(path,'EMAIL_INVESTIGATION');
    if (/^paymentIntents\/[^/]+$/.test(path) && ['creating','creation_uncertain','needs_reconciliation'].includes(data.state)) issue(path,'PROVIDER_INVESTIGATION');
    if (/^paymentReconciliations\/[^/]+$/.test(path) && !['resolved','closed_no_funds'].includes(data.state)) issue(path,'HELD_MONEY_REVIEW');
  }
  if (!bookings.length) issue('bookings','NO_CANONICAL_SAMPLE');
  return {format:'payment-release-audit-v1',snapshotHash:digest(snapshot),checkedBookings:bookings.length,
    localDataChecksPassed:findings.length === 0,readyForProduction:false,findings,
    gates:RELEASE_GATES.map((id) => ({id,status:'unverified'})),
    notice:'Offline data checks cannot certify deployed rules, complete export coverage, provider integration or release approval.'};
}

module.exports = { RELEASE_GATES, auditRelease };
