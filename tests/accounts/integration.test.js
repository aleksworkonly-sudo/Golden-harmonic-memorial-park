'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewFixture}=require('../payments/review-fixture');
const {cashFixture}=require('../payments/cash-fixture');
const {gatewayFixture}=require('../payments/gateway-fixture');
const {accountFixture}=require('./fixture');
const {sourceKey,contactStamp}=require('../../lib/accounts/policy');
const {confirmContact}=require('../../lib/accounts/contact');
const {createDeliveryService}=require('../../lib/accounts/delivery');
const {requireBookingReader}=require('../../lib/payments/auth');

function enable(t,launch='2026-10-01T00:00:00+08:00'){
  for(const [k,v] of Object.entries({ACCOUNT_ACCESS_ENABLED:'true',ACCOUNT_INVITES_ENABLED:'true',
    ACCOUNT_INVITE_POLICY:'positive_credit',ACCOUNT_LAUNCH_AT:launch})){
    const old=process.env[k];process.env[k]=v;t.after(()=>{if(old===undefined)delete process.env[k];else process.env[k]=old;});
  }
}
test('real manual posting queues atomically once; pending/rejected/historical payments do not invite',async t=>{
  enable(t);const f=reviewFixture(),p=await f.submit();assert.equal(f.db.count('accountPaymentEvents'),0);
  f.db.failNextCommit=true;await assert.rejects(f.review.decide('admin',f.decision(p)));
  assert.equal(f.db.count('receipts'),0);assert.equal(f.db.count('accountPaymentEvents'),0);
  const r=await f.review.decide('admin',f.decision(p));await f.review.decide('admin',f.decision(p));
  assert.equal(f.db.count('accountPaymentEvents'),1);assert.equal(f.db.read('paymentSubmissionScopes/'+f.key).accountRequiredAfterReceipt,r.receiptId);
  const g=reviewFixture(),q=await g.submit();await g.review.decide('admin',g.note(q,'reject',{noFundsConfirmed:true}));
  assert.equal(g.db.count('accountPaymentEvents'),0);
  process.env.ACCOUNT_LAUNCH_AT='2026-11-26T00:00:00+08:00';
  const h=reviewFixture();await h.review.decide('admin',h.decision(await h.submit()));
  assert.equal(h.db.count('receipts'),1);assert.equal(h.db.count('accountPaymentEvents'),0);
  assert.equal(h.db.read('paymentSubmissionScopes/'+h.key).accountRequiredAfterReceipt,undefined);
});
test('cash invitation waits for approved evidence and is not duplicated by replay',async t=>{
  enable(t);const f=cashFixture(),p=await f.ready();assert.equal(f.db.count('accountPaymentEvents'),0);
  await f.cash.mutate('admin','approve',f.approve(p));await f.cash.mutate('admin','approve',f.approve(p));
  assert.equal(f.db.count('accountPaymentEvents'),1);assert.equal(f.db.count('receipts'),1);
});
test('gateway verified posting queues once and guest new checkout requires an account',async t=>{
  enable(t);const f=gatewayFixture(),i=await f.gateway.create(f.guest,f.gatewayCommand());
  assert.equal(f.db.count('accountPaymentEvents'),0);f.pay();await f.deliver();await f.deliver();
  assert.equal(f.db.count('accountPaymentEvents'),1);assert.equal(f.db.count('receipts'),1);
  assert.equal((await f.gateway.create(f.guest,f.gatewayCommand())).intentId,i.intentId);
  assert.deepEqual((await f.gateway.context(f.guest)).offers,[]);
  await assert.rejects(f.gateway.create(f.guest,f.gatewayCommand({requestId:'next-gateway-account'})),{code:'ACCOUNT_REQUIRED'});
  const s={kind:'presale',id:'PS-0001'},data=f.db.read('presaleApplications/'+s.id),key=sourceKey(s);
  f.db.put('portalAccess/'+key,{uid:'buyer',kind:s.kind,sourceId:s.id,bookingId:data.canonicalBookingId,contactStamp:contactStamp(data),status:'active'});
  const next=await f.gateway.create({mode:'account',idToken:'buyer',source:s},f.gatewayCommand({requestId:'next-gateway-account'}));
  assert.notEqual(next.intentId,i.intentId);assert.equal(f.db.count('receipts'),1);
});
test('mandatory activation preserves corrections and retries of existing guest evidence',async()=>{
  const f=reviewFixture(),cmd=await f.command(),p=await f.core.submit(f.guest,cmd);
  f.db.put('paymentSubmissionScopes/'+f.guestKey,{...f.db.read('paymentSubmissionScopes/'+f.guestKey),accountRequiredAfterReceipt:'recorded'});
  assert.equal((await f.core.submit(f.guest,cmd)).paymentId,p.paymentId);
  const corrected=await f.core.submit(f.guest,await f.command({requestId:'correct-existing-001',paymentId:p.paymentId,expectedVersion:1}));
  assert.equal(corrected.paymentId,p.paymentId);assert.equal(corrected.version,2);
  await assert.rejects(f.core.submit(f.guest,await f.command({requestId:'new-after-first-001'})),{code:'ACCOUNT_REQUIRED'});
});
test('audited contact confirmation invalidates old invites and guest links even after changing back',async()=>{
  const f=await accountFixture(),{inviteId}=await f.issue();
  const base={db:f.db,identity:{uid:'admin'},source:f.source,reason:'Buyer identity checked in office',confirmed:true,env:f.env,at:f.now()};
  await assert.rejects(confirmContact({...base,identity:{uid:'buyer'},expectedVersion:0,email:f.input.email}),{code:'FORBIDDEN'});
  const before=f.db.read('bookings/'+f.receipt.bookingId);
  await confirmContact({...base,expectedVersion:0,email:'corrected@example.test'});
  await assert.rejects(f.claims.context('buyer',inviteId));
  await confirmContact({...base,expectedVersion:1,email:f.input.email});
  await assert.rejects(f.submissions.context({mode:'reservation',secret:f.reservation.secret}),{code:'SESSION_REQUIRED'});
  await assert.rejects(f.core.reserve(f.input),{code:'RESERVATION_RECOVERY_REQUIRED'});
  await assert.rejects(confirmContact({...base,expectedVersion:0,email:f.input.email}),{code:'CONTACT_CHANGED'});
  const b=f.db.read('bookings/'+f.receipt.bookingId);assert.equal(b.ownerBinding,before.ownerBinding);assert.equal(b.balanceCentavos,before.balanceCentavos);
  await f.claim();await assert.rejects(confirmContact({...base,expectedVersion:2,email:f.input.email}),{code:'ACCOUNT_REVIEW'});
  assert.equal([...f.db.records].filter(([p,r])=>p.startsWith('auditLogs/') && r.action==='account_contact_confirmed').length,2);
});
test('office contact correction and resend recheck roles at commit',async()=>{
  const f=await accountFixture(),i=await f.issue();
  const service=createDeliveryService({db:f.db,auth:f.auth,env:f.env,now:f.now,link:async()=> 'https://example.test/link',send:async()=>({state:'accepted'})});
  await service.dispatch(i.inviteId);f.advance(61000);
  f.db.beforeCommit=()=>f.db.put('users/admin',{role:'staff'});
  await assert.rejects(service.resend(i.inviteId,{uid:'admin'}),{code:'FORBIDDEN'});
  assert.equal(f.db.read('accountDeliveryEvents/'+i.inviteId).state,'accepted');
  f.db.put('users/admin',{role:'admin'});f.db.beforeCommit=()=>f.db.put('users/admin',{role:'staff'});
  await assert.rejects(confirmContact({db:f.db,identity:{uid:'admin'},source:f.source,email:f.input.email,expectedVersion:0,
    reason:'Verified by office',confirmed:true,env:f.env,at:f.now()}),{code:'FORBIDDEN'});
});
test('new delivery cannot starve old retries or expired leases; repeated setup keeps a valid invite',async()=>{
  const f=await accountFixture(),i=await f.issue();assert.equal((await f.issue()).inviteId,i.inviteId);
  f.db.put('accountDeliveryEvents/'+i.inviteId,{inviteId:i.inviteId,state:'retry',attempts:1,nextAttemptAt:f.now()-1000,createdAt:f.now()-10000});
  for(let n=0;n<8;n++)f.db.put('accountDeliveryEvents/queued-'+n,{inviteId:'queued-'+n,state:'queued',attempts:0,nextAttemptAt:f.now(),createdAt:f.now()});
  f.db.put('accountDeliveryEvents/expired',{state:'sending',leaseUntil:f.now()-1,attempts:1});
  let sends=0;const service=createDeliveryService({db:f.db,auth:f.auth,env:f.env,now:f.now,
    link:async()=> 'https://example.test/link',send:async()=>{sends++;return {state:'accepted'};}});
  await service.tick({batchSize:1});assert.equal(sends,1);
  assert.equal(f.db.read('accountDeliveryEvents/expired').state,'uncertain');
  assert.equal(f.db.read('accountDeliveryEvents/'+i.inviteId).state,'accepted');
});
test('legacy booking readers cannot fall back past revoked account decisions',async()=>{
  const f=reviewFixture(),s={kind:'customer',id:'c1'};
  f.db.put('portalAccess/'+sourceKey(s),{uid:'buyer',status:'revoked'});
  for(const b of [f.db.read('bookings/booking-c1'),{customerId:'c1'}])
    await assert.rejects(f.db.runTransaction(tx=>requireBookingReader(tx,f.db,{uid:'buyer'},b)),{code:'FORBIDDEN'});
});
test('transient Firestore errors preserve queued delivery instead of suppressing the invitation',async()=>{
  const f=await accountFixture(),i=await f.issue(),original=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=callback=>original(tx=>{
    const get=tx.get.bind(tx);tx.get=ref=>{
      if(ref.path==='presaleApplications/'+f.source.id)throw Object.assign(Error('database unavailable'),{code:14});
      return get(ref);
    };return callback(tx);
  });
  const service=createDeliveryService({db:f.db,auth:f.auth,env:f.env,now:f.now,
    link:async()=> 'https://example.test/link',send:async()=>({state:'accepted'})});
  await assert.rejects(service.dispatch(i.inviteId),{code:14});
  assert.equal(f.db.read('accountDeliveryEvents/'+i.inviteId).state,'queued');
  f.db.runTransaction=original;assert.equal((await service.dispatch(i.inviteId)).state,'accepted');
});
