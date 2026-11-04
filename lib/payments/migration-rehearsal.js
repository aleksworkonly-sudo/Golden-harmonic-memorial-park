'use strict';

const { requireCondition, PaymentError } = require('./errors');
const { centavos, pesosToCentavos, addCentavos } = require('./money');
const { parseDate, manilaDate } = require('./calendar');
const { documentId } = require('./auth');
const { digest, validateSnapshot } = require('./rehearsal-snapshot');

const sourceKind = (path) => path.startsWith('customers/') ? 'customer' : 'presale';
const sourcePath = (path) => /^(customers|presaleApplications)\/[^/]+$/.test(path);
const blocking = (data) => ['canonicalBookingId','paymentMigrationLock'].some((k) => Object.hasOwn(data,k));

function inspectSource(row, capturedAt) {
  const d = row.data, presale = sourceKind(row.path) === 'presale', issues = [];
  let totalCentavos = null, creditCentavos = 0;
  try { totalCentavos = pesosToCentavos(presale ? d.totalPrice : d.plan?.totalPrice ?? d.plan?.price); }
  catch (_) { issues.push('CONTRACT_TOTAL_REVIEW'); }
  if (blocking(d)) issues.push('ALREADY_MAPPED_OR_LOCKED');
  if (['cancelled','released'].includes(d.status)) issues.push('CLOSED_SOURCE_REVIEW');
  if (presale ? !Number.isSafeInteger(d.accessVersion) || d.accessVersion <= 0 : typeof d.authUid !== 'string' || !d.authUid) issues.push('OWNER_BINDING_REVIEW');
  const payments = Array.isArray(d.payments) ? d.payments : [];
  if (d.payments !== undefined && !Array.isArray(d.payments)) issues.push('PAYMENT_ARRAY_REVIEW');
  if (payments.length > 500) issues.push('HISTORY_TOO_LARGE');
  const references = new Set();
  for (const p of payments.slice(0,500)) {
    try {
      requireCondition(p && !p.reversalOf && Number(p.amount) > 0, 'HISTORICAL_REVERSAL', 'Review signed history.');
      creditCentavos = addCentavos(creditCentavos, pesosToCentavos(p.amount));
      const ref = p.ref || p.receiptNo || p.referenceNumber;
      requireCondition(typeof ref === 'string' && ref.trim(), 'REFERENCE_REVIEW', 'Review reference.');
      const reference = ref.trim();
      if (references.has(reference)) issues.push('POSSIBLE_DUPLICATE_REFERENCE');
      references.add(reference);
      if (typeof p.date === 'number') { requireCondition(p.date <= capturedAt, 'DATE_REVIEW', 'Future receipt.'); manilaDate(p.date); }
      else { parseDate(p.date); requireCondition(p.date <= manilaDate(capturedAt), 'DATE_REVIEW', 'Future receipt.'); }
    } catch (e) { issues.push(e instanceof PaymentError ? e.code : 'PAYMENT_ROW_REVIEW'); }
  }
  if (Number(d.reservationFeePaid) !== 0 && d.reservationFeePaid !== undefined ||
      d.paymongoTransactions && (!Array.isArray(d.paymongoTransactions) || d.paymongoTransactions.length)) issues.push('PROVIDER_HISTORY_RECONCILIATION');
  if (d.paymentSubmissions && (!Array.isArray(d.paymentSubmissions) || d.paymentSubmissions.some((p) => !['confirmed','rejected'].includes(p.status)))) issues.push('PENDING_EVIDENCE_RECONCILIATION');
  if (d.status === 'paid' && !payments.length) issues.push('PAID_WITHOUT_RECEIPTS');
  if (totalCentavos !== null && creditCentavos > totalCentavos) issues.push('EXCESS_OR_FEE_ALLOCATION_REVIEW');
  return {sourcePath:row.path, sourceHash:digest(d), bookingId:`MIG-${digest(row.path).slice(0,40)}`,
    totalCentavos, observedCreditCentavos:creditCentavos, paymentCount:payments.length, issues:[...new Set(issues)]};
}

function inventory(input) {
  const snapshot = validateSnapshot(input);
  return {format:'payment-migration-inventory-v1', snapshotHash:digest(snapshot), readyForProduction:false,
    sources:snapshot.documents.filter((r) => sourcePath(r.path)).map((r) => inspectSource(r,snapshot.capturedAt))};
}

// A conservative opening-balance bridge. Complex/ambiguous history stays out of the plan.
// Even a valid draft is disabled and must not be imported into a live database.
function planMigration(input, decisions) {
  const snapshot = validateSnapshot(input), report = inventory(snapshot);
  requireCondition(decisions?.schemaVersion === 1 && Array.isArray(decisions.sources) && decisions.sources.length > 0 && decisions.sources.length <= 100,
    'MIGRATION_REVIEW', 'Supply 1–100 explicit source decisions.');
  const originals = new Map(snapshot.documents.map((r) => [r.path,r.data]));
  const writes = [], used = new Set(), plots = new Set();
  for (const decision of decisions.sources) {
    const entry = report.sources.find((r) => r.sourcePath === decision.sourcePath);
    requireCondition(entry && !used.has(entry.sourcePath) && entry.sourceHash === decision.sourceHash && !entry.issues.length,
      'MIGRATION_REVIEW', 'Source changed, is duplicated, or has unresolved inventory issues.');
    requireCondition(typeof decision.reviewReference === 'string' && decision.reviewReference.trim().length >= 4 && decision.reviewReference.length <= 200,
      'MIGRATION_REVIEW', 'Record the external reconciliation review reference.');
    used.add(entry.sourcePath);
    const source = originals.get(entry.sourcePath), kind = sourceKind(entry.sourcePath), id = entry.sourcePath.split('/')[1];
    documentId(id);
    requireCondition(decision.totalCentavos === entry.totalCentavos && decision.openingCreditCentavos === entry.observedCreditCentavos,
      'MIGRATION_REVIEW', 'Reviewed totals must equal the preserved source amounts.');
    centavos(decision.totalCentavos,{positive:true}); centavos(decision.openingCreditCentavos);
    requireCondition(Array.isArray(decision.items) && decision.items.length > 0 && decision.items.length <= 100,
      'MIGRATION_REVIEW', 'Explicit plot totals and historical allocations are required.');
    const owned = snapshot.documents.filter((r) => /^plots\/[^/]+$/.test(r.path) &&
      (kind === 'customer' ? r.data.customerId === id : r.data.presaleRef === id)).map((r) => r.path.split('/')[1]).sort();
    const selected = decision.items.map((i) => i.plotId).sort();
    requireCondition(digest(owned) === digest(selected), 'MIGRATION_REVIEW', 'Include every source-owned plot; omitted plots require a separate ownership review.');
    requireCondition(source.plots === undefined || Array.isArray(source.plots), 'MIGRATION_REVIEW', 'Declared plot list needs review.');
    const declared = source.plots?.length ? source.plots : source.blockId && source.lotNo ? [{blockId:source.blockId,lotNo:source.lotNo}] : null;
    if (declared) requireCondition(digest(declared.map((p) => `${p.blockId}_${p.lotNo}`).sort()) === digest(owned),
      'MIGRATION_REVIEW', 'Declared plots and actual ownership records disagree.');
    const items = decision.items.map((item) => {
      documentId(item.plotId); centavos(item.totalCentavos,{positive:true}); centavos(item.creditCentavos);
      const plot = originals.get(`plots/${item.plotId}`);
      requireCondition(plot && !Object.hasOwn(plot,'paymentBookingId') && !Object.hasOwn(plot,'paymentOwnershipVersion') && !Object.hasOwn(plot,'paymentMigrationLock') &&
        !['available','released'].includes(plot.status) && !plots.has(item.plotId) && item.creditCentavos <= item.totalCentavos &&
        (kind === 'customer' ? plot.customerId === id && !plot.presaleRef : plot.presaleRef === id && !plot.customerId), 'MIGRATION_REVIEW', 'Plot ownership or allocation needs review.');
      plots.add(item.plotId);
      const itemId = `item-${digest(item.plotId).slice(0,24)}`;
      writes.push({path:`plots/${item.plotId}`, beforeHash:digest(plot), data:{...plot,paymentBookingId:entry.bookingId,paymentOwnershipVersion:1,paymentMigrationLock:'rehearsal_only'}});
      return {itemId,plotId:item.plotId,totalCentavos:item.totalCentavos,creditCentavos:item.creditCentavos,ownershipVersion:1};
    });
    requireCondition(addCentavos(...items.map((i) => i.totalCentavos)) === decision.totalCentavos && addCentavos(...items.map((i) => i.creditCentavos)) === decision.openingCreditCentavos,
      'MIGRATION_REVIEW', 'Item totals/credits must reconcile exactly.');
    const openingBalanceId = `OPEN-${digest(entry.sourcePath).slice(0,40)}`;
    const month = kind === 'customer' ? source.plan?.monthlyAmount : source.monthly;
    const date = (v) => { if (v == null) return null; parseDate(v); return v; };
    const booking = {schemaVersion:4,bookingId:entry.bookingId,sourceKind:kind,sourceId:id,
      ownerBinding:kind === 'customer' ? `uid:${source.authUid}` : `reservation:${source.accessVersion}`,
      currency:'PHP',version:1,termsVersion:1,status:'active',migrationStatus:'draft',legacyWritesBlocked:false,
      postingEnabled:false,policyStatus:'awaiting_review',lifecycleEnabled:false,notificationContact:{enabled:false},
      totalCentavos:decision.totalCentavos,netCreditCentavos:decision.openingCreditCentavos,
      balanceCentavos:decision.totalCentavos-decision.openingCreditCentavos,unappliedCentavos:0,
      items,openingBalanceId,openingCreditCentavos:decision.openingCreditCentavos,
      monthlyCentavos:month == null ? null : pesosToCentavos(month),deadlineDate:date(source.firstPaymentDeadlineDate),
      nextDueDate:date(source.nextInstallmentDueDate),planLabel:'Preserved legacy contract',lifecycleReviewRequired:true};
    writes.push(
      {path:`bookings/${entry.bookingId}`,beforeHash:null,data:booking},
      {path:`ledgerEntries/${openingBalanceId}`,beforeHash:null,data:{bookingId:entry.bookingId,receiptId:openingBalanceId,kind:'opening_balance',
        contractCreditCentavos:decision.openingCreditCentavos,allocations:items.filter(i=>i.creditCentavos>0).map(i=>({itemId:i.itemId,centavos:i.creditCentavos})),
        recordedAt:snapshot.capturedAt,receivedDate:manilaDate(snapshot.capturedAt)}},
      {path:`paymentMigrationSnapshots/${entry.bookingId}`,beforeHash:null,data:{sourcePath:entry.sourcePath,sourceHash:entry.sourceHash,source,reviewReference:decision.reviewReference}},
      {path:entry.sourcePath,beforeHash:entry.sourceHash,data:{...source,canonicalBookingId:entry.bookingId,paymentMigrationLock:'rehearsal_only'}}
    );
  }
  requireCondition(writes.every((w) => w.beforeHash !== null || !originals.has(w.path)), 'MIGRATION_CONFLICT', 'A planned identity already exists.');
  const body = {format:'payment-migration-plan-v1',snapshotHash:report.snapshotHash,capturedAt:snapshot.capturedAt,writes};
  return {...body,planHash:digest(body),readyForProduction:false,
    gates:['deployed_rules_and_indexes','legacy_writer_cutover','economic_identity_reconciliation','historical_receipt_import',
      'owner_and_contact_review','approved_quotes_and_policies','provider_staging','native_backup_restore','release_approval']};
}

function applyRehearsal(input, plan) {
  const snapshot = validateSnapshot(input);
  requireCondition(plan?.format === 'payment-migration-plan-v1' && plan.readyForProduction === false,
    'MIGRATION_INVALID', 'Only offline rehearsal plans are supported.');
  const body = {format:plan.format,snapshotHash:plan.snapshotHash,capturedAt:plan.capturedAt,writes:plan.writes};
  requireCondition(digest(body) === plan.planHash && digest(snapshot) === plan.snapshotHash, 'MIGRATION_CONFLICT', 'Plan or full source snapshot changed. Rebuild the review.');
  const records = new Map(snapshot.documents.map((r) => [r.path,r.data])), seen = new Set();
  for (const w of plan.writes) {
    requireCondition(!seen.has(w.path) && (records.has(w.path) ? digest(records.get(w.path)) : null) === w.beforeHash,
      'MIGRATION_CONFLICT', 'A target changed; no partial rehearsal was applied.');
    seen.add(w.path);
  }
  for (const w of plan.writes) records.set(w.path,structuredClone(w.data));
  return validateSnapshot({schemaVersion:1,capturedAt:snapshot.capturedAt,documents:[...records].map(([path,data]) => ({path,data}))});
}

module.exports = { inventory, planMigration, applyRehearsal };
