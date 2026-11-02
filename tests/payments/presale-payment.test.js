'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {presaleFixture}=require('./presale-payment-fixture');
const {fixture}=require('./submission-fixture');
const {createPresalePaymentService,CREATION_MS}=require('../../lib/payments/presale-payment');
const {createAccessService}=require('../../lib/payments/access');
const {scopeKey}=require('../../lib/payments/submission');

test('new manual reservation atomically holds plots and provisions zero-credit canonical records',async()=>{
  const f=presaleFixture(),r=await f.core.reserve(f.input);
  assert.equal(r.ref,'PS-0001');assert.equal(r.depositCentavos,500000);assert.equal(r.deadlineDate,'2027-02-02');
  const b=f.db.read('bookings/PRESALE-PS-0001');assert.equal(b.balanceCentavos,5700000);assert.equal(b.netCreditCentavos,0);
  assert.equal(b.monthlyCentavos,null);assert.equal(b.notificationContact.enabled,false);
  assert.equal(f.db.read('plots/A_1').hold,true);assert.equal(f.db.read('plots/A_1').paymentBookingId,'PRESALE-PS-0001');
  assert.equal(f.db.read('presaleApplications/PS-0001').accessVersion,1);assert.equal(f.db.count('receipts'),0);
  assert.equal(f.db.count('ledgerEntries'),1);assert.equal(f.db.count('payments'),0);
  const options=await f.submissions.context({mode:'reservation',secret:r.secret});assert.equal(options.offers[0].payerDetailsRequired,true);
  assert.equal(options.offers[0].qrImagePath,'/payment-qr/synthetic-gcash.png');
});

test('placeholder, missing configuration, disabled gates and missing budgets cannot hold plots or show QR',async()=>{
  const f=presaleFixture();
  const realManifest=createPresalePaymentService({...f.settings,qrAssets:undefined});
  assert.deepEqual(await realManifest.availability(),{gcash:false,maya:false});
  await assert.rejects(realManifest.reserve(f.input),{code:'QR_UNAVAILABLE'});
  for(const key of ['PAYMENT_PRESALE_ENABLED','PAYMENT_SUBMISSIONS_ENABLED','PAYMENT_REVIEW_ENABLED']){
    const core=createPresalePaymentService({...f.settings,env:{...f.settings.env,[key]:'false'}});
    await assert.rejects(core.reserve(f.input),{code:'PRESALE_PAYMENT_UNAVAILABLE'});
  }
  f.db.put('paymentProofBudget/manual',{usedBytes:0,limitBytes:0});
  await assert.rejects(f.core.reserve(f.input),{code:'STORAGE_UNAVAILABLE'});
  assert.equal(f.db.count('plots'),0);assert.equal(f.db.count('bookings'),0);
});

test('verified QR is bound to the exact receiving document, version and account number',async()=>{
  for (const patch of [{accountNumber:'another-wallet'},{version:2}]) {
    const f=presaleFixture();f.db.put('paymentReceivingAccounts/test-gcash',{...f.db.read('paymentReceivingAccounts/test-gcash'),...patch});
    assert.equal((await f.core.availability()).gcash,false);
    await assert.rejects(f.core.reserve(f.input),{code:'QR_UNAVAILABLE'});
  }
  const f=presaleFixture();f.db.put('paymentReceivingAccounts/other-id',f.db.read('paymentReceivingAccounts/test-gcash'));
  const core=createPresalePaymentService({...f.settings,env:{...f.settings.env,PAYMENT_PRESALE_GCASH_ACCOUNT_ID:'other-id'}});
  assert.equal((await core.availability()).gcash,false);
  const r=await f.core.reserve(f.input);
  f.db.put('paymentReceivingAccounts/test-gcash',{...f.db.read('paymentReceivingAccounts/test-gcash'),accountNumber:'changed'});
  assert.deepEqual((await f.submissions.context({mode:'reservation',secret:r.secret})).offers,[]);
});

test('proof access binds the displayed reservation and refuses changed contact or another browser session',async()=>{
  const f=presaleFixture(),r=await f.core.reserve(f.input);
  await assert.rejects(f.submissions.context({mode:'reservation',secret:r.secret,reservationRef:'PS-0002'}),{code:'SESSION_REQUIRED'});
  await assert.rejects(f.submissions.context({mode:'reservation',secret:'z'.repeat(43),reservationRef:r.ref}),{code:'SESSION_REQUIRED'});
  f.db.put(`presaleApplications/${r.ref}`,{...f.db.read(`presaleApplications/${r.ref}`),accessVersion:2});
  await assert.rejects(f.submissions.context({mode:'reservation',secret:r.secret}),{code:'SESSION_REQUIRED'});
  await assert.rejects(f.core.reserve(f.input),{code:'RESERVATION_RECOVERY_REQUIRED'});
});

test('lost-response retries recover one hold and cannot change terms, extend expiry or revive revoked sessions',async()=>{
  const f=presaleFixture();const [a,b]=await Promise.all([f.core.reserve(f.input),f.core.reserve(f.input)]);
  assert.equal(a.ref,b.ref);assert.equal(a.secret,b.secret);assert.equal(f.db.count('bookings'),1);assert.equal(f.db.read('counters/presale').n,1);
  await assert.rejects(f.core.reserve({...f.input,name:'Changed Name'}),{code:'IDEMPOTENCY_CONFLICT'});
  f.advance(60000);const retry=await f.core.reserve(f.input);assert.equal(retry.maxAge,1740);assert.equal(retry.deadlineDate,a.deadlineDate);
  const path=`reservationSessions/${createHash('sha256').update(a.secret).digest('hex')}`;
  assert.ok(!JSON.stringify(f.db.read('presalePaymentRequests/'+createHash('sha256').update(f.input.requestId).digest('hex'))).includes(a.secret));
  f.db.put(path,{...f.db.read(path),revokedAt:f.now()});
  await assert.rejects(f.core.reserve(f.input),{code:'RESERVATION_RECOVERY_REQUIRED'});
});

test('competing buyers cannot hold the same plot; transaction failure and recipient/price races leave no partial records',async()=>{
  const f=presaleFixture();
  const results=await Promise.allSettled([f.core.reserve(f.input),f.core.reserve({...f.input,requestId:'b'.repeat(64),mobileKey:'9234567890'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.db.count('bookings'),1);
  for(const change of ['failure','price','recipient']){
    const f=presaleFixture();
    if(change==='failure')f.db.failNextCommit=true;
    else f.db.beforeCommit=db=>change==='price'?db.put('products/corner-premium',{price:48000}):db.put('paymentReceivingAccounts/test-gcash',{...db.read('paymentReceivingAccounts/test-gcash'),enabled:false});
    await assert.rejects(f.core.reserve(f.input));assert.equal(f.db.count('plots'),0);assert.equal(f.db.count('bookings'),0);assert.equal(f.db.count('reservationSessions'),0);
  }
});

test('creation session only permits proof workflow and expires; email verification restores full reservation access',async()=>{
  const f=presaleFixture(),r=await f.core.reserve(f.input),sent=[];
  const access=createAccessService({db:f.db,auth:f.auth,origin:f.settings.env.PAYMENT_ACCESS_ORIGIN,rateSecret:f.settings.env.PAYMENT_ACCESS_RATE_SECRET,now:f.now,sendLink:async(mail)=>sent.push(mail)});
  await assert.rejects(access.guestSummary({secret:r.secret}),{code:'SESSION_REQUIRED'});
  f.advance(CREATION_MS+1);
  await assert.rejects(f.submissions.context({mode:'reservation',secret:r.secret}),{code:'SESSION_REQUIRED'});
  await assert.rejects(f.core.reserve(f.input),{code:'RESERVATION_RECOVERY_REQUIRED'});
  await access.requestLink({reference:r.ref,email:f.input.email,requester:'synthetic'});
  assert.equal(sent.length,1);const token=new URL(sent[0].url).hash.slice(8);
  const session=await access.exchange({token,requester:'synthetic'});
  const summary=await access.guestSummary({secret:session.secret});assert.equal(summary.canonical,true);assert.equal(summary.lifecycle.deadlineDate,r.deadlineDate);
});

test('proof, correction and admin approval preserve holds/deadline and credit actual money exactly once',async()=>{
  const f=presaleFixture(),r=await f.core.reserve(f.input),guest={mode:'reservation',secret:r.secret};
  f.advance(60000);
  const command={...await fixture().command(),transferDate:'2026-11-02',transferTime:'12:00',payerName:'Wallet Owner',payerMobile:'09123456789'};
  await assert.rejects(f.submissions.submit(guest,{...command,payerName:undefined}),{code:'INVALID_PAYER'});
  const p=await f.submissions.submit(guest,command),bookingId='PRESALE-PS-0001';
  assert.equal(f.db.read(`bookings/${bookingId}`).netCreditCentavos,0);
  const note={paymentId:p.paymentId,requestId:'request-correction-1',expectedVersion:1,revisionId:'r1',action:'request_correction',reason:'Not readable',buyerNote:'Upload a clearer screenshot.'};
  await assert.rejects(f.review.decide('staff',note),{code:'FORBIDDEN'});
  const corrected=await f.review.decide('admin',note);assert.equal(corrected.status,'resubmit_requested');
  assert.equal(f.db.read('plots/A_1').hold,true);assert.equal(f.db.read(`bookings/${bookingId}`).deadlineDate,r.deadlineDate);
  const p2=await f.submissions.submit(guest,{...command,paymentId:p.paymentId,expectedVersion:corrected.version,requestId:'new-proof-request-2',payerName:'Corrected Wallet Owner'});
  const detail=await f.review.detail('admin',p.paymentId);assert.equal(detail.payment.payerName,'Corrected Wallet Owner');assert.equal(detail.revisions[0].payerName,'Wallet Owner');
  const approve={paymentId:p.paymentId,requestId:'approve-payment-001',expectedVersion:p2.version,revisionId:p2.revisionId,action:'approve',reason:'Statement verified',buyerNote:'Verified.',fundsConfirmed:true,
    receivedCentavos:5800000,receivedAt:f.now()-1000,verifiedReference:'ACTUAL-001',expectedBookingVersion:1,allocations:[{itemId:'item-1',centavos:5700000}],unappliedCentavos:100000};
  await f.review.decide('admin',approve);await f.review.decide('admin',approve);
  assert.equal(f.db.read(`bookings/${bookingId}`).balanceCentavos,0);assert.equal(f.db.read(`bookings/${bookingId}`).unappliedCentavos,100000);
  assert.equal(f.db.read(`bookings/${bookingId}`).lifecycle.firstInstallmentDate,'2026-12-02');
  assert.equal(f.db.count('receipts'),1);assert.equal(f.db.read('plots/A_1').hold,true);
  assert.equal(f.db.read(`paymentSubmissionScopes/${scopeKey('presale',r.ref)}`).openCases,0);
});
