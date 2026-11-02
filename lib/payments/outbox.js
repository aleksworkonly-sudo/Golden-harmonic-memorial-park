'use strict';
const { randomUUID } = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { authenticate, documentId, requireAdmin } = require('./auth');
const { readContract } = require('./operations-access');
const { requireCondition, PaymentError } = require('./errors');
const { hash } = require('./identities');
const { readLifecycle } = require('./lifecycle-model');
const { manilaDate } = require('./calendar');
const money=(n)=>`PHP ${(n/100).toFixed(2)}`;
const providerKey=(id)=>{const h=hash(['email',id]);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const LEASE_MS=60000,MAX_ATTEMPTS=5;
const WORKER=Symbol('private-worker');
const email=(v)=>typeof v==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length<=254;

async function destination(tx,db,bookingId) {
  const c=await readContract(tx,db,bookingId),n=c.booking.notificationContact;
  requireCondition(n?.enabled===true && n.verified===true && Number.isSafeInteger(n.version) && n.version>0 &&
    email(n.email) && n.email===String(c.source.email || '').trim().toLowerCase() && n.ownerBinding===c.booking.ownerBinding,
  'CONTACT_REVIEW','The stored notification contact needs verified provisioning.',409);
  return {...c,to:n.email,contactHash:hash([n.email,n.version,n.ownerBinding,c.source.accessVersion || null])};
}
async function reminderCurrent(tx,db,c,event,at) {
  const m=await readLifecycle(tx,db,c.booking,c.bookingId,at),s=await tx.get(db.collection('paymentSubmissionScopes').doc(c.key));
  return c.booking.status==='active' && m && m.state!=='needs_reconciliation' && !m.deadlineSatisfied &&
    m.deadlineDate===event.deadlineDate && s.exists && s.data().openCases===0 && !s.data().gatewayActiveId &&
    event.stage===reminderStage(m.deadlineDate,manilaDate(at));
}
function reminderStage(deadline,today){const days=Math.round((Date.parse(deadline)-Date.parse(today))/86400000);return days<0?'after':days<=1?'before1':days<=3?'before3':null;}
function createOutboxService({db,auth,origin,send,now=()=>Date.now(),random=randomUUID}) {
  const doc=(c,id)=>db.collection(c).doc(id);
  async function queue(token,state='awaiting_configuration',cursor=null) {
    requireCondition(['awaiting_configuration','ready','retry','sending','uncertain','failed','accepted','suppressed'].includes(state),'INVALID_COMMAND','Choose a delivery state.');
    if(cursor)documentId(cursor);const actor=await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{await requireAdmin(tx,db,actor);let q=db.collection('emailOutbox').where('state','==',state).orderBy(FieldPath.documentId(),'asc');if(cursor)q=q.startAfter(cursor);
      const docs=(await tx.get(q.limit(21))).docs;return {rows:docs.slice(0,20).map((d)=>({id:d.id,...safe(d.data())})),nextCursor:docs.length>20?docs[19].id:null};});
  }
  function safe(e){return {state:e.state,type:e.type,bookingId:e.bookingId,receiptId:e.receiptId || null,createdAt:e.createdAt,attempts:e.attempts || 0,
    to:e.to || null,subject:e.subject || null,text:e.text || null,messageId:e.messageId || null,nextAttemptAt:e.nextAttemptAt || null,version:e.version || 0};}
  async function prepare(token,id) {
    documentId(id);const actor=token===WORKER?{uid:'messaging-worker'}:await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{
      if(token!==WORKER)await requireAdmin(tx,db,actor);const row=await tx.get(doc('emailOutbox',id));requireCondition(row.exists,'NOT_FOUND','Notification event not found.',404);const e=row.data();
      if(e.state!=='awaiting_configuration')return {id,...safe(e)};
      const c=await destination(tx,db,documentId(e.bookingId));let subject,text;
      requireCondition(e.ownerBinding===c.booking.ownerBinding && e.bookingTermsVersion===c.booking.termsVersion,'EVENT_REVIEW','Historical event ownership or terms require reconciliation.',409);
      if(e.type==='payment_verified') {
        const r=await tx.get(doc('receipts',documentId(e.receiptId)));requireCondition(r.exists && r.data().bookingId===e.bookingId,'EVENT_REVIEW','Receipt binding needs review.',409);const p=r.data();
        subject='Payment recorded — Golden Harmonic';text=`Receipt ${p.receiptId}\nReceived date: ${p.receivedDate}\nPrincipal credited: ${money(p.contractCreditCentavos)}\nUnapplied credit: ${money(p.unappliedCentavos)}\nBalance after this receipt: ${money(p.balanceAfterCentavos)}\nBuyer fee: ${money(p.buyerFeeCentavos || 0)}\nThis is a payment acknowledgement, not an official tax invoice.`;
      } else if(e.type==='reservation_reminder') {
        requireCondition(await reminderCurrent(tx,db,c,e,now()),'STALE_REMINDER','Payment evidence or reservation status changed. Do not send this reminder.',409);
        subject='Reservation deadline — Golden Harmonic';text=`Reservation ${c.booking.sourceId}\nOriginal deadline: ${e.deadlineDate}\n${e.stage==='after'?'The required payment remains outstanding and the office will review the reservation. Plots are not automatically released.':'Please complete the required deposit, or the full spot-cash balance, by the original deadline.'}\nIf you have already paid, upload proof or contact the office before making another payment.`;
      } else {
        requireCondition(e.type==='payment_status' && typeof e.buyerMessage==='string','EVENT_REVIEW','This legacy event needs a reviewed adapter.',409);
        subject='Payment review update — Golden Harmonic';text=e.buyerMessage;
      }
      const patch={state:'ready',to:c.to,contactHash:c.contactHash,subject,text:`${text}\n\nEvent recorded: ${new Date(e.createdAt).toISOString()}. For current status, open secure payment history: ${origin}/my-payments`,
        ownerBinding:c.booking.ownerBinding,termsVersion:c.booking.termsVersion,version:1,attempts:0,nextAttemptAt:now(),preparedAt:now(),providerKey:providerKey(id)};
      tx.update(doc('emailOutbox',id),patch);tx.create(doc('auditLogs',`email_prepare_${id}`),{action:'email_prepared',eventId:id,actor:actor.uid,createdAt:now()});return {id,...safe({...e,...patch})};
    });
  }
  async function dispatch(id) {
    documentId(id);const lease=random(),at=now();
    const claim=await db.runTransaction(async(tx)=>{
      const row=await tx.get(doc('emailOutbox',id));if(!row.exists)return null;const e=row.data();
      if(e.state==='sending' && e.leaseUntil<=at){tx.update(doc('emailOutbox',id),{state:'uncertain',version:e.version+1});return null;}
      if(!['ready','retry'].includes(e.state) || e.nextAttemptAt>at || e.attempts>=MAX_ATTEMPTS)return null;
      let c,valid=false;try{c=await destination(tx,db,e.bookingId);valid=c.contactHash===e.contactHash && c.booking.ownerBinding===e.ownerBinding && c.booking.termsVersion===e.termsVersion;
        if(valid && e.type==='reservation_reminder')valid=await reminderCurrent(tx,db,c,e,at);
      }catch(ex){if(!(ex instanceof PaymentError))throw ex;}
      if(!valid){tx.update(doc('emailOutbox',id),{state:'suppressed',version:e.version+1,suppression:'contact_or_contract_changed',updatedAt:at});return null;}
      tx.update(doc('emailOutbox',id),{state:'sending',lease,leaseUntil:at+LEASE_MS,attempts:e.attempts+1,version:e.version+1});
      tx.create(doc('emailAttempts',lease),{eventId:id,attempt:e.attempts+1,state:'sending',createdAt:at});return {...e,attempts:e.attempts+1};
    });
    if(!claim)return {state:'not_claimed'};
    let outcome;try{outcome=await send({to:claim.to,subject:claim.subject,text:claim.text,eventId:id,providerKey:claim.providerKey});}catch(_){outcome={state:'uncertain'};}
    requireCondition(outcome && ['accepted','retry','failed','uncertain'].includes(outcome.state),'DELIVERY_REVIEW','Unexpected delivery outcome.',503);
    return db.runTransaction(async(tx)=>{
      const row=await tx.get(doc('emailOutbox',id)),e=row.data();
      requireCondition(e.lease===lease && ['sending','uncertain'].includes(e.state),'DELIVERY_REVIEW','Delivery lease needs review.',409);
      const state=outcome.state==='retry' && e.attempts>=MAX_ATTEMPTS?'failed':outcome.state;
      const patch={state,messageId:outcome.messageId || null,version:e.version+1,updatedAt:now(),nextAttemptAt:now()+Math.min(3600000,60000*2**(e.attempts-1))};
      tx.update(doc('emailOutbox',id),patch);tx.update(doc('emailAttempts',lease),{state,messageId:patch.messageId,finishedAt:now()});return {state};
    });
  }
  async function reconcile(token,cmd) {
    requireCondition(cmd && Object.keys(cmd).every((k)=>['id','requestId','expectedVersion','action','reason','messageId'].includes(k)),'INVALID_COMMAND','Unsupported email decision.');
    documentId(cmd.id);documentId(cmd.requestId);requireCondition(cmd.requestId.length>=16 && ['accepted','retry_not_sent'].includes(cmd.action) && Number.isSafeInteger(cmd.expectedVersion) && typeof cmd.reason==='string' && cmd.reason.trim() && cmd.reason.length<=1000,'INVALID_COMMAND','Choose a reviewed outcome and reason.');
    if(cmd.action==='accepted')requireCondition(typeof cmd.messageId==='string' && cmd.messageId.length>0 && cmd.messageId.length<=300,'INVALID_COMMAND','Provide the verified provider message ID.');
    const actor=await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{await requireAdmin(tx,db,actor);const opId=hash(['email-reconcile',actor.uid,cmd.requestId]),op=await tx.get(doc('operationKeys',opId)),bodyHash=hash(cmd);
      if(op.exists){requireCondition(op.data().bodyHash===bodyHash,'IDEMPOTENCY_CONFLICT','Changed email decision retry.',409);return op.data().result;}
      const row=await tx.get(doc('emailOutbox',cmd.id));requireCondition(row.exists && row.data().version===cmd.expectedVersion && ['uncertain','failed'].includes(row.data().state),'STALE_EVENT','Reload this delivery before deciding.',409);
      const e=row.data();requireCondition(cmd.action!=='retry_not_sent' || e.attempts<MAX_ATTEMPTS,'ATTEMPT_LIMIT','Maximum delivery attempts reached.',409);
      const result={state:cmd.action==='accepted'?'accepted':'retry'};
      tx.update(doc('emailOutbox',cmd.id),{...result,messageId:cmd.messageId || null,nextAttemptAt:now(),version:e.version+1});
      tx.create(doc('auditLogs',opId),{action:cmd.action,eventId:cmd.id,actor:actor.uid,reason:cmd.reason,createdAt:now()});tx.create(doc('operationKeys',opId),{bodyHash,result});return result;
    });
  }
  async function reminders(token,cursor=null) {
    const actor=token===WORKER?null:await authenticate(auth,token);if(cursor)documentId(cursor);const at=now(),today=manilaDate(at);
    return db.runTransaction(async(tx)=>{
      let progress=null;if(actor)await requireAdmin(tx,db,actor);else{progress=await tx.get(doc('paymentWorkerState','reminders'));cursor=progress.exists?progress.data().cursor:null;}
      let q=db.collection('bookings').where('lifecycleEnabled','==',true).orderBy(FieldPath.documentId(),'asc');if(cursor)q=q.startAfter(cursor);
      const docs=(await tx.get(q.limit(21))).docs,staged=[];
      for(const d of docs.slice(0,20)){
        let c;try{c=await readContract(tx,db,d.id);}catch(e){if(e instanceof PaymentError)continue;throw e;}
        const m=await readLifecycle(tx,db,c.booking,d.id,at);if(!m || m.state==='needs_reconciliation' || m.deadlineSatisfied || c.booking.status!=='active')continue;
        const stage=reminderStage(m.deadlineDate,today);if(!stage)continue;
        const id=hash(['reservation-reminder',d.id,c.booking.termsVersion,m.deadlineDate,stage]);const old=await tx.get(doc('emailOutbox',id));if(old.exists)continue;
        const event={type:'reservation_reminder',bookingId:d.id,ownerBinding:c.booking.ownerBinding,bookingTermsVersion:c.booking.termsVersion,deadlineDate:m.deadlineDate,stage,createdAt:at,state:'awaiting_configuration'};
        if(await reminderCurrent(tx,db,c,event,at))staged.push({id,event,c});
      }
      for(const {id,event,c} of staged){tx.create(doc('emailOutbox',id),event);tx.create(doc('notifications',id),{type:'reservation_reminder',submissionScope:c.key,ownerBinding:c.booking.ownerBinding,createdAt:at,title:`Reservation deadline ${event.deadlineDate}`,buyerNote:'Please review the required payment. The deadline never releases a plot automatically.'});}
      if(!actor){const value={cursor:docs.length>20?docs[19].id:null,updatedAt:at};if(progress.exists)tx.update(doc('paymentWorkerState','reminders'),value);else tx.create(doc('paymentWorkerState','reminders'),value);}
      return {created:staged.length,nextCursor:docs.length>20?docs[19].id:null};
    });
  }
  async function tick() {
    const scan=await reminders(WORKER);
    const pending=await db.runTransaction(async(tx)=>{
      const progress=await tx.get(doc('paymentWorkerState','prepare'));
      let q=db.collection('emailOutbox').where('state','==','awaiting_configuration').orderBy(FieldPath.documentId(),'asc');
      if(progress.exists && progress.data().cursor)q=q.startAfter(progress.data().cursor);
      const rows=(await tx.get(q.limit(6))).docs,ids=rows.slice(0,5).map((d)=>d.id),value={cursor:rows.length>5?ids.at(-1):null,updatedAt:now()};
      if(progress.exists)tx.update(doc('paymentWorkerState','prepare'),value);else tx.create(doc('paymentWorkerState','prepare'),value);return ids;
    });
    for(const id of pending){try{await prepare(WORKER,id);}catch(e){if(!(e instanceof PaymentError))throw e;}}
    // Recover expired leases separately so they cannot consume the five-send budget.
    // Only due work is selected; dispatch rechecks each claim transactionally.
    const ids=await db.runTransaction(async(tx)=>{
      const expired=await tx.get(db.collection('emailOutbox').where('state','==','sending').where('leaseUntil','<=',now()).orderBy('leaseUntil','asc').limit(5));
      const due=[];for(const state of ['ready','retry']){const rows=await tx.get(db.collection('emailOutbox').where('state','==',state).where('nextAttemptAt','<=',now()).orderBy('nextAttemptAt','asc').limit(5));due.push(...rows.docs.map((d)=>({id:d.id,at:d.data().nextAttemptAt})));}
      return [...expired.docs.map((d)=>d.id),...due.sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id)).slice(0,5).map((d)=>d.id)];
    });
    const results=[];for(const id of ids)results.push({id,...await dispatch(id)});return {results,scan};
  }
  return {queue,prepare,dispatch,reconcile,reminders,tick};
}
function createBrevoSender({apiKey,sender,fetchFn=fetch}) {
  return async({to,subject,text,eventId,providerKey:key})=>{
    try {const response=await fetchFn('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(10000),
      headers:{'api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({sender:{email:sender,name:'Golden Harmonic'},to:[{email:to}],subject,textContent:text,headers:{'X-Payment-Event':eventId,idempotencyKey:key}})});
      if(response.status===429)return {state:'retry'};
      if(response.status>=500)return {state:'uncertain'};
      if(!response.ok)return {state:'failed'};
      const data=await response.json();return typeof data.messageId==='string'?{state:'accepted',messageId:data.messageId}:{state:'uncertain'};
    }catch(_){return {state:'uncertain'};}
  };
}
module.exports={createOutboxService,createBrevoSender,LEASE_MS,MAX_ATTEMPTS};
