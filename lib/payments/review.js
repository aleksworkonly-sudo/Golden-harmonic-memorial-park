'use strict';

const { authenticate, documentId, requireAdmin } = require('./auth');
const { requireCondition, PaymentError } = require('./errors');
const { centavos } = require('./money');
const { timestamp, parseDate } = require('./calendar');
const { hash, manualEconomicId } = require('./identities');
const { sourceSummary } = require('./canonical');
const { preparePosting, writePosting } = require('./posting');

const STATES=['pending_verification','resubmit_requested','needs_reconciliation','verified','rejected'];
const open=(p)=>['pending_verification','resubmit_requested','needs_reconciliation'].includes(p.status);
const fields=(value,allowed)=>requireCondition(value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).every((key)=>allowed.includes(key)),'INVALID_COMMAND','Unsupported review details.');
const summary=(p)=>({paymentId:p.paymentId,sourceKind:p.sourceKind,sourceId:p.sourceId,submissionScope:p.submissionScope,
  status:p.status,version:p.version,revisionId:p.revisionId,evidenceRevisionCount:p.evidenceRevisionCount || Number(p.revisionId.slice(1)),
  quote:p.quote,claimedCentavos:p.claimedCentavos,reference:p.reference,transferDate:p.transferDate,submittedAt:p.submittedAt,
  buyerNote:p.buyerNote || '',receiptId:p.receiptId || null,receivedCentavos:p.receivedCentavos || null});

function filters(input={}) {
  fields(input,['status','channel','sourceId','from','to','ageDays']);
  const out={status:input.status || '',channel:input.channel || '',sourceId:input.sourceId || '',from:input.from || '',to:input.to || '',ageDays:input.ageDays || 0};
  requireCondition((!out.status || STATES.includes(out.status)) && (!out.channel || ['bank','gcash'].includes(out.channel)),
    'INVALID_FILTER','Choose a supported status or channel.');
  if(out.sourceId) documentId(out.sourceId);
  if(out.from) parseDate(out.from);if(out.to) parseDate(out.to);
  requireCondition((!out.from || !out.to || out.from<=out.to) && Number.isInteger(out.ageDays) && out.ageDays>=0 && out.ageDays<=3650,
    'INVALID_FILTER','Check the date or age filter.');
  return out;
}
function decision(input) {
  fields(input,['paymentId','requestId','expectedVersion','revisionId','action','reason','buyerNote','noFundsConfirmed',
    'fundsConfirmed','receivedCentavos','receivedAt','verifiedReference','expectedBookingVersion','allocations','unappliedCentavos','gatewayReviewed']);
  for(const key of ['paymentId','requestId','revisionId']) documentId(input[key]);
  requireCondition(input.requestId.length>=16 && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion>0 &&
    input.expectedVersion<Number.MAX_SAFE_INTEGER && ['approve','reject','request_correction','reconcile'].includes(input.action),
  'INVALID_COMMAND','Choose an action and reload its version.');
  requireCondition(typeof input.reason==='string' && input.reason.trim().length>0 && input.reason.length<=1000 &&
    typeof input.buyerNote==='string' && input.buyerNote.length<=500,'INVALID_REASON','Add an internal reason and a customer note (which may be blank).');
  if(['reject','request_correction'].includes(input.action)) requireCondition(input.buyerNote.trim().length>0,
    'INVALID_REASON','Add a helpful customer-facing explanation.');
  const funds=input.action==='approve' || input.fundsConfirmed===true;
  if(funds) {
    requireCondition(input.fundsConfirmed===true,'CONFIRM_RECEIPT','Confirm receipt against the bank or GCash statement.');
    centavos(input.receivedCentavos,{positive:true});timestamp(input.receivedAt);
    requireCondition(typeof input.verifiedReference==='string' && input.verifiedReference.trim().length>0 && input.verifiedReference.length<=160 &&
      !/[\x00-\x1f\x7f]/.test(input.verifiedReference),'INVALID_REFERENCE','Enter the statement reference.');
  } else requireCondition(['receivedCentavos','receivedAt','verifiedReference'].every((key)=>input[key]===undefined),
    'INVALID_COMMAND','Unconfirmed money cannot have verified receipt fields.');
  if(input.action==='approve') {
    requireCondition(Number.isSafeInteger(input.expectedBookingVersion) && input.expectedBookingVersion>0 &&
      Array.isArray(input.allocations) && input.allocations.length<=100,'INVALID_ALLOCATION','Review the contract version and plot allocations.');
    centavos(input.unappliedCentavos);const seen=new Set();
    for(const item of input.allocations) {
      fields(item,['itemId','centavos']);documentId(item.itemId);centavos(item.centavos,{positive:true});
      requireCondition(!seen.has(item.itemId),'INVALID_ALLOCATION','An item cannot appear twice.');seen.add(item.itemId);
    }
  } else requireCondition(['expectedBookingVersion','allocations','unappliedCentavos'].every((key)=>input[key]===undefined),
    'INVALID_COMMAND','Allocations are only permitted for approval.');
  if(input.action==='reject') requireCondition(input.noFundsConfirmed===true && !funds,
    'FUNDS_REVIEW','Reject only after confirming no funds were received for this claim.');
  if(input.action==='request_correction') requireCondition(!funds,'FUNDS_REVIEW','Confirmed funds belong in reconciliation, not a proof correction.');
  return {...input,reason:input.reason.trim(),buyerNote:input.buyerNote.trim(),
    ...(funds ? {verifiedReference:input.verifiedReference.trim()} : {})};
}

function createReviewService({db,auth,now=()=>Date.now(),allowActualAmount=true}) {
  const doc=(col,id)=>db.collection(col).doc(id);
  async function readPayment(tx,id) {
    const snap=await tx.get(doc('payments',documentId(id)));
    requireCondition(snap.exists && snap.data().schemaVersion===3,'NOT_FOUND','Manual submission not found.',404);
    return snap.data();
  }
  async function source(tx,p) {
    requireCondition(['customer','presale'].includes(p.sourceKind),'INTEGRITY_ERROR','Source needs review.',409);
    const snap=await tx.get(doc(p.sourceKind==='customer'?'customers':'presaleApplications',documentId(p.sourceId)));
    return snap.exists ? snap.data() : null;
  }
  async function queue(idToken,input={},cursor=null) {
    const identity=await authenticate(auth,idToken);const filter=filters(input);const cutoff=now()-filter.ageDays*86400000;
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);
      let query=db.collection('payments').where('schemaVersion','==',3);
      for(const key of ['status','channel','sourceId']) if(filter[key]) query=query.where(key,'==',filter[key]);
      if(filter.from) query=query.where('submittedAt','>=',Date.parse(`${filter.from}T00:00:00+08:00`));
      if(filter.to) query=query.where('submittedAt','<',Date.parse(`${filter.to}T00:00:00+08:00`)+86400000);
      if(filter.ageDays) query=query.where('submittedAt','<=',cutoff);
      query=query.orderBy('submittedAt','asc').orderBy('paymentId','asc');
      if(cursor!==null) {
        let value;try {if(typeof cursor==='string' && cursor.length<800) value=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch(_){/* checked below */}
        requireCondition(value?.filter===hash(filter) && Number.isSafeInteger(value.at) && typeof value.id==='string',
          'INVALID_CURSOR','Reload the review queue.');documentId(value.id);query=query.startAfter(value.at,value.id);
      }
      const rows=(await tx.get(query.limit(21))).docs.map((row)=>row.data());const page=rows.slice(0,20);
      const buyers=await Promise.all(page.map((p)=>source(tx,p)));
      const last=page.at(-1);
      return {cases:page.map((p,i)=>({...summary(p),name:String(buyers[i]?.name || buyers[i]?.fullName || buyers[i]?.firstName || 'Office review needed').slice(0,160)})),
        nextCursor:rows.length>20 ? Buffer.from(JSON.stringify({filter:hash(filter),at:last.submittedAt,id:last.paymentId})).toString('base64url') : null};
    });
  }
  async function detail(idToken,paymentId) {
    const identity=await authenticate(auth,idToken);
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);const p=await readPayment(tx,paymentId);const buyer=await source(tx,p);
      const revisions=(await tx.get(db.collection(`payments/${p.paymentId}/revisions`).orderBy('submittedAt','asc').limit(10))).docs.map((r)=>r.data());
      let history=null,blocker=null,booking=null;
      if(buyer) {
        try {history=await sourceSummary(tx,db,p.sourceKind,p.sourceId,buyer);}
        catch(error){if(error instanceof PaymentError) blocker=error.message;else throw error;}
        if(buyer.canonicalBookingId) {
          const snap=await tx.get(doc('bookings',documentId(buyer.canonicalBookingId)));
          if(snap.exists) {const b=snap.data();booking={id:snap.id,version:b.version,termsVersion:b.termsVersion,balanceCentavos:b.balanceCentavos,
            totalCentavos:b.totalCentavos,unappliedCentavos:b.unappliedCentavos,items:b.items || [],status:b.status};}
        }
      }
      if(!booking || !p.bookingId) blocker=blocker || 'This submission needs an approved canonical booking link before credit can be posted.';
      const claimKey=hash([p.quote.receivingAccountId,p.reference.trim()]);
      // A case can retain at most ten proof observations; read one beyond that bound before excluding self.
      const claims=(await tx.get(db.collection('referenceClaims').where('claimKey','==',claimKey).limit(11))).docs.map((s)=>s.data()).filter((s)=>s.paymentId!==p.paymentId);
      const reconciliation=await tx.get(doc('paymentReconciliations',p.paymentId));
      const gatewayScope=await tx.get(doc('paymentSubmissionScopes',p.submissionScope));
      return {payment:summary(p),name:String(buyer?.name || buyer?.fullName || buyer?.firstName || '').slice(0,160),
        revisions:revisions.map((r)=>({revisionId:r.revisionId,reference:r.reference,claimedCentavos:r.claimedCentavos,transferDate:r.transferDate,updatedAt:r.updatedAt})),
        history,booking,blocker,possibleDuplicate:claims.length>0,reconciliation:reconciliation.exists?reconciliation.data():null,
        allowActualAmount,gatewayReviewRequired:gatewayScope.exists && gatewayScope.data().gatewayHistory===true,
        gatewayActiveId:gatewayScope.exists?gatewayScope.data().gatewayActiveId || null:null};
    });
  }
  async function proof(idToken,paymentId,revisionId) {
    const identity=await authenticate(auth,idToken);documentId(revisionId);
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);const p=await readPayment(tx,paymentId);
      const snap=await tx.get(doc('paymentProofs',`${p.paymentId}_${revisionId}`));const image=snap.exists?snap.data():null;
      requireCondition(image && image.paymentId===p.paymentId && image.revisionId===revisionId && image.submissionScope===p.submissionScope &&
        image.validationStatus==='validated','NOT_FOUND','Proof not found.',404);
      return {mime:image.mime,base64:image.base64};
    });
  }

  async function decide(idToken,input) {
    const identity=await authenticate(auth,idToken);const cmd=decision(input);const at=now();
    if(cmd.receivedAt!==undefined) requireCondition(cmd.receivedAt<=at,'INVALID_DATE','Received time cannot be in the future.');
    const bodyHash=hash({...cmd,requestId:undefined});const operationId=hash(['manual-review-v1',identity.uid,cmd.requestId]);
    return db.runTransaction(async(tx)=>{
      const actor=await requireAdmin(tx,db,identity);const operationRef=doc('operationKeys',operationId);const operation=await tx.get(operationRef);
      if(operation.exists) {
        requireCondition(operation.data().bodyHash===bodyHash,'IDEMPOTENCY_CONFLICT','This request was saved with different details.',409);
        return {...operation.data().result,duplicate:true};
      }
      const p=await readPayment(tx,cmd.paymentId);
      requireCondition(open(p) && p.version===cmd.expectedVersion && p.revisionId===cmd.revisionId,
        'STALE_REVIEW','This case changed. Refresh it before deciding.',409);
      const scopeRef=doc('paymentSubmissionScopes',p.submissionScope);const scopeSnap=await tx.get(scopeRef);const scope=scopeSnap.exists?scopeSnap.data():null;
      requireCondition(scope && scope.sourceKind===p.sourceKind && scope.sourceId===p.sourceId &&
        Number.isSafeInteger(scope.openCases) && scope.openCases>0,'INTEGRITY_ERROR','The open-case counter needs reconciliation.',409);
      const proofSnap=await tx.get(doc('paymentProofs',documentId(p.proofId)));const image=proofSnap.exists?proofSnap.data():null;
      const revisionSnap=await tx.get(doc(`payments/${p.paymentId}/revisions`,p.revisionId));const revision=revisionSnap.exists?revisionSnap.data():null;
      requireCondition(image && image.paymentId===p.paymentId && image.revisionId===p.revisionId && image.submissionScope===p.submissionScope && image.validationStatus==='validated' &&
        revision && revision.proofId===p.proofId && revision.revisionId===p.revisionId && hash(revision.quote)===hash(p.quote) &&
        revision.reference===p.reference && revision.claimedCentavos===p.claimedCentavos && revision.transferDate===p.transferDate &&
        revision.bookingId===p.bookingId && revision.ownerBinding===p.ownerBinding && revision.bookingTermsVersion===p.bookingTermsVersion,
      'INVALID_PROOF','The immutable evidence links need review.',409);
      const reconRef=doc('paymentReconciliations',p.paymentId);const reconSnap=await tx.get(reconRef);const held=reconSnap.exists && reconSnap.data().fundsConfirmed ? reconSnap.data() : null;
      requireCondition(!held || ['reconcile','approve'].includes(cmd.action),'FUNDS_REVIEW','Confirmed funds cannot be rejected or sent back as an ordinary proof correction.',409);
      const funds=cmd.fundsConfirmed===true;
      requireCondition(!held || funds,'FUNDS_REVIEW','Preserve the confirmed received-money details.',409);
      let economicRef=null,economic=null,received=null;
      if(funds) {
        requireCondition(['gcash','bank'].includes(p.quote.channel),'WORKFLOW_NOT_READY','Only manual GCash/bank evidence is supported.',409);
        received={receivingAccountId:p.quote.receivingAccountId,receivedCentavos:cmd.receivedCentavos,receivedAt:cmd.receivedAt,verifiedReference:cmd.verifiedReference};
        requireCondition(!held || hash(held.received)===hash(received),'FUNDS_REVIEW','Changing confirmed received-money details requires a separate correction workflow.',409);
        economicRef=doc('economicPayments',manualEconomicId(p.quote.receivingAccountId,cmd.verifiedReference));
        const snap=await tx.get(economicRef);economic=snap.exists?snap.data():null;
        requireCondition(!economic || (economic.state==='held' && economic.paymentId===p.paymentId),
          'DUPLICATE_PAYMENT','This transfer is already recorded. Reconcile the existing payment; do not post it twice.',409);
      }
      let posting=null;
      if(cmd.action==='approve') posting=await preparePosting({tx,db,p,scope,cmd,received,at,allowActualAmount});
      const status={approve:'verified',reject:'rejected',request_correction:'resubmit_requested',reconcile:'needs_reconciliation'}[cmd.action];
      const result={paymentId:p.paymentId,status,version:p.version+1,...(posting?{receiptId:posting.receipt.receiptId,balanceCentavos:posting.receipt.balanceAfterCentavos}: {})};
      const eventId=`review_${p.paymentId}_${p.version+1}`;
      // All reads complete. Every write below is atomic, with no email/provider call.
      if(posting) {
        const {bookingId,receipt}=posting;
        writePosting(tx,db,posting,actor);
        const key={paymentId:p.paymentId,bookingId,receiptId:receipt.receiptId,state:'posted',createdAt:at};
        if(economic) tx.update(economicRef,key);else tx.create(economicRef,key);
        if(reconSnap.exists) tx.update(reconRef,{state:'resolved',resolvedAt:at,receiptId:receipt.receiptId});
      } else if(cmd.action==='reconcile') {
        const record={paymentId:p.paymentId,submissionScope:p.submissionScope,state:'open',fundsConfirmed:funds,
          received:received || null,reason:cmd.reason,actor,updatedAt:at};
        if(reconSnap.exists) tx.update(reconRef,record);else tx.create(reconRef,record);
        if(funds && !economic) tx.create(economicRef,{paymentId:p.paymentId,state:'held',createdAt:at});
      }
      tx.update(doc('payments',p.paymentId),{status,version:p.version+1,buyerNote:cmd.buyerNote,updatedAt:at,reviewedBy:actor.uid,
        ...(posting?{receiptId:posting.receipt.receiptId,receivedCentavos:cmd.receivedCentavos,receivedAt:cmd.receivedAt,verifiedReference:cmd.verifiedReference,verifiedAt:at}: {})});
      if(status==='rejected' && reconSnap.exists) tx.update(reconRef,{state:'closed_no_funds',resolvedAt:at});
      if(['verified','rejected'].includes(status)) tx.update(scopeRef,{openCases:scope.openCases-1});
      tx.create(doc('auditLogs',eventId),{action:cmd.action,paymentId:p.paymentId,revisionId:p.revisionId,actor,reason:cmd.reason,beforeStatus:p.status,afterStatus:status,received,createdAt:at});
      tx.create(doc('notifications',eventId),{type:status,submissionScope:p.submissionScope,paymentId:p.paymentId,buyerNote:cmd.buyerNote,createdAt:at});
      tx.create(operationRef,{actorUid:actor.uid,bodyHash,result,createdAt:at});return result;
    });
  }
  return {queue,detail,proof,decide};
}
module.exports={createReviewService,STATES};
