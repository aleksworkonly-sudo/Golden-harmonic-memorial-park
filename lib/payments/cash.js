'use strict';

const { authenticate, documentId, requireAdmin } = require('./auth');
const { requireCondition, PaymentError } = require('./errors');
const { centavos } = require('./money');
const { timestamp, manilaDate } = require('./calendar');
const { hash, cashEconomicId } = require('./identities');
const { ownerBinding, checkBooking, sourceSummary } = require('./canonical');
const { preparePosting, writePosting } = require('./posting');
const { scopeKey, MAX_BUDGET } = require('./submission');
const { validateProof, DOCUMENT_BYTES } = require('./proof-image');

const fields=(v,keys)=>requireCondition(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every((k)=>keys.includes(k)),
  'INVALID_COMMAND','Unsupported cash details.');
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max && !/[\x00-\x1f\x7f]/.test(v);
const positiveVersion=(v)=>Number.isSafeInteger(v) && v>0 && v<Number.MAX_SAFE_INTEGER;
const safe=(p)=>({paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,sourceKind:p.sourceKind,sourceId:p.sourceId,
  status:p.status,version:p.version,receivedCentavos:p.receivedCentavos,receivedAt:p.receivedAt,submittedAt:p.submittedAt,
  printCount:p.printCount,evidenceRevisionCount:p.evidenceRevisionCount,revisionId:p.revisionId});

function checkSnapshot(p) {
  const s=p.cashSnapshot;
  requireCondition(s && p.snapshotHash===hash(s) && ['cashReceiptId','sourceKind','sourceId','bookingId','purpose','receivedCentavos','receivedAt']
    .every((key)=>s[key]===p[key]) && s.officeReference===p.reference && s.purpose===p.quote?.purpose &&
    s.receivingAccountId===p.quote?.receivingAccountId && s.receivingAccountVersion===p.quote?.receivingAccountVersion &&
    p.cashReceiptId===`CASH-${p.paymentId.slice(3)}` && p.economicId===cashEconomicId(s.receivingAccountId,s.officeReference),
  'INTEGRITY_ERROR','The recorded cash facts and printed snapshot need reconciliation.',409);
}

function createCashService({db,auth,now=()=>Date.now(),decode=validateProof}) {
  const doc=(col,id)=>db.collection(col).doc(id);
  async function payment(tx,id) {
    const snap=await tx.get(doc('payments',documentId(id)));
    requireCondition(snap.exists && snap.data().schemaVersion===5 && snap.data().channel==='cash', 'NOT_FOUND','Cash record not found.',404);
    const p=snap.data();checkSnapshot(p);return p;
  }
  async function source(tx,kind,id) {
    requireCondition(['customer','presale'].includes(kind),'INVALID_COMMAND','Select an account or reservation.');
    const snap=await tx.get(doc(kind==='customer'?'customers':'presaleApplications',documentId(id)));
    requireCondition(snap.exists,'NOT_FOUND','Account or reservation not found.',404);return snap.data();
  }
  async function contextIn(tx,kind,id) {
    const buyer=await source(tx,kind,id),key=scopeKey(kind,id);
    const scopeSnap=await tx.get(doc('paymentSubmissionScopes',key));const scope=scopeSnap.exists?scopeSnap.data():null;
    requireCondition(scope && scope.enabled===true && scope.sourceKind===kind && scope.sourceId===id &&
      scope.bookingId===buyer.canonicalBookingId && positiveVersion(scope.version) && !['cancelled','released'].includes(buyer.status),
    'BOOKING_REVIEW','This account needs an approved cash configuration and canonical booking.',409);
    const bookingId=documentId(buyer.canonicalBookingId),row=await tx.get(doc('bookings',bookingId));const booking=row.exists?row.data():null;
    checkBooking(booking,kind,id,buyer);
    requireCondition(booking.postingEnabled===true && booking.policyStatus==='approved' && booking.status==='active',
      'BOOKING_REVIEW','This contract is not ready for cash recording.',409);
    const config=scope.cash;
    requireCondition(config && config.enabled===true && positiveVersion(config.receivingAccountVersion) &&
      Array.isArray(config.purposes) && config.purposes.length>0 && config.purposes.length<=4 &&
      config.purposes.every((p)=>['deposit','installment','advance','settlement'].includes(p)),
    'CASH_CONFIG','Cash receiving instructions need office review.',409);
    const account=await tx.get(doc('paymentReceivingAccounts',documentId(config.receivingAccountId)));
    requireCondition(account.exists && account.data().enabled===true && account.data().channel==='cash' &&
      account.data().version===config.receivingAccountVersion && text(account.data().label,160),
    'CASH_CONFIG','The cash register configuration changed.',409);
    const name=String(buyer.name || buyer.fullName || [buyer.firstName,buyer.lastName].filter(Boolean).join(' ') || id).slice(0,160);
    return {buyer,key,scope,booking,bookingId,name,config,officeLabel:account.data().label};
  }
  async function context(token,kind,id) {
    const identity=await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);const c=await contextIn(tx,kind,id);
      return {sourceKind:kind,sourceId:id,name:c.name,bookingId:c.bookingId,bookingVersion:c.booking.version,scopeVersion:c.scope.version,
        balanceCentavos:c.booking.balanceCentavos,items:c.booking.items,purposes:c.config.purposes,officeLabel:c.officeLabel};});
  }
  async function queue(token,input={},cursor=null) {
    const identity=await authenticate(auth,token);fields(input,['status','sourceId']);
    const filter={status:input.status || '',sourceId:input.sourceId || ''};
    requireCondition(['','pending_verification','verified'].includes(filter.status),'INVALID_FILTER','Choose pending, approved or all.');
    if(filter.sourceId) documentId(filter.sourceId);
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);let q=db.collection('payments').where('schemaVersion','==',5);
      for(const key of ['status','sourceId'])if(filter[key])q=q.where(key,'==',filter[key]);
      q=q.orderBy('submittedAt','asc').orderBy('paymentId','asc');
      if(cursor!==null) {
        let v;try{if(typeof cursor==='string' && cursor.length<700)v=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch(_){/* validated below */}
        requireCondition(v?.filter===hash(filter) && Number.isSafeInteger(v.at),'INVALID_CURSOR','Reload the cash queue.');
        documentId(v.id);q=q.startAfter(v.at,v.id);
      }
      const rows=(await tx.get(q.limit(21))).docs.map((d)=>d.data()),page=rows.slice(0,20),last=page.at(-1);
      return {cases:page.map(safe),nextCursor:rows.length>20?Buffer.from(JSON.stringify({filter:hash(filter),at:last.submittedAt,id:last.paymentId})).toString('base64url'):null};
    });
  }
  async function detail(token,id) {
    const identity=await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);const p=await payment(tx,id);
      const revisions=(await tx.get(db.collection(`payments/${id}/revisions`).orderBy('createdAt','asc').limit(10))).docs.map((d)=>d.data());
      const recon=await tx.get(doc('paymentReconciliations',id));let history=null,booking=null,blocker=null;
      try {
        const buyer=await source(tx,p.sourceKind,p.sourceId);history=await sourceSummary(tx,db,p.sourceKind,p.sourceId,buyer);
        const snap=await tx.get(doc('bookings',p.bookingId));if(snap.exists){const b=snap.data();booking={version:b.version,balanceCentavos:b.balanceCentavos,items:b.items};}
      }catch(error){if(error instanceof PaymentError)blocker=error.message;else throw error;}
      return {payment:{...safe(p),snapshot:p.cashSnapshot,receiptId:p.receiptId || null},revisions:revisions.map((r)=>({revisionId:r.revisionId,createdAt:r.createdAt})),
        reconciliation:recon.exists?{state:recon.data().state,received:recon.data().received}:null,history,booking,blocker};
    });
  }
  async function proof(token,id,revisionId) {
    const identity=await authenticate(auth,token);documentId(revisionId);
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);const p=await payment(tx,id);const row=await tx.get(doc('paymentProofs',`${id}_${revisionId}`));const v=row.exists?row.data():null;
      requireCondition(v && v.paymentId===id && v.cashReceiptId===p.cashReceiptId && v.revisionId===revisionId && v.evidenceType==='printed_cash_receipt' &&
        v.snapshotHash===p.snapshotHash && v.submissionScope===p.submissionScope && v.validationStatus==='validated','NOT_FOUND','Cash photo not found.',404);
      return {mime:v.mime,base64:v.base64};
    });
  }

  async function mutate(token,action,input) {
    const identity=await authenticate(auth,token);
    const keys={record:['sourceKind','sourceId','scopeVersion','expectedBookingVersion','purpose','receivedCentavos','receivedAt','collector','officeReference','fundsConfirmed'],
      print:['paymentId','expectedVersion'],photo:['paymentId','expectedVersion','image'],
      approve:['paymentId','expectedVersion','revisionId','expectedBookingVersion','allocations','unappliedCentavos','reason','photoConfirmed']};
    requireCondition(Object.hasOwn(keys,action),'INVALID_COMMAND','Unknown cash step.');fields(input,['requestId',...keys[action]]);
    documentId(input.requestId);requireCondition(input.requestId.length>=16,'INVALID_COMMAND','A durable request identifier is required.');
    let cmd={...input},image=null;
    if(action==='record') {
      documentId(cmd.sourceId);centavos(cmd.receivedCentavos,{positive:true});timestamp(cmd.receivedAt);
      requireCondition(cmd.receivedAt<=now() && cmd.fundsConfirmed===true && positiveVersion(cmd.scopeVersion) && positiveVersion(cmd.expectedBookingVersion) &&
        text(cmd.collector,160) && text(cmd.officeReference,160),'INVALID_COMMAND','Confirm actual cash, received date, collector and unique office intake reference.');
      cmd.collector=cmd.collector.trim();cmd.officeReference=cmd.officeReference.trim();
    } else {
      documentId(cmd.paymentId);requireCondition(positiveVersion(cmd.expectedVersion),'INVALID_COMMAND','Reload the cash record.');
    }
    if(action==='photo') {
      // Reject unauthorized decoding; all authority is checked again after image validation.
      await db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);await payment(tx,cmd.paymentId);});
      image=await decode(cmd.image);
    }
    if(action==='approve') {
      documentId(cmd.revisionId);centavos(cmd.unappliedCentavos);
      requireCondition(cmd.photoConfirmed===true && text(cmd.reason,1000) && positiveVersion(cmd.expectedBookingVersion) &&
        Array.isArray(cmd.allocations) && cmd.allocations.length<=100,'INVALID_COMMAND','Confirm the printed photo and review the allocations.');
      const seen=new Set();for(const a of cmd.allocations){fields(a,['itemId','centavos']);documentId(a.itemId);centavos(a.centavos,{positive:true});
        requireCondition(!seen.has(a.itemId),'INVALID_ALLOCATION','Allocate each item once.');seen.add(a.itemId);}
      cmd.reason=cmd.reason.trim();
    }
    const at=now(),opId=hash(['cash-operation-v1',identity.uid,cmd.requestId]);
    const bodyHash=hash({action,...cmd,...(image?{image:image.inputHash}:{})});
    return db.runTransaction(async(tx)=>{
      const actor=await requireAdmin(tx,db,identity),opRef=doc('operationKeys',opId),op=await tx.get(opRef);
      if(op.exists){requireCondition(op.data().bodyHash===bodyHash,'IDEMPOTENCY_CONFLICT','This request was already saved with different details.',409);return {...op.data().result,duplicate:true};}
      let p,extra={},posting=null,budget=null,budgetRef=null,evidence=null,revision=null,printEvent=null;
      if(action==='record') {
        const c=await contextIn(tx,cmd.sourceKind,cmd.sourceId);
        requireCondition(c.scope.version===cmd.scopeVersion && c.booking.version===cmd.expectedBookingVersion && c.config.purposes.includes(cmd.purpose),
          'STALE_BOOKING','Cash options or contract changed. Reload before recording.',409);
        requireCondition(Number.isSafeInteger(c.scope.openCases) && c.scope.openCases>=0 && c.scope.openCases<Number.MAX_SAFE_INTEGER,
          'INTEGRITY_ERROR','The pending cash counter needs reconciliation.',409);
        const paymentId=`CP-${opId.slice(0,32)}`,cashReceiptId=`CASH-${opId.slice(0,32)}`;
        const economicId=cashEconomicId(c.config.receivingAccountId,cmd.officeReference);
        requireCondition(!(await tx.get(doc('economicPayments',economicId))).exists,'DUPLICATE_PAYMENT','This cash register/reference is already recorded. Open the existing cash record.',409);
        const cashSnapshot={cashReceiptId,name:c.name,sourceKind:cmd.sourceKind,sourceId:cmd.sourceId,bookingId:c.bookingId,
          plotIds:c.booking.items.map((i)=>i.plotId),purpose:cmd.purpose,receivedCentavos:cmd.receivedCentavos,receivedAt:cmd.receivedAt,
          collector:cmd.collector,officeReference:cmd.officeReference,officeLabel:c.officeLabel,
          receivingAccountId:c.config.receivingAccountId,receivingAccountVersion:c.config.receivingAccountVersion,recordedAt:at};
        p={schemaVersion:5,paymentId,cashReceiptId,sourceKind:cmd.sourceKind,sourceId:cmd.sourceId,submissionScope:c.key,
          scopeVersion:c.scope.version,bookingId:c.bookingId,bookingTermsVersion:c.booking.termsVersion,ownerBinding:ownerBinding(cmd.sourceKind,c.buyer),
          channel:'cash',purpose:cmd.purpose,quote:{channel:'cash',purpose:cmd.purpose,receivingAccountId:c.config.receivingAccountId,
            receivingAccountVersion:c.config.receivingAccountVersion,expectedAmountCentavos:cmd.receivedCentavos,label:c.officeLabel},
          claimedCentavos:cmd.receivedCentavos,receivedCentavos:cmd.receivedCentavos,receivedAt:cmd.receivedAt,reference:cmd.officeReference,transferDate:manilaDate(cmd.receivedAt),
          status:'pending_verification',version:1,revisionId:'r0',proofId:null,evidenceRevisionCount:0,printCount:0,lastPrintEventId:null,
          cashSnapshot,snapshotHash:hash(cashSnapshot),economicId,recordedBy:actor.uid,submittedAt:at,updatedAt:at};
        extra={scope:c.scope};
      } else {
        p=await payment(tx,cmd.paymentId);
        requireCondition(p.version===cmd.expectedVersion && (action==='print' || p.status==='pending_verification'),
          'STALE_CASH','This cash record changed or is already approved. Reload it.',409);
        requireCondition(p.snapshotHash===hash(p.cashSnapshot),'INTEGRITY_ERROR','Cash snapshot needs reconciliation.',409);
        if(action==='print') {
          requireCondition(Number.isSafeInteger(p.printCount) && p.printCount>=0 && p.printCount<100,'PRINT_LIMIT','Print attempt limit reached. Contact the office.',409);
          printEvent={paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,snapshotHash:p.snapshotHash,status:p.status,actor,createdAt:at};
        }
        if(action==='photo' || action==='approve') {
          requireCondition(p.printCount>0 && p.lastPrintEventId,'PRINT_REQUIRED','Record a print attempt before attaching or approving a receipt photo.',409);
          const print=await tx.get(doc('cashPrintEvents',documentId(p.lastPrintEventId)));
          requireCondition(print.exists && print.data().paymentId===p.paymentId && print.data().cashReceiptId===p.cashReceiptId && print.data().snapshotHash===p.snapshotHash,
            'PRINT_REQUIRED','The receipt print record needs review.',409);
        }
        if(action==='photo') {
          requireCondition(Number.isSafeInteger(p.evidenceRevisionCount) && p.evidenceRevisionCount>=0 && p.evidenceRevisionCount<10,
            'SUBMISSION_LIMIT','Ten photo revisions are already retained. Contact the office.',409);
          budgetRef=doc('paymentProofBudget','manual');const row=await tx.get(budgetRef);budget=row.exists?row.data():null;
          requireCondition(budget && Number.isSafeInteger(budget.usedBytes) && budget.usedBytes>=0 && Number.isSafeInteger(budget.limitBytes) &&
            budget.limitBytes>0 && budget.limitBytes<=MAX_BUDGET,'STORAGE_UNAVAILABLE','Private photo storage needs office review. Cash remains pending.',503);
          const revisionId=`r${p.evidenceRevisionCount+1}`,proofId=`${p.paymentId}_${revisionId}`;
          evidence={...image,paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,revisionId,submissionScope:p.submissionScope,evidenceType:'printed_cash_receipt',
            snapshotHash:p.snapshotHash,printEventId:p.lastPrintEventId,createdAt:at};delete evidence.inputHash;
          const chargedBytes=Buffer.byteLength(JSON.stringify(evidence))+4096;
          requireCondition(chargedBytes<=DOCUMENT_BYTES && budget.usedBytes+chargedBytes<=budget.limitBytes,
            'STORAGE_FULL','Private photo storage is full. Recorded cash remains pending.',409);evidence.chargedBytes=chargedBytes;
          revision={paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,revisionId,proofId,snapshotHash:p.snapshotHash,printEventId:p.lastPrintEventId,actor,createdAt:at};
        }
        if(action==='approve') {
          requireCondition(p.evidenceRevisionCount>0 && p.revisionId===cmd.revisionId,'PHOTO_REQUIRED','Review the latest printed receipt photo before approval.',409);
          const photo=await tx.get(doc('paymentProofs',documentId(p.proofId))),rev=await tx.get(doc(`payments/${p.paymentId}/revisions`,cmd.revisionId));
          const i=photo.exists?photo.data():null,r=rev.exists?rev.data():null;
          requireCondition(i && r && i.cashReceiptId===p.cashReceiptId && r.cashReceiptId===p.cashReceiptId &&
            i.validationStatus==='validated' && i.evidenceType==='printed_cash_receipt' && i.paymentId===p.paymentId &&
            i.revisionId===cmd.revisionId && i.submissionScope===p.submissionScope && i.snapshotHash===p.snapshotHash &&
            r.paymentId===p.paymentId && r.revisionId===cmd.revisionId && r.proofId===p.proofId && r.snapshotHash===p.snapshotHash && r.printEventId===i.printEventId,
          'INVALID_PROOF','The printed photo links need review.',409);
          const printed=await tx.get(doc('cashPrintEvents',documentId(i.printEventId)));
          requireCondition(printed.exists && printed.data().paymentId===p.paymentId && printed.data().cashReceiptId===p.cashReceiptId && printed.data().snapshotHash===p.snapshotHash,
            'PRINT_REQUIRED','The photographed receipt has no matching print attempt.',409);
          const recon=await tx.get(doc('paymentReconciliations',p.paymentId)),economic=await tx.get(doc('economicPayments',p.economicId));
          const received={receivingAccountId:p.quote.receivingAccountId,receivedCentavos:p.receivedCentavos,receivedAt:p.receivedAt,verifiedReference:p.reference};
          requireCondition(recon.exists && recon.data().state==='open' && recon.data().fundsConfirmed===true && hash(recon.data().received)===hash(received) &&
            economic.exists && economic.data().state==='held' && economic.data().paymentId===p.paymentId && economic.data().cashReceiptId===p.cashReceiptId &&
            p.economicId===cashEconomicId(p.quote.receivingAccountId,p.reference),'FUNDS_REVIEW','Cash-on-hand or its uniqueness record needs reconciliation.',409);
          const scopeRow=await tx.get(doc('paymentSubmissionScopes',p.submissionScope)),scope=scopeRow.exists?scopeRow.data():null;
          requireCondition(scope && scope.sourceKind===p.sourceKind && scope.sourceId===p.sourceId && Number.isSafeInteger(scope.openCases) && scope.openCases>0,
            'INTEGRITY_ERROR','The pending cash counter needs reconciliation.',409);
          posting=await preparePosting({tx,db,p,scope,cmd:{...cmd,...received},received,at});
          posting.receipt.cashSnapshot=p.cashSnapshot;posting.receipt.snapshotHash=p.snapshotHash;posting.receipt.printEventId=i.printEventId;
          extra={scope};
        }
      }
      const version=action==='record'?1:p.version+1,status=posting?'verified':p.status;
      const result={paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,version,status,
        ...(action==='print'?{snapshot:p.cashSnapshot,printEventId:opId,printStatus:p.status}:{}),
        ...(revision?{revisionId:revision.revisionId}:{}),...(posting?{receiptId:posting.receipt.receiptId,balanceCentavos:posting.receipt.balanceAfterCentavos}:{})};
      // No external effects in this transaction; all reads precede the writes below.
      if(action==='record') {
        tx.create(doc('payments',p.paymentId),p);
        tx.create(doc('economicPayments',p.economicId),{paymentId:p.paymentId,bookingId:p.bookingId,cashReceiptId:p.cashReceiptId,state:'held',createdAt:at});
        tx.create(doc('paymentReconciliations',p.paymentId),{paymentId:p.paymentId,submissionScope:p.submissionScope,channel:'cash',state:'open',fundsConfirmed:true,
          received:{receivingAccountId:p.quote.receivingAccountId,receivedCentavos:p.receivedCentavos,receivedAt:p.receivedAt,verifiedReference:p.reference},actor,createdAt:at});
        tx.update(doc('paymentSubmissionScopes',p.submissionScope),{openCases:extra.scope.openCases+1});
      } else {
        const patch={version,status,updatedAt:at};
        if(printEvent){tx.create(doc('cashPrintEvents',opId),printEvent);Object.assign(patch,{printCount:p.printCount+1,lastPrintEventId:opId});}
        if(evidence){tx.create(doc('paymentProofs',revision.proofId),evidence);tx.create(doc(`payments/${p.paymentId}/revisions`,revision.revisionId),revision);
          tx.update(budgetRef,{usedBytes:budget.usedBytes+evidence.chargedBytes});Object.assign(patch,{proofId:revision.proofId,revisionId:revision.revisionId,evidenceRevisionCount:p.evidenceRevisionCount+1});}
        if(posting){writePosting(tx,db,posting,actor);Object.assign(patch,{receiptId:p.cashReceiptId,verifiedAt:at,reviewedBy:actor.uid});
          tx.update(doc('economicPayments',p.economicId),{state:'posted',receiptId:p.cashReceiptId,postedAt:at});
          tx.update(doc('paymentReconciliations',p.paymentId),{state:'resolved',receiptId:p.cashReceiptId,resolvedAt:at});
          tx.update(doc('paymentSubmissionScopes',p.submissionScope),{openCases:extra.scope.openCases-1});}
        tx.update(doc('payments',p.paymentId),patch);
      }
      tx.create(doc('auditLogs',`cash_${opId}`),{action:`cash_${action}`,paymentId:p.paymentId,cashReceiptId:p.cashReceiptId,snapshotHash:p.snapshotHash,
        revisionId:revision?.revisionId || p.revisionId,actor,reason:cmd.reason || '',createdAt:at});
      if(action==='record' || posting)tx.create(doc('notifications',`cash_${opId}`),{type:posting?'verified':'cash_pending',submissionScope:p.submissionScope,paymentId:p.paymentId,createdAt:at});
      if(action==='record')tx.create(doc('emailOutbox',`cash_${opId}`),{type:'payment_status',bookingId:p.bookingId,ownerBinding:p.ownerBinding,
        bookingTermsVersion:p.bookingTermsVersion,buyerMessage:`Cash record ${p.cashReceiptId} is awaiting print/photo approval. It has not yet been credited to your contract.`,createdAt:at,state:'awaiting_configuration'});
      tx.create(opRef,{actorUid:actor.uid,bodyHash,result,createdAt:at});return result;
    });
  }
  return {context,queue,detail,proof,mutate};
}
module.exports={createCashService};
