'use strict';
const { requireCondition } = require('./errors');
const { documentId } = require('./auth');
const { centavos, addCentavos } = require('./money');
const { legacySummary } = require('./read-model');

function ownerBinding(kind, source) {
  return kind === 'customer' ? `uid:${source.authUid || ''}` : `reservation:${source.accessVersion || 0}`;
}
function checkBooking(booking, kind, sourceId, source) {
  requireCondition(booking && booking.schemaVersion === 4 && booking.sourceKind === kind && booking.sourceId === sourceId &&
    booking.ownerBinding === ownerBinding(kind, source) && booking.migrationStatus === 'reconciled' &&
    booking.legacyWritesBlocked === true && booking.currency === 'PHP', 'BOOKING_REVIEW', 'This account needs migration or ownership review.', 409);
  centavos(booking.totalCentavos,{positive:true}); centavos(booking.netCreditCentavos); centavos(booking.unappliedCentavos);
  requireCondition(booking.netCreditCentavos <= booking.totalCentavos && booking.balanceCentavos === booking.totalCentavos - booking.netCreditCentavos &&
    Number.isSafeInteger(booking.version) && booking.version > 0 && Number.isSafeInteger(booking.termsVersion) && booking.termsVersion > 0,
  'BOOKING_REVIEW', 'The account totals need reconciliation.', 409);
  requireCondition(Array.isArray(booking.items) && booking.items.length > 0 && booking.items.length <= 100,
    'BOOKING_REVIEW', 'The contract items need review.', 409);
  const ids = new Set(), plots = new Set();
  for (const item of booking.items) {
    documentId(item.itemId); documentId(item.plotId);
    centavos(item.totalCentavos,{positive:true});centavos(item.creditCentavos);
    requireCondition(!ids.has(item.itemId) && !plots.has(item.plotId) && item.creditCentavos <= item.totalCentavos &&
      Number.isSafeInteger(item.ownershipVersion) && item.ownershipVersion > 0,
    'BOOKING_REVIEW', 'The contract item allocation needs review.', 409);
    ids.add(item.itemId);plots.add(item.plotId);
  }
  requireCondition(addCentavos(...booking.items.map((item)=>item.totalCentavos)) === booking.totalCentavos &&
    addCentavos(...booking.items.map((item)=>item.creditCentavos)) === booking.netCreditCentavos,
  'BOOKING_REVIEW', 'The item and contract totals disagree.', 409);
}

async function sourceSummary(tx, db, kind, id, source, cursor = null) {
  if (!source.canonicalBookingId) return legacySummary(kind,id,source,cursor);
  const bookingId = documentId(source.canonicalBookingId);
  const snap = await tx.get(db.collection('bookings').doc(bookingId));
  const booking = snap.exists ? snap.data() : null;
  checkBooking(booking,kind,id,source);
  let query = db.collection('ledgerEntries').where('bookingId','==',bookingId).orderBy('recordedAt','desc').orderBy('receiptId','desc');
  if (cursor !== null) {
    requireCondition(typeof cursor === 'string' && cursor.length < 700,'INVALID_CURSOR','Reload payment history.');
    let value;try {value=JSON.parse(Buffer.from(cursor,'base64url').toString());} catch (_) { /* checked below */ }
    requireCondition(value?.bookingId === bookingId && value.version === booking.version && Number.isSafeInteger(value.at) &&
      typeof value.id === 'string','INVALID_CURSOR','Your history changed. Refresh it before loading more.',409);
    documentId(value.id);query=query.startAfter(value.at,value.id);
  }
  const docs=(await tx.get(query.limit(21))).docs;
  const page=docs.slice(0,20).map((doc)=>doc.data());
  const entries=page.map((entry)=>{
    requireCondition(Number.isSafeInteger(entry.contractCreditCentavos) && ['receipt','opening_balance','reversal','adjustment'].includes(entry.kind),
      'BOOKING_REVIEW','A ledger entry needs office review.',409);
    return {id:entry.receiptId,date:entry.receivedDate || null,amountCentavos:entry.contractCreditCentavos,
      reference:entry.kind === 'opening_balance' ? 'Reconciled opening balance' : entry.receiptId,
      method:entry.kind === 'opening_balance' ? 'Historical credit (not a new receipt)' : entry.channel || entry.kind,
      reversal:entry.contractCreditCentavos < 0,receivedCentavos:entry.receivedCentavos || 0,unappliedCentavos:entry.unappliedCentavos || 0};
  });
  const last=page.at(-1);
  const base=legacySummary(kind,id,{...source,payments:[],reservationFeePaid:0,status:'active'},null);
  return {...base,canonical:true,bookingId,totalCentavos:booking.totalCentavos,paidCentavos:booking.netCreditCentavos,
    balanceCentavos:booking.balanceCentavos,unappliedCentavos:booking.unappliedCentavos,entries,
    planLabel:booking.planLabel || 'Office-approved contract',monthlyCentavos:booking.monthlyCentavos ?? null,
    deadlineDate:booking.deadlineDate || null,nextDueDate:booking.nextDueDate || null,
    cancelled:['cancelled','released'].includes(booking.status),
    warnings:booking.lifecycleReviewRequired ? ['Payment credit is recorded. The office must review deposit, schedule or settlement updates separately.'] : [],
    nextCursor:docs.length > 20 ? Buffer.from(JSON.stringify({bookingId,version:booking.version,at:last.recordedAt,id:last.receiptId})).toString('base64url') : null};
}
module.exports = { ownerBinding, checkBooking, sourceSummary };
