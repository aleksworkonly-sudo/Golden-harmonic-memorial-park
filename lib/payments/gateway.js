'use strict';
const {authenticate,documentId,requireAdmin}=require('./auth');
const {readGuestScope}=require('./access');
const {requireCondition,PaymentError}=require('./errors');
const {centavos,addCentavos}=require('./money');
const {ownerBinding,checkBooking}=require('./canonical');
const {scopeKey}=require('./submission');
const {hash}=require('./identities');
const {preparePosting,writePosting}=require('./posting');
const {providerKey,buyerFee,checkoutUrl,sessionEvidence,sessionMatches,paymentEvidence}=require('./paymongo');
const allowed=(v,keys)=>requireCondition(v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every((k)=>keys.includes(k)), 'INVALID_COMMAND','Unsupported gateway fields.');
const validId=(v)=>typeof v==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const publicIntent=(i)=>({intentId:i.intentId,state:i.state,principalCentavos:i.principalCentavos,buyerFeeCentavos:i.buyerFeeCentavos,
  totalCentavos:i.totalCentavos,purpose:i.quote.purpose,createdAt:i.createdAt,receiptId:i.receiptId || null,
  checkoutUrl:i.state==='ready'?i.checkoutUrl:null});

function createGatewayService({db,auth,client,config,now=()=>Date.now()}) {
  const doc=(c,id)=>db.collection(c).doc(id),key=(id)=>providerKey(config.accountId,config.environment,id);
  async function identify(c) {
    requireCondition(c && ['account','reservation'].includes(c.mode),'INVALID_COMMAND','Verify account or reservation access.');
    return c.mode==='account'?{...c,identity:await authenticate(auth,c.idToken)}:c;
  }
  async function owner(tx,c) {
    if(c.mode==='reservation'){const s=await readGuestScope(tx,db,c.secret,now());return {...s,key:scopeKey(s.kind,s.id)};}
    const snap=await tx.get(doc('customers',documentId(c.customerId)));
    requireCondition(snap.exists && snap.data().authUid===c.identity.uid,'FORBIDDEN','You cannot access this account.',403);
    return {kind:'customer',id:c.customerId,data:snap.data(),actor:`uid:${c.identity.uid}`,key:scopeKey('customer',c.customerId),renew:()=>{}};
  }
  async function readIntent(tx,id) {
    const row=await tx.get(doc('paymentIntents',documentId(id))),i=row.exists?row.data():null;
    requireCondition(i && i.providerAccountId===config.accountId && i.environment===config.environment,'NOT_FOUND','Gateway attempt not found.',404);return i;
  }
  function ownerIntent(i,o) {
    requireCondition(i.submissionScope===o.key && i.sourceKind===o.kind && i.sourceId===o.id &&
      i.bookingId===o.data.canonicalBookingId && i.ownerBinding===ownerBinding(o.kind,o.data),
      'BOOKING_REVIEW','This checkout belongs to an earlier ownership or contact version. Ask the office to reconcile it.',409);
    return publicIntent(i);
  }
  async function offers(tx,o) {
    const row=await tx.get(doc('paymentSubmissionScopes',o.key)),scope=row.exists?row.data():null;
    if(!scope || scope.enabled!==true || !scope.gateway?.enabled)return {scope,offers:[]};
    requireCondition(scope.sourceKind===o.kind && scope.sourceId===o.id && scope.bookingId===o.data.canonicalBookingId &&
      !['cancelled','released'].includes(o.data.status),'BOOKING_REVIEW','The source needs office review.',409);
    const b=await tx.get(doc('bookings',documentId(scope.bookingId))),booking=b.exists?b.data():null;checkBooking(booking,o.kind,o.id,o.data);
    requireCondition(booking.gatewayEnvironment===config.environment && booking.gatewayAccountId===config.accountId &&
      booking.status==='active' && booking.policyStatus==='approved' && booking.postingEnabled===true,'BOOKING_REVIEW','Contract is not enabled for this provider environment.',409);
    const g=scope.gateway,account=await tx.get(doc('paymentReceivingAccounts',documentId(g.receivingAccountId)));
    requireCondition(account.exists && account.data().channel==='paymongo' && account.data().enabled===true && account.data().version===g.receivingAccountVersion &&
      account.data().providerAccountId===config.accountId && account.data().environment===config.environment &&
      Array.isArray(g.methods) && g.methods.length>0 && g.methods.length<=6 && g.methods.every((m)=>['card','gcash','paymaya','grab_pay','dob','qrph'].includes(m)) &&
      Array.isArray(g.offers) && g.offers.length<=8,'GATEWAY_CONFIG','Provider options need office review.',409);
    const list=g.offers.map((offer)=>{
      documentId(offer.id);centavos(offer.principalCentavos,{positive:true});
      requireCondition(offer.principalCentavos>=5000 && offer.principalCentavos<=booking.balanceCentavos && ['deposit','installment','advance','settlement'].includes(offer.purpose) &&
        Array.isArray(offer.allocations) && offer.allocations.length<=100,'GATEWAY_CONFIG','Approved provider allocation needs review.',409);
      const seen=new Set();for(const a of offer.allocations){documentId(a.itemId);centavos(a.centavos,{positive:true});const item=booking.items.find((x)=>x.itemId===a.itemId);
        requireCondition(item && !seen.has(a.itemId) && a.centavos<=item.totalCentavos-item.creditCentavos,'GATEWAY_CONFIG','Approved plot allocation needs review.',409);seen.add(a.itemId);}
      requireCondition(addCentavos(...offer.allocations.map((a)=>a.centavos))===offer.principalCentavos,'GATEWAY_CONFIG','Approved allocations must equal principal.',409);
      const fee=buyerFee(offer.principalCentavos);return {...offer,buyerFeeCentavos:fee,totalCentavos:addCentavos(offer.principalCentavos,fee)};
    });
    return {scope,booking,offers:list};
  }
  async function context(credentials) {
    const who=await identify(credentials);
    return db.runTransaction(async(tx)=>{
      const o=await owner(tx,who);const row=await tx.get(doc('paymentSubmissionScopes',o.key));const scope=row.exists?row.data():null;
      const rows=(await tx.get(db.collection('paymentIntents').where('submissionScope','==',o.key).orderBy('createdAt','desc').orderBy('intentId','desc').limit(10))).docs
        .map((d)=>d.data()).filter((i)=>i.environment===config.environment && i.providerAccountId===config.accountId);
      let next=[],blocker=null;
      if(!scope?.gatewayActiveId){try{next=(await offers(tx,o)).offers;}catch(e){if(e instanceof PaymentError)blocker=e.message;else throw e;}}
      const active=scope?.gatewayActiveId?await readIntent(tx,scope.gatewayActiveId):null;
      o.renew();return {scopeVersion:scope?.version || null,offers:next.map(({allocations,...offer})=>offer),
        active:active?ownerIntent(active,o):null,history:rows.map((i)=>ownerIntent(i,o)),blocker};
    });
  }
  async function create(credentials,input) {
    allowed(input,['requestId','offerId','scopeVersion']);documentId(input.requestId);documentId(input.offerId);
    requireCondition(input.requestId.length>=16 && Number.isSafeInteger(input.scopeVersion),'INVALID_COMMAND','Reload your provider options.');
    const who=await identify(credentials),at=now();
    const start=await db.runTransaction(async(tx)=>{
      const o=await owner(tx,who),opId=hash(['gateway-create',config.accountId,config.environment,o.key,o.actor,input.requestId]);
      const op=await tx.get(doc('operationKeys',opId)),bodyHash=hash(input);
      if(op.exists){requireCondition(op.data().bodyHash===bodyHash,'IDEMPOTENCY_CONFLICT','This request was saved with different details.',409);
        const i=await readIntent(tx,op.data().intentId);ownerIntent(i,o);o.renew();return {intent:i,send:false};}
      const c=await offers(tx,o);
      requireCondition(c.scope && c.scope.version===input.scopeVersion,'STALE_QUOTE','Reload your payment options.',409);
      if(c.scope.gatewayActiveId){const i=await readIntent(tx,c.scope.gatewayActiveId);ownerIntent(i,o);o.renew();return {intent:i,send:false};}
      requireCondition(c.scope.openCases===0,'MANUAL_REVIEW','The office must review existing cash/transfer submissions before opening another checkout.',409);
      const offer=c.offers.find((v)=>v.id===input.offerId);requireCondition(offer,'STALE_QUOTE','This provider option is no longer available.',409);
      const intentId=`GI-${opId.slice(0,32)}`,g=c.scope.gateway;
      const intent={schemaVersion:6,intentId,paymentId:intentId,submissionScope:o.key,sourceKind:o.kind,sourceId:o.id,accessMode:credentials.mode,
        providerAccountId:config.accountId,environment:config.environment,bookingId:c.scope.bookingId,bookingVersion:c.booking.version,
        bookingTermsVersion:c.booking.termsVersion,ownerBinding:ownerBinding(o.kind,o.data),scopeVersion:c.scope.version,
        quote:{channel:'paymongo',purpose:offer.purpose,receivingAccountId:g.receivingAccountId,receivingAccountVersion:g.receivingAccountVersion,expectedAmountCentavos:offer.principalCentavos},
        principalCentavos:offer.principalCentavos,buyerFeeCentavos:offer.buyerFeeCentavos,totalCentavos:offer.totalCentavos,allocations:offer.allocations,
        methods:g.methods,state:'creating',createdAt:at,updatedAt:at,proofId:null,revisionId:null,version:1};
      intent.quoteHash=hash(intent);
      tx.create(doc('paymentIntents',intentId),intent);tx.create(doc('operationKeys',opId),{bodyHash,intentId,createdAt:at});
      tx.update(doc('paymentSubmissionScopes',o.key),{gatewayActiveId:intentId,gatewayHistory:true});
      tx.create(doc('auditLogs',`gateway_create_${intentId}`),{action:'gateway_intent_created',intentId,actor:o.actor,createdAt:at});o.renew();return {intent,send:true};
    });
    if(!start.send)return publicIntent(start.intent);
    // Exactly one caller owns this external effect. Crash/timeouts never make it safe to send another create.
    try {const session=await client.create(start.intent);await attach(start.intent.intentId,session);}
    catch(_){await db.runTransaction(async(tx)=>{const i=await readIntent(tx,start.intent.intentId);if(i.state==='creating')tx.update(doc('paymentIntents',i.intentId),{state:'creation_uncertain',updatedAt:now()});});}
    // Access may expire during the external call. Reauthorize before returning a private hosted URL.
    return db.runTransaction(async(tx)=>{const o=await owner(tx,who),i=await readIntent(tx,start.intent.intentId);
      const result=ownerIntent(i,o);o.renew();return result;});
  }
  async function attach(intentId,resource,adminIdentity=null) {
    const s=sessionEvidence(resource);documentId(s.id);const url=checkoutUrl(resource.attributes?.checkout_url);
    return db.runTransaction(async(tx)=>{
      if(adminIdentity)await requireAdmin(tx,db,adminIdentity);
      const i=await readIntent(tx,intentId);
      requireCondition(sessionMatches(s,i) && (!i.sessionId || i.sessionId===s.id),'PROVIDER_MISMATCH','Session does not match the immutable checkout intent.',409);
      const binding=await tx.get(doc('providerSessionBindings',key(s.id)));
      requireCondition(!binding.exists || binding.data().intentId===intentId,'PROVIDER_MISMATCH','Session belongs to another intent.',409);
      let pi=null;if(validId(s.paymentIntentId)){pi=await tx.get(doc('providerIntentBindings',key(s.paymentIntentId)));
        requireCondition(!pi.exists || pi.data().intentId===intentId,'PROVIDER_MISMATCH','Provider intent belongs to another checkout.',409);}
      const auditRef=adminIdentity?doc('auditLogs',hash(['gateway-attach',intentId,s.id,adminIdentity.uid])):null;
      const audit=auditRef?await tx.get(auditRef):null;
      if(!binding.exists)tx.create(doc('providerSessionBindings',key(s.id)),{intentId,sessionId:s.id,createdAt:now()});
      if(validId(s.paymentIntentId) && !pi.exists)tx.create(doc('providerIntentBindings',key(s.paymentIntentId)),{intentId,createdAt:now()});
      tx.update(doc('paymentIntents',intentId),{sessionId:s.id,checkoutUrl:url,updatedAt:now(),
        ...(['creating','creation_uncertain'].includes(i.state)?{state:'ready'}:{})});
      if(auditRef && !audit.exists)tx.create(auditRef,{action:'gateway_session_recovered',intentId,sessionId:s.id,actor:adminIdentity.uid,createdAt:now()});
    });
  }

  // A verified delivery, or an authenticated provider retrieval, enters this same atomic inbox/posting path.
  async function accept(event,rawHash,{adminIdentity=null,command=null,reprocess=false}={}) {
    const at=now(),eventKey=key(event.id),a=event.attributes || {},session=a.type==='checkout_session.payment.paid'?sessionEvidence(a.data):null;
    const paid=session?session.payments.filter((p)=>p.status==='paid'):a.type==='payment.paid'?[paymentEvidence(a.data)]:[];
    const evidence=paid.length===1?paid[0]:null;
    return db.runTransaction(async(tx)=>{
      const actor=adminIdentity?await requireAdmin(tx,db,adminIdentity):{uid:'paymongo',role:'provider'};
      let operation=null,operationRef=null,bodyHash=null;
      if(command){bodyHash=hash(command);operationRef=doc('operationKeys',hash(['gateway-resolve',actor.uid,command.requestId]));operation=await tx.get(operationRef);
        if(operation.exists){requireCondition(operation.data().bodyHash===bodyHash,'IDEMPOTENCY_CONFLICT','Changed reconciliation retry.',409);return {...operation.data().result,duplicate:true};}}
      const old=await tx.get(doc('providerEvents',eventKey));
      if(old.exists){requireCondition(old.data().rawHash===rawHash,'EVENT_CONFLICT','Provider event identity changed.',409);if(!reprocess)return {...old.data().result,duplicate:true};}
      let binding=null;
      if(session?.id && validId(session.id))binding=await tx.get(doc('providerSessionBindings',key(session.id)));
      else if(validId(evidence?.paymentIntentId))binding=await tx.get(doc('providerIntentBindings',key(evidence.paymentIntentId)));
      let i=null;
      if(binding?.exists)i=await readIntent(tx,binding.data().intentId);
      // Metadata is only a hint while creation is in flight; this event cannot post before authenticated session attachment.
      const hint=session?.intentId;
      if(!i && validId(hint)){const row=await tx.get(doc('paymentIntents',hint));if(row.exists && row.data().environment===config.environment && row.data().providerAccountId===config.accountId)i=row.data();}
      const economicId=validId(evidence?.id) && evidence.id.startsWith('pay_')?key(evidence.id):null;
      const economic=economicId?await tx.get(doc('economicPayments',economicId)):null;
      const fingerprint=evidence?hash([evidence.id,evidence.amount,evidence.currency,evidence.livemode,evidence.paidAt]):null;
      let reason=null,posting=null,scope=null,linked=null,createLink=false;
      if(!economicId || evidence.status!=='paid' || evidence.currency!=='PHP' || evidence.livemode!==(config.environment==='live') ||
        !Number.isSafeInteger(evidence.amount) || evidence.amount<=0 || !Number.isSafeInteger(evidence.paidAt) || evidence.paidAt>at || evidence.paidAt<=0)reason='INVALID_PAID_EVIDENCE';
      else if(economic?.exists && (economic.data().fingerprint!==fingerprint || (i && economic.data().intentId && economic.data().intentId!==i.intentId)))reason='PAYMENT_CONFLICT';
      else if(session && (!i || !binding?.exists || !sessionMatches(session,i) || session.id!==i.sessionId))reason='UNMATCHED_SESSION';
      else if(economic?.exists && economic.data().state==='posted')linked=economic.data().receiptId;
      else if(!i || !binding?.exists || !i.sessionId || (session && (!sessionMatches(session,i) || session.id!==i.sessionId)))reason='UNMATCHED_SESSION';
      else if(evidence.amount!==i.totalCentavos || addCentavos(i.principalCentavos,i.buyerFeeCentavos)!==i.totalCentavos)reason='AMOUNT_MISMATCH';
      else if(i.state==='paid' && i.providerPaymentId!==evidence.id)reason='SECOND_PAYMENT';
      else {
        try {
          const s=await tx.get(doc('paymentSubmissionScopes',i.submissionScope));scope=s.exists?s.data():null;
          requireCondition(scope && scope.gatewayActiveId===i.intentId,'GATEWAY_REVIEW','Checkout requires reconciliation.',409);
          const b=await tx.get(doc('bookings',i.bookingId));const booking=b.exists?b.data():null;
          requireCondition(booking && booking.gatewayEnvironment===config.environment && booking.gatewayAccountId===config.accountId,
            'ENVIRONMENT_MISMATCH','Contract provider environment changed.',409);
          if(command?.action==='link_receipt') {
            const row=await tx.get(doc('receipts',documentId(command.receiptId)));const r=row.exists?row.data():null;
            requireCondition(r && ['gcash','maya','bank'].includes(r.channel) && r.bookingId===i.bookingId && r.submissionScope===i.submissionScope &&
              r.receivedCentavos===i.principalCentavos && r.receivedAt===evidence.paidAt,'RECEIPT_MISMATCH','Existing manual receipt must match contract, principal and exact received time.',409);
            const alias=await tx.get(doc('providerReceiptLinks',r.receiptId));
            requireCondition(!alias.exists || alias.data().economicId===economicId,'RECEIPT_MISMATCH','Receipt is already linked to another provider payment.',409);
            const source=await tx.get(doc(i.sourceKind==='customer'?'customers':'presaleApplications',i.sourceId));
            requireCondition(source.exists && source.data().canonicalBookingId===i.bookingId && ownerBinding(i.sourceKind,source.data())===i.ownerBinding &&
              booking.termsVersion===i.bookingTermsVersion,'BOOKING_REVIEW','Original provider ownership or terms changed.',409);
            checkBooking(booking,i.sourceKind,i.sourceId,source.data());
            linked=r.receiptId;createLink=!alias.exists;
          }else {
            requireCondition(command?.action==='post' || scope.openCases===0,'MANUAL_OVERLAP','Pending manual evidence requires admin reconciliation.',409);
            const override=command?.action==='post'?command:{};
            const cmd={receivedCentavos:i.principalCentavos,receivedAt:evidence.paidAt,verifiedReference:evidence.id,
              expectedBookingVersion:override.expectedBookingVersion || i.bookingVersion,allocations:override.allocations || i.allocations,unappliedCentavos:override.unappliedCentavos ?? 0};
            posting=await preparePosting({tx,db,p:i,scope,cmd,received:{receivingAccountId:i.quote.receivingAccountId,
              receivedCentavos:i.principalCentavos,receivedAt:evidence.paidAt,verifiedReference:evidence.id},at});
            Object.assign(posting.receipt,{economicId,providerAccountId:config.accountId,environment:config.environment,providerPaymentId:evidence.id,
              sessionId:i.sessionId,receivedCentavos:evidence.amount,principalReceivedCentavos:i.principalCentavos,buyerFeeCentavos:i.buyerFeeCentavos,
              providerFeeCentavos:Number.isSafeInteger(evidence.providerFeeCentavos)?evidence.providerFeeCentavos:null,
              providerNetCentavos:Number.isSafeInteger(evidence.netCentavos)?evidence.netCentavos:null});
          }
        }catch(e){if(e instanceof PaymentError){if(command && command.action!=='retry')throw e;reason=e.code;}else throw e;}
      }
      if(command && command.action!=='retry')requireCondition(!reason && (posting || linked) && (!command.receiptId || command.receiptId===linked),
        'GATEWAY_REVIEW','This evidence cannot be resolved through this action; retain it for investigation.',409);
      const receiptId=posting?.receipt.receiptId || linked || null,state=receiptId?'posted':'needs_reconciliation';
      const result={state,receiptId,reason,providerPaymentId:evidence?.id || null};
      const record=JSON.parse(JSON.stringify({eventId:event.id,eventKey,providerAccountId:config.accountId,environment:config.environment,type:a.type || 'unknown',rawHash,
        evidence:evidence || null,session:session || null,intentId:i?.intentId || null,state,result,createdAt:old.exists?old.data().createdAt:at,updatedAt:at}));
      // All reads precede writes. The inbox acknowledgement means this result is durable.
      if(posting)writePosting(tx,db,posting,actor);
      if(economicId && !['PAYMENT_CONFLICT','INVALID_PAID_EVIDENCE'].includes(reason) && !(economic?.exists && economic.data().state==='posted' && reason)) {
        const value={paymentId:evidence.id,providerAccountId:config.accountId,environment:config.environment,fingerprint,
          state:receiptId?'posted':'held',receiptId,intentId:i?.intentId || economic?.data()?.intentId || null,updatedAt:at};
        if(economic?.exists)tx.update(doc('economicPayments',economicId),value);else tx.create(doc('economicPayments',economicId),{...value,createdAt:at});
      }
      if(i && reason!=='PAYMENT_CONFLICT' && !['paid','linked'].includes(i.state))tx.update(doc('paymentIntents',i.intentId),{state:receiptId?(posting?'paid':'linked'):'needs_reconciliation',
        ...(receiptId?{receiptId,providerPaymentId:evidence.id}:{}),updatedAt:at});
      if(receiptId && i && scope?.gatewayActiveId===i.intentId)tx.update(doc('paymentSubmissionScopes',i.submissionScope),{gatewayActiveId:null});
      if(createLink)tx.create(doc('providerReceiptLinks',linked),{economicId,providerPaymentId:evidence.id,intentId:i.intentId,
        buyerFeeCentavos:i.buyerFeeCentavos,grossCentavos:evidence.amount,actor,reason:command.reason,createdAt:at});
      if(old.exists)tx.update(doc('providerEvents',eventKey),record);else tx.create(doc('providerEvents',eventKey),record);
      const auditId=command?hash(['gateway-decision',actor.uid,command.requestId]):hash(['gateway-event',event.id,rawHash]);
      if(!old.exists || command)tx.create(doc('auditLogs',auditId),{action:command?.action || 'provider_event',eventKey,intentId:i?.intentId || null,
        receiptId,reason:command?.reason || reason,actor,createdAt:at});
      if(posting)tx.create(doc('notifications',posting.receipt.receiptId),{type:'payment_verified',submissionScope:i.submissionScope,receiptId,createdAt:at});
      if(command)tx.create(operationRef,{bodyHash,result,actorUid:actor.uid,createdAt:at});return result;
    });
  }
  async function adminQueue(token,kind='events',cursor=null) {
    const identity=await authenticate(auth,token);requireCondition(['events','attempts'].includes(kind),'INVALID_COMMAND','Choose a queue.');
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,identity);const col=kind==='events'?'providerEvents':'paymentIntents',idField=kind==='events'?'eventKey':'intentId';
      let q=db.collection(col).where('providerAccountId','==',config.accountId).where('environment','==',config.environment).orderBy('createdAt','desc').orderBy(idField,'desc');
      if(cursor){let c;try{if(typeof cursor==='string' && cursor.length<700)c=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch(_){}
        requireCondition(c?.kind===kind && Number.isSafeInteger(c.at) && validId(c.id),'INVALID_CURSOR','Reload the provider queue.');q=q.startAfter(c.at,c.id);}
      const rows=(await tx.get(q.limit(21))).docs.map((d)=>d.data()),page=rows.slice(0,20),last=page.at(-1);
      return {rows:page.map((r)=>kind==='events'?{id:r.eventKey,eventId:r.eventId,intentId:r.intentId,state:r.state,reason:r.result.reason,amount:r.evidence?.amount,createdAt:r.createdAt}:
        {id:r.intentId,state:r.state,sourceId:r.sourceId,amount:r.totalCentavos,createdAt:r.createdAt}),nextCursor:rows.length>20?Buffer.from(JSON.stringify({kind,at:last.createdAt,id:last[idField]})).toString('base64url'):null};
    });
  }
  async function adminDetail(token,eventKey) {
    const identity=await authenticate(auth,token);
    return db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);const row=await tx.get(doc('providerEvents',documentId(eventKey)));
      requireCondition(row.exists && row.data().environment===config.environment && row.data().providerAccountId===config.accountId,'NOT_FOUND','Provider event not found.',404);
      const e=row.data(),intent=e.intentId?await readIntent(tx,e.intentId):null;
      const b=intent?await tx.get(doc('bookings',intent.bookingId)):null;return {event:e,intent:intent?{...publicIntent(intent),bookingId:intent.bookingId,sourceId:intent.sourceId}:null,
        booking:b?.exists?{version:b.data().version,items:b.data().items,balanceCentavos:b.data().balanceCentavos}:null};});
  }
  async function recover(token,input) {
    const identity=await authenticate(auth,token);allowed(input,['intentId','sessionId','expire']);documentId(input.intentId);
    const i=await db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);return readIntent(tx,input.intentId);});
    const sessionId=documentId(input.sessionId || i.sessionId);requireCondition(!i.sessionId || i.sessionId===sessionId,'PROVIDER_MISMATCH','Use the original checkout session.',409);
    const session=await client.retrieve(sessionId);requireCondition(sessionMatches(sessionEvidence(session),i),'PROVIDER_MISMATCH','Session does not match this intent.',409);
    await db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);});
    // Recovery can attach an already-created session. It never repeats the creation request.
    await attach(i.intentId,session,identity);
    let current=session;
    if(input.expire===true && session.attributes?.status!=='expired' && !sessionEvidence(session).payments.some((p)=>p.status==='paid')){
      await db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);});await client.expire(sessionId);current=await client.retrieve(sessionId);
    }
    const s=sessionEvidence(current);
    requireCondition(sessionMatches(s,i),'PROVIDER_MISMATCH','Recovered provider evidence changed.',409);
    if(s.payments.some((p)=>p.status==='paid'))return accept({id:`recover_${hash([sessionId,s.payments]).slice(0,40)}`,attributes:{type:'checkout_session.payment.paid',data:current}},hash(s),{adminIdentity:identity,reprocess:true});
    if(s.status==='expired' && s.payments.every((p)=>!['paid','pending','processing'].includes(p.status))) {
      return db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);const latest=await readIntent(tx,i.intentId);const scope=await tx.get(doc('paymentSubmissionScopes',i.submissionScope));
        requireCondition(!['paid','linked','needs_reconciliation'].includes(latest.state),'GATEWAY_REVIEW','Received or unmatched money still needs reconciliation.',409);
        const auditRef=doc('auditLogs',hash(['gateway-expired',i.intentId,sessionId]));const audit=await tx.get(auditRef);
        tx.update(doc('paymentIntents',i.intentId),{state:'expired',updatedAt:now()});
        if(scope.exists && scope.data().gatewayActiveId===i.intentId)tx.update(doc('paymentSubmissionScopes',i.submissionScope),{gatewayActiveId:null});
        if(!audit.exists)tx.create(auditRef,{action:'gateway_session_expired',intentId:i.intentId,sessionId,actor:identity.uid,createdAt:now()});
        return {state:'expired'};});
    }
    return {state:'ready'};
  }
  async function resolve(token,cmd) {
    allowed(cmd,['eventKey','requestId','action','receiptId','expectedBookingVersion','allocations','unappliedCentavos','reason','distinctConfirmed']);
    documentId(cmd.eventKey);documentId(cmd.requestId);
    requireCondition(cmd.requestId.length>=16 && ['post','link_receipt','retry'].includes(cmd.action) && typeof cmd.reason==='string' && cmd.reason.trim() && cmd.reason.length<=1000,
      'INVALID_COMMAND','Choose a reconciliation action and reason.');
    if(cmd.action==='post'){
      requireCondition(cmd.distinctConfirmed===true && Number.isSafeInteger(cmd.expectedBookingVersion) && Array.isArray(cmd.allocations) && cmd.allocations.length<=100,
        'INVALID_COMMAND','Confirm this is distinct received money and allocate principal.');centavos(cmd.unappliedCentavos);
      const seen=new Set();for(const a of cmd.allocations){allowed(a,['itemId','centavos']);documentId(a.itemId);centavos(a.centavos,{positive:true});requireCondition(!seen.has(a.itemId),'INVALID_ALLOCATION','Duplicate item.');seen.add(a.itemId);}
    }
    if(cmd.action==='link_receipt')documentId(cmd.receiptId);
    const identity=await authenticate(auth,token);const record=await db.runTransaction(async(tx)=>{await requireAdmin(tx,db,identity);
      const r=await tx.get(doc('providerEvents',cmd.eventKey));requireCondition(r.exists && r.data().providerAccountId===config.accountId && r.data().environment===config.environment,'NOT_FOUND','Event not found.',404);return r.data();});
    // Store only the sanitized evidence needed to repeat validation, never customer/card/provider secrets.
    const event=eventFromRecord(record);
    return accept(event,record.rawHash,{adminIdentity:identity,command:cmd,reprocess:true});
  }
  return {context,create,accept,adminQueue,adminDetail,recover,resolve};
}
function eventFromRecord(r) {
  const payment=(p)=>({id:p.id,type:'payment',attributes:{status:p.status,currency:p.currency,amount:p.amount,livemode:p.livemode,paid_at:p.paidAt/1000,
    fee:p.providerFeeCentavos,net_amount:p.netCentavos,payment_intent_id:p.paymentIntentId}});
  const s=r.session;return {id:r.eventId,attributes:{type:r.type,data:s?{id:s.id,type:s.type,attributes:{livemode:s.livemode,status:s.status,
    reference_number:s.reference,metadata:{intentId:s.intentId,quoteHash:s.quoteHash},line_items:s.lineItems,payment_intent:{id:s.paymentIntentId},payments:s.payments.map(payment)}}:
    r.evidence?payment(r.evidence):{}}};
}
module.exports={createGatewayService,eventFromRecord};
