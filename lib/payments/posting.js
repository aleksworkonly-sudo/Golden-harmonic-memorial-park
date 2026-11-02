'use strict';
const {documentId}=require('./auth');
const {requireCondition}=require('./errors');
const {addCentavos}=require('./money');
const {manilaDate}=require('./calendar');
const {manualEconomicId,cashEconomicId,receiptIdFor}=require('./identities');
const {ownerBinding,checkBooking}=require('./canonical');
const {readLifecycle}=require('./lifecycle-model');
// Shared canonical checks, after channel-specific evidence validation.
async function preparePosting({tx,db,p,scope,cmd,received,at,allowActualAmount=true}) {
  const doc=(col,id)=>db.collection(col).doc(id);
  const source=async(tx,p)=>{
    requireCondition(['customer','presale'].includes(p.sourceKind),'INTEGRITY_ERROR','Source needs review.',409);
    const row=await tx.get(doc(p.sourceKind==='customer'?'customers':'presaleApplications',documentId(p.sourceId)));
    return row.exists?row.data():null;
  };
  const buyer=await source(tx,p);
  if(p.schemaVersion===3) {
    requireCondition(!scope.gatewayActiveId,'GATEWAY_REVIEW','Recover or expire the open PayMongo checkout before posting a separate transfer.',409);
    requireCondition(!scope.gatewayHistory || cmd.gatewayReviewed===true,'GATEWAY_REVIEW','Review provider history and confirm this transfer is distinct before posting.',409);
  }
  requireCondition(buyer && p.bookingId && buyer.canonicalBookingId===p.bookingId && scope.bookingId===p.bookingId &&
    scope.enabled===true && scope.version===p.scopeVersion &&
    p.ownerBinding===ownerBinding(p.sourceKind,buyer) && !['cancelled','released'].includes(buyer.status),
  'BOOKING_REVIEW','The source mapping or ownership changed; reconcile before posting.',409);
  const bookingId=documentId(p.bookingId);const snap=await tx.get(doc('bookings',bookingId));const booking=snap.exists?snap.data():null;
  checkBooking(booking,p.sourceKind,p.sourceId,buyer);
  requireCondition(booking.postingEnabled===true && booking.policyStatus==='approved' && booking.status==='active' &&
    booking.version===cmd.expectedBookingVersion && booking.termsVersion===p.bookingTermsVersion,
  'STALE_BOOKING','The contract or policy changed; reload and reconcile before posting.',409);
  requireCondition(allowActualAmount || (cmd.receivedCentavos===p.quote.expectedAmountCentavos && cmd.receivedCentavos<=booking.balanceCentavos),
    'AMOUNT_REQUIRES_REVIEW','This amount requires reconciliation until the business allocation policy is confirmed.',409);
  const opening=await tx.get(doc('ledgerEntries',documentId(booking.openingBalanceId)));
  requireCondition(opening.exists && opening.data().bookingId===bookingId && opening.data().kind==='opening_balance' &&
    opening.data().contractCreditCentavos===booking.openingCreditCentavos,'BOOKING_REVIEW','Opening credit provenance needs reconciliation.',409);
  const account=await tx.get(doc('paymentReceivingAccounts',documentId(p.quote.receivingAccountId)));
  requireCondition(account.exists && account.data().enabled===true && account.data().version===p.quote.receivingAccountVersion &&
    account.data().channel===p.quote.channel,'RECIPIENT_REVIEW','Receiving instructions changed; use reconciliation before posting.',409);
  const locks=await Promise.all(booking.items.map((item)=>tx.get(doc('plots',item.plotId))));
  requireCondition(locks.every((lock,i)=>lock.exists && lock.data().paymentBookingId===bookingId &&
    lock.data().paymentOwnershipVersion===booking.items[i].ownershipVersion && !['available','released'].includes(lock.data().status)),
  'OWNERSHIP_CHANGED','Plot ownership changed; keep the funds in reconciliation.',409);
  const credit=addCentavos(...cmd.allocations.map((a)=>a.centavos));const unapplied=cmd.unappliedCentavos;
  requireCondition(credit===Math.min(cmd.receivedCentavos,booking.balanceCentavos) && unapplied===cmd.receivedCentavos-credit &&
    addCentavos(credit,unapplied)===cmd.receivedCentavos,'INVALID_ALLOCATION','Allocate the principal credit exactly and retain all excess as unapplied money.');
  const byId=new Map(booking.items.map((item)=>[item.itemId,item]));
  for(const allocation of cmd.allocations) {
    const item=byId.get(allocation.itemId);
    requireCondition(item && allocation.centavos<=item.totalCentavos-item.creditCentavos,'INVALID_ALLOCATION','An item allocation exceeds its balance or belongs to another contract.');
  }
  const amounts=new Map(cmd.allocations.map((item)=>[item.itemId,item.centavos]));
  const items=booking.items.map((item)=>({...item,creditCentavos:addCentavos(item.creditCentavos,amounts.get(item.itemId)||0)}));
  const receiptId=p.schemaVersion===5 ? p.cashReceiptId : receiptIdFor(p.paymentId);
  const receipt={schemaVersion:4,receiptId,paymentId:p.paymentId,bookingId,submissionScope:p.submissionScope,currency:'PHP',
    ...received,receivedDate:manilaDate(cmd.receivedAt),recordedAt:at,balanceAfterCentavos:booking.balanceCentavos-credit,
    contractCreditCentavos:credit,unappliedCentavos:unapplied,allocations:cmd.allocations,channel:p.quote.channel,
    purpose:p.quote.purpose,proofId:p.proofId,revisionId:p.revisionId,economicId:p.schemaVersion===5 ? cashEconomicId(p.quote.receivingAccountId,cmd.verifiedReference) : manualEconomicId(p.quote.receivingAccountId,cmd.verifiedReference),
    bookingTermsVersion:booking.termsVersion};
  const lifecycle=await readLifecycle(tx,db,{...booking,items,version:booking.version+1,
    netCreditCentavos:addCentavos(booking.netCreditCentavos,credit)},bookingId,at,receipt);
  return {bookingId,booking,receipt,items,credit,unapplied,lifecycle};
}

function writePosting(tx,db,posting,actor) {
  const doc=(col,id)=>db.collection(col).doc(id);
  const {bookingId,booking,receipt,items,credit,unapplied,lifecycle}=posting;
  tx.create(doc('receipts',receipt.receiptId),{...receipt,actor});
  tx.create(doc('ledgerEntries',receipt.receiptId),{...receipt,kind:'receipt',contractCreditCentavos:credit});
  tx.update(doc('bookings',bookingId),{netCreditCentavos:addCentavos(booking.netCreditCentavos,credit),balanceCentavos:receipt.balanceAfterCentavos,
    unappliedCentavos:addCentavos(booking.unappliedCentavos,unapplied),items,version:booking.version+1,
    lifecycleReviewRequired:lifecycle ? lifecycle.reviewRequired : true,...(lifecycle?{lifecycle}:{})});
  tx.create(doc('emailOutbox',receipt.receiptId),{type:'payment_verified',receiptId:receipt.receiptId,bookingId,createdAt:receipt.recordedAt,state:'awaiting_configuration'});
}
module.exports={preparePosting,writePosting};
