'use strict';
const {configuration,eligible,sourceKey}=require('./policy');
// Called inside the shared successful financial posting transaction. No network or extra reads.
function writeAccountPaymentEvent(tx,db,posting,env=process.env) {
  const config=configuration(env),{booking,bookingId,receipt}=posting;
  if(!config.enabled || !eligible(receipt,config))return;
  const source={kind:booking.sourceKind,id:booking.sourceId};
  tx.create(db.collection('accountPaymentEvents').doc(receipt.receiptId),{source,receiptId:receipt.receiptId,
    bookingId,createdAt:receipt.recordedAt,state:'queued'});
  tx.update(db.collection('paymentSubmissionScopes').doc(sourceKey(source)),{accountRequiredAfterReceipt:receipt.receiptId});
}
module.exports={writeAccountPaymentEvent};
