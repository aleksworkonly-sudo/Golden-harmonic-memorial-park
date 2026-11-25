'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {remainingBalanceFixture}=require('./remaining-balance-fixture');
const {scopeKey}=require('../../lib/payments/submission');

test('email access offers verified GCash after deposit, accepts partial payment and recalculates after approval',async()=>{
  const f=await remainingBalanceFixture();
  const session=await f.access.exchange({token:f.token,requester:'synthetic-balance'});
  const guest={mode:'reservation',secret:session.secret};
  const summary=await f.access.guestSummary({secret:session.secret});
  assert.equal(summary.balanceCentavos,1900000);assert.equal(summary.paidCentavos,300000);
  const scopePath='paymentSubmissionScopes/'+scopeKey('presale',f.reservation.ref);
  const original=f.db.read(scopePath);
  const context=await f.submissions.context(guest),offer=context.offers[0];
  assert.equal(offer.id,'remaining-balance');assert.equal(offer.channel,'gcash');
  assert.equal(offer.expectedAmountCentavos,1900000);assert.equal(offer.maxAmountCentavos,1900000);
  assert.equal(offer.allowPartial,true);assert.equal(offer.qrImagePath,'/payment-qr/synthetic-gcash.png');
  assert.deepEqual(f.db.read(scopePath),original); // Existing scopes require no migration.
  const command={...f.command,offerId:offer.id,requestId:'remaining-partial-001',claimedCentavos:500000,reference:'PARTIAL-5000'};
  const partial=await f.submissions.submit(guest,command);
  assert.equal(f.db.read('payments/'+partial.paymentId).mismatch,false);
  assert.equal((await f.access.guestSummary({secret:session.secret})).balanceCentavos,1900000);
  await assert.rejects(f.submissions.submit(guest,{...command,requestId:'another-partial-001'}),{code:'EXISTING_SUBMISSION'});
  const correction=await f.review.decide('admin',{paymentId:partial.paymentId,requestId:'correct-partial-001',expectedVersion:partial.version,
    revisionId:partial.revisionId,action:'request_correction',reason:'Image unclear',buyerNote:'Send clearer proof.'});
  const revised=await f.submissions.submit(guest,{...command,requestId:'revised-partial-001',paymentId:partial.paymentId,expectedVersion:correction.version});
  await f.approve(revised,500000,'PARTIAL-5000');
  assert.equal((await f.submissions.context(guest)).offers[0].maxAmountCentavos,1400000);
  assert.equal((await f.submissions.submit(guest,command)).duplicate,true);
  await assert.rejects(f.submissions.submit(guest,{...command,requestId:'stale-balance-001',claimedCentavos:1900000}),{code:'STALE_QUOTE'});
  const final=await f.submissions.submit(guest,{...command,requestId:'final-balance-001',claimedCentavos:1400000,reference:'FINAL-14000'});
  await f.approve(final,1400000,'FINAL-14000');
  assert.equal((await f.access.guestSummary({secret:session.secret})).balanceCentavos,0);
  assert.deepEqual((await f.submissions.context(guest)).offers,[]);
  assert.equal((await f.submissions.context(guest)).settled,true);
  assert.equal(f.db.count('receipts'),3);
});

test('remaining payment respects recipient verification, booking identity, closure and source access',async()=>{
  for(const change of ['disabled','version','qr','closed','binding','access']){
    const f=await remainingBalanceFixture(),guest={mode:'reservation',secret:f.reservation.secret};
    const account='paymentReceivingAccounts/test-gcash',booking='bookings/PRESALE-PS-0001';
    if(change==='disabled')f.db.put(account,{...f.db.read(account),enabled:false});
    if(change==='version')f.db.put(account,{...f.db.read(account),version:2});
    if(change==='qr')f.db.put(account,{...f.db.read(account),qrVerified:false});
    if(change==='closed')f.db.put(booking,{...f.db.read(booking),status:'cancelled'});
    if(change==='binding')f.db.put(booking,{...f.db.read(booking),sourceId:'someone-else'});
    if(change==='access')f.db.put('presaleApplications/PS-0001',{...f.db.read('presaleApplications/PS-0001'),accessVersion:2});
    if(['binding','access'].includes(change))await assert.rejects(f.submissions.context(guest));
    else assert.deepEqual((await f.submissions.context(guest)).offers,[]);
  }
});
