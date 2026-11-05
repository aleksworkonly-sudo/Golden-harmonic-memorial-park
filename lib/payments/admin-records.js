'use strict';
const {authenticate,requireAdmin,documentId}=require('./auth');
const {checkBooking}=require('./canonical');
const {requireCondition}=require('./errors');
const {readLifecycle}=require('./lifecycle-model');

// Read the existing verified ledger, including approvals made before this view existed.
// Never copy it back into legacy payments[] or create another receipt.
async function adminRecord({db,auth,token,kind,id,now=Date.now()}) {
  requireCondition(['customer','presale'].includes(kind),'INVALID_SOURCE','Choose a customer or reservation.');
  documentId(id);
  const identity=await authenticate(auth,token);
  return db.runTransaction(async tx=>{
    await requireAdmin(tx,db,identity);
    const row=await tx.get(db.collection(kind==='customer'?'customers':'presaleApplications').doc(id));
    requireCondition(row.exists,'NOT_FOUND','Record not found.',404);
    const source=row.data();
    requireCondition(source.canonicalBookingId,'BOOKING_REVIEW','No verified booking is linked to this record.',409);
    const bookingId=documentId(source.canonicalBookingId);
    const snap=await tx.get(db.collection('bookings').doc(bookingId));
    const booking=snap.exists?snap.data():null;
    checkBooking(booking,kind,id,source);
    const ledger=await tx.get(db.collection('ledgerEntries').where('bookingId','==',bookingId).limit(501));
    requireCondition(ledger.docs.length<=500,'REPORT_TOO_LARGE','This account needs a paginated ledger export. No partial report was generated.',409);
    const entries=ledger.docs.map(d=>d.data());
    requireCondition(entries.every(e=>Number.isSafeInteger(e.contractCreditCentavos)) &&
      entries.reduce((n,e)=>n+e.contractCreditCentavos,0)===booking.netCreditCentavos,
    'BOOKING_REVIEW','Ledger totals need reconciliation before exporting this account.',409);
    const payments=entries.filter(e=>e.kind!=='opening_balance').map(e=>({
      receiptId:e.receiptId,ref:e.verifiedReference || e.receiptId,
      date:e.receivedAt || e.recordedAt,amount:e.contractCreditCentavos/100,
      receivedAmount:(e.receivedCentavos ?? e.contractCreditCentavos)/100,
      unappliedAmount:(e.unappliedCentavos || 0)/100,method:e.channel || e.kind,
      remarks:e.kind==='receipt'?'Verified payment':e.kind,kind:e.kind,canonical:true
    }));
    // Historical opening credit is not another cash receipt. Preserve its original
    // dated rows only when they reconcile exactly to the audited opening amount.
    if(booking.openingCreditCentavos){
      const legacy=Array.isArray(source.payments)?source.payments:[];
      if(legacy.reduce((n,p)=>n+Math.round(Number(p.amount || 0)*100),0)===booking.openingCreditCentavos)
        payments.push(...legacy);
      else payments.push({date:entries.find(e=>e.kind==='opening_balance')?.recordedAt,
        ref:booking.openingBalanceId,amount:booking.openingCreditCentavos/100,
        method:'Opening balance',remarks:'Historical credit; not a new receipt',reportable:false});
    }
    payments.sort((a,b)=>Number(a.date)-Number(b.date) || String(a.ref).localeCompare(String(b.ref)));
    const lifecycle=await readLifecycle(tx,db,booking,bookingId,now);
    return {bookingId,version:booking.version,total:booking.totalCentavos/100,paid:booking.netCreditCentavos/100,
      balance:booking.balanceCentavos/100,unapplied:booking.unappliedCentavos/100,payments,
      monthly:lifecycle?.monthlyCentavos!=null?lifecycle.monthlyCentavos/100:null,
      installmentPrincipal:lifecycle?.installmentPrincipalCentavos!=null?lifecycle.installmentPrincipalCentavos/100:null,
      depositRequired:lifecycle?.depositRequiredCentavos!=null?lifecycle.depositRequiredCentavos/100:null,
      depositPaid:lifecycle?.depositCreditCentavos!=null?lifecycle.depositCreditCentavos/100:null,
      firstInstallmentDate:lifecycle?.firstInstallmentDate || null};
  });
}
module.exports={adminRecord};
