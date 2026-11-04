'use strict';
const { fixture } = require('./submission-fixture');
const { createReviewService } = require('../../lib/payments/review');
const { ownerBinding } = require('../../lib/payments/canonical');
const { scopeKey } = require('../../lib/payments/submission');

function reviewFixture() {
  const f=fixture();
  for(const [uid,role] of [['admin','admin'],['admin2','superadmin'],['staff','staff'],['buyer','customer']]) f.db.put(`users/${uid}`,{role});
  for(const [kind,id] of [['customer','c1'],['presale','PS-0001']]) {
    const sourcePath=`${kind==='customer'?'customers':'presaleApplications'}/${id}`;
    const source=f.db.read(sourcePath);const bookingId=`booking-${id}`;const key=scopeKey(kind,id);
    f.db.put(sourcePath,{...source,canonicalBookingId:bookingId});
    const scope=f.db.read(`paymentSubmissionScopes/${key}`);
    f.db.put(`paymentSubmissionScopes/${key}`,{...scope,bookingId});
    const items=[{itemId:'item1',plotId:`${id}_plot1`,ownershipVersion:1,totalCentavos:1000000,creditCentavos:0},
      {itemId:'item2',plotId:`${id}_plot2`,ownershipVersion:1,totalCentavos:1500000,creditCentavos:0}];
    const openingBalanceId=`OPEN-${id}`;
    f.db.put(`bookings/${bookingId}`,{schemaVersion:4,sourceKind:kind,sourceId:id,ownerBinding:ownerBinding(kind,source),
      migrationStatus:'reconciled',legacyWritesBlocked:true,postingEnabled:true,policyStatus:'approved',status:'active',currency:'PHP',
      version:1,termsVersion:1,totalCentavos:2500000,netCreditCentavos:0,balanceCentavos:2500000,unappliedCentavos:0,items,
      openingBalanceId,openingCreditCentavos:0,planLabel:'Installment plan',monthlyCentavos:null,deadlineDate:'2027-01-31',nextDueDate:null});
    f.db.put(`ledgerEntries/${openingBalanceId}`,{bookingId,receiptId:openingBalanceId,recordedAt:f.time-100000,receivedDate:'2026-10-30',kind:'opening_balance',contractCreditCentavos:0});
    for(const item of items) f.db.put(`plots/${item.plotId}`,{status:'reserved',paymentBookingId:bookingId,paymentOwnershipVersion:1});
  }
  const review=createReviewService({db:f.db,auth:f.auth,now:()=>f.time});
  const submit=async(overrides={})=>f.core.submit(f.account,await f.command(overrides));
  const decision=(saved,overrides={})=>({paymentId:saved.paymentId,requestId:'review-request-0001',expectedVersion:saved.version,revisionId:saved.revisionId,
    action:'approve',reason:'Statement checked against current proof',buyerNote:'Payment verified by the office.',fundsConfirmed:true,
    receivedCentavos:500000,receivedAt:f.time-3600000,verifiedReference:'BANK-001',expectedBookingVersion:1,
    allocations:[{itemId:'item1',centavos:500000}],unappliedCentavos:0,...overrides});
  const note=(saved,action='request_correction',overrides={})=>({paymentId:saved.paymentId,requestId:'review-note-000001',expectedVersion:saved.version,
    revisionId:saved.revisionId,action,reason:'Internal investigation detail',buyerNote:'Please upload a clearer receipt.',...overrides});
  return {...f,review,submit,decision,note};
}
module.exports={reviewFixture};
