'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cashFixture}=require('./cash-fixture');
const {createCashService}=require('../../lib/payments/cash');
const {cashEconomicId}=require('../../lib/payments/identities');
const {createAccessService}=require('../../lib/payments/access');

test('cash four steps preserve received time, same-admin approval, stable identity and atomic canonical credit',async()=>{
  const f=cashFixture(),saved=await f.ready();
  assert.equal(f.db.count('receipts'),0);assert.equal(f.db.read('bookings/booking-c1').balanceCentavos,2500000);
  assert.equal(f.db.read(`paymentReconciliations/${saved.paymentId}`).state,'open');
  const approved=await f.cash.mutate('admin','approve',f.approve(saved));
  assert.equal(approved.receiptId,saved.cashReceiptId);
  const receipt=f.db.read(`receipts/${approved.receiptId}`);assert.equal(receipt.receivedAt,f.record().receivedAt);
  assert.equal(receipt.recordedAt,f.time);assert.equal(receipt.revisionId,'r1');assert.equal(receipt.receivedDate,'2026-10-30');
  assert.equal(f.db.read('bookings/booking-c1').balanceCentavos,2000000);assert.equal(f.db.read('bookings/booking-c1').lifecycleReviewRequired,true);
  assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,0);
  assert.equal(f.db.read(`paymentReconciliations/${saved.paymentId}`).state,'resolved');
  assert.equal(f.db.read(`economicPayments/${cashEconomicId('office-register',f.record().officeReference)}`).state,'posted');
  assert.equal(f.db.read(`emailOutbox/${approved.receiptId}`).state,'awaiting_configuration');
  const reprint=await f.cash.mutate('admin','print',f.step(approved,{requestId:'approved-reprint-01'}));
  assert.equal(reprint.cashReceiptId,approved.receiptId);assert.equal(reprint.printStatus,'verified');assert.equal(f.db.count('receipts'),1);
});
test('cash authorization covers every read, mutation, image decode and cached retry',async()=>{
  const f=cashFixture(),saved=await f.ready();
  for(const token of ['staff','buyer','unknown','revoked']) {
    for(const work of [()=>f.cash.context(token,'customer','c1'),()=>f.cash.queue(token),()=>f.cash.detail(token,saved.paymentId),
      ()=>f.cash.proof(token,saved.paymentId,'r1'),()=>f.cash.mutate(token,'record',f.record()),()=>f.cash.mutate(token,'print',f.step(saved)),
      ()=>f.cash.mutate(token,'photo',f.step(saved,{image:'bad'})),()=>f.cash.mutate(token,'approve',f.approve(saved))])
      await assert.rejects(work(),{code:token==='revoked'?'UNAUTHENTICATED':'FORBIDDEN'});
  }
  f.db.put('users/admin',{role:'staff'});await assert.rejects(f.cash.mutate('admin','record',f.record()),{code:'FORBIDDEN'});
});
test('record retry and cash register/reference deduplication work across actors, bookings and request ids',async()=>{
  const f=cashFixture(),cmd=f.record(),saved=await f.cash.mutate('admin','record',cmd);
  assert.equal((await f.cash.mutate('admin','record',cmd)).duplicate,true);
  await assert.rejects(f.cash.mutate('admin','record',{...cmd,receivedCentavos:1}),{code:'IDEMPOTENCY_CONFLICT'});
  await assert.rejects(f.cash.mutate('admin2','record',f.record({sourceKind:'presale',sourceId:'PS-0001',requestId:'cash-other-booking1'})),{code:'DUPLICATE_PAYMENT'});
  assert.equal(f.db.count('payments'),1);assert.equal(f.db.read(`paymentReconciliations/${saved.paymentId}`).received.receivedCentavos,500000);
});
test('server rejects skipping print/photo; failed storage retains cash on hand with no credit',async()=>{
  const f=cashFixture();let p=await f.cash.mutate('admin','record',f.record());
  await assert.rejects(f.cash.mutate('admin','approve',f.approve({...p,revisionId:'r0'})),{code:'PRINT_REQUIRED'});
  await assert.rejects(f.cash.mutate('admin','photo',f.step(p,{image:(await f.command()).image})),{code:'PRINT_REQUIRED'});
  p=await f.cash.mutate('admin','print',f.step(p));
  await assert.rejects(f.cash.mutate('admin','approve',f.approve({...p,revisionId:'r0'})),{code:'PHOTO_REQUIRED'});
  f.db.put('paymentProofBudget/manual',{usedBytes:1024,limitBytes:1024});
  await assert.rejects(f.cash.mutate('admin','photo',f.step(p,{image:(await f.command()).image})),{code:'STORAGE_FULL'});
  assert.equal(f.db.read(`payments/${p.paymentId}`).status,'pending_verification');assert.equal(f.db.count('receipts'),0);
  assert.equal(f.db.read(`paymentReconciliations/${p.paymentId}`).state,'open');
});
test('print and photo retries do not consume extra identities/budget; immutable revisions survive replacement',async()=>{
  const f=cashFixture();let p=await f.cash.mutate('admin','record',f.record());const print=f.step(p);
  p=await f.cash.mutate('admin','print',print);await f.cash.mutate('admin','print',print);assert.equal(f.db.count('cashPrintEvents'),1);
  const cmd=f.step(p,{image:(await f.command()).image});p=await f.cash.mutate('admin','photo',cmd);
  const budget=f.db.read('paymentProofBudget/manual');await f.cash.mutate('admin','photo',cmd);assert.deepEqual(f.db.read('paymentProofBudget/manual'),budget);
  const first=f.db.read(`paymentProofs/${p.paymentId}_r1`);
  p=await f.cash.mutate('admin','photo',f.step(p,{image:(await f.command()).image}));
  assert.equal(p.revisionId,'r2');assert.deepEqual(f.db.read(`paymentProofs/${p.paymentId}_r1`),first);
  assert.equal((await f.cash.proof('admin',p.paymentId,'r1')).mime,'image/jpeg');
  await assert.rejects(f.cash.mutate('admin','approve',f.approve(p,{revisionId:'r1'})),{code:'PHOTO_REQUIRED'});
});
test('cash evidence type, revision, snapshot and print bindings fail closed',async()=>{
  for(const change of ['type','snapshot','print','revision']) {
    const f=cashFixture(),p=await f.ready(),path=`paymentProofs/${p.paymentId}_r1`,image=f.db.read(path);
    if(change==='type')f.db.put(path,{...image,evidenceType:'online_transfer'});
    if(change==='snapshot')f.db.put(path,{...image,snapshotHash:'wrong'});
    if(change==='print')f.db.put(`cashPrintEvents/${image.printEventId}`,{paymentId:'other',snapshotHash:image.snapshotHash});
    if(change==='revision')f.db.put(`payments/${p.paymentId}/revisions/r1`,{...f.db.read(`payments/${p.paymentId}/revisions/r1`),proofId:'wrong'});
    await assert.rejects(f.cash.mutate('admin','approve',f.approve(p)),{code:change==='print'?'PRINT_REQUIRED':'INVALID_PROOF'});
    assert.equal(f.db.count('receipts'),0);
  }
});
test('cash principal allocations retain excess, and customer/guest readers expose no internal reasons',async()=>{
  for(const guest of [false,true]) {
    const f=cashFixture(),id=guest?'PS-0001':'c1',p=await f.ready({sourceKind:guest?'presale':'customer',sourceId:id,receivedCentavos:2600000});
    const cmd=f.approve(p,{allocations:[{itemId:'item1',centavos:1000000},{itemId:'item2',centavos:1500000}],unappliedCentavos:100000});
    const a=await f.cash.mutate('admin','approve',cmd);const access=createAccessService({db:f.db,auth:f.auth,now:()=>f.time,rateSecret:"test-only-secret-at-least-32-characters"});
    const summary=guest?await access.guestSummary({secret:f.guest.secret}):await access.accountSummary({idToken:'buyer',customerId:id});
    assert.equal(summary.balanceCentavos,0);assert.equal(summary.unappliedCentavos,100000);assert.equal(summary.entries[0].reference,a.receiptId);
    const list=await f.core.list(guest?f.guest:f.account);assert.equal(list.cases[0].channel,'cash');assert.equal(JSON.stringify(list).includes(cmd.reason),false);
    await assert.rejects(f.core.submit(guest?f.guest:f.account,await f.command({paymentId:p.paymentId,expectedVersion:a.version})),{code:'STALE_SUBMISSION'});
  }
});
test('cash approval atomic failure, identical retries and competing admins create one receipt',async()=>{
  const f=cashFixture(),p=await f.ready(),cmd=f.approve(p);f.db.failNextCommit=true;
  await assert.rejects(f.cash.mutate('admin','approve',cmd),/Simulated/);assert.equal(f.db.count('receipts'),0);assert.equal(f.db.read(`paymentReconciliations/${p.paymentId}`).state,'open');
  const outcomes=await Promise.allSettled([f.cash.mutate('admin','approve',cmd),f.cash.mutate('admin2','approve',{...cmd,requestId:'cash-other-approve1'})]);
  assert.equal(outcomes.filter((r)=>r.status==='fulfilled').length,1);assert.equal(f.db.count('receipts'),1);
  assert.equal((await f.cash.mutate('admin','approve',cmd)).duplicate,true);
});
test('role/plot/source/booking changes racing cash approval retain held funds',async()=>{
  for(const change of ['role','plot','owner','terms','opening','register','legacy']) {
    const f=cashFixture(),p=await f.ready();
    f.db.beforeCommit=async()=>{
      const path=change==='role'?'users/admin':change==='plot'?'plots/c1_plot1':change==='owner'?'customers/c1':change==='register'?'paymentReceivingAccounts/office-register':change==='opening'?'ledgerEntries/OPEN-c1':'bookings/booking-c1';
      const patches={role:{role:'staff'},plot:{paymentOwnershipVersion:2},owner:{authUid:'other'},terms:{termsVersion:2},opening:{contractCreditCentavos:1},register:{version:2},legacy:{legacyWritesBlocked:false}};
      f.db.put(path,{...f.db.read(path),...patches[change]});
    };
    await assert.rejects(f.cash.mutate('admin','approve',f.approve(p)));assert.equal(f.db.count('receipts'),0);
    assert.equal(f.db.read(`paymentReconciliations/${p.paymentId}`).state,'open');
  }
});
test('photo replacement racing approval cannot credit a stale revision',async()=>{
  const f=cashFixture(),p=await f.ready();
  f.db.beforeCommit=async()=>f.cash.mutate('admin2','photo',f.step(p,{requestId:'cash-photo-race-01',image:(await f.command()).image}));
  await assert.rejects(f.cash.mutate('admin','approve',f.approve(p)),{code:'STALE_CASH'});assert.equal(f.db.count('receipts'),0);
});
test('cash queue pagination reaches older records without exposing images/collector or internal evidence',async()=>{
  const f=cashFixture(),p=await f.ready(),base=f.db.read(`payments/${p.paymentId}`);
  for(let n=0;n<525;n++)f.db.put(`payments/old-cash-${n}`,{...base,paymentId:`old-cash-${n}`,submittedAt:f.time-n*10000});
  let cursor=null,count=0;do {const page=await f.cash.queue('admin',{status:'pending_verification',sourceId:'c1'},cursor);
    assert.ok(page.cases.length<=20);assert.equal(JSON.stringify(page).includes('base64'),false);assert.equal(JSON.stringify(page).includes('collector'),false);
    count+=page.cases.length;cursor=page.nextCursor;
  }while(cursor);assert.equal(count,526);
  const first=await f.cash.queue('admin');await assert.rejects(f.cash.queue('admin',{status:'verified'},first.nextCursor),{code:'INVALID_CURSOR'});
});
test('cash caps photos, rejects invalid input and forbids editing recorded facts through approval',async()=>{
  const f=cashFixture(),p=await f.ready();
  await assert.rejects(f.cash.mutate('admin','photo',f.step(p,{image:'not an image'})),{code:'INVALID_IMAGE'});
  await assert.rejects(f.cash.mutate('admin','approve',f.approve(p,{receivedCentavos:1})),{code:'INVALID_COMMAND'});
  await assert.rejects(f.cash.mutate('admin','record',f.record({requestId:'new-cash-record-01',receivedAt:f.time+1})),{code:'INVALID_COMMAND'});
  await assert.rejects(f.cash.mutate('admin','approve',f.approve(p,{allocations:[{itemId:'item2',centavos:1}]})),{code:'INVALID_ALLOCATION'});
  f.db.put(`payments/${p.paymentId}`,{...f.db.read(`payments/${p.paymentId}`),evidenceRevisionCount:10});
  await assert.rejects(f.cash.mutate('admin','photo',f.step(p,{image:(await f.command()).image})),{code:'SUBMISSION_LIMIT'});
  const decoder=createCashService({db:f.db,auth:f.auth,decode:()=>{throw Error('must not decode');}});
  await assert.rejects(decoder.mutate('staff','photo',f.step(p,{image:'anything'})),{code:'FORBIDDEN'});
});

test('cash snapshot and receipt identities must agree with posting, held money and print evidence',async()=>{
  for(const change of ['amount','receivedAt','receipt','office','held','print','photo']) {
    const f=cashFixture(),p=await f.ready(),path=`payments/${p.paymentId}`,saved=f.db.read(path);
    if(change==='amount')f.db.put(path,{...saved,receivedCentavos:1});
    if(change==='receivedAt')f.db.put(path,{...saved,receivedAt:f.time});
    if(change==='receipt')f.db.put(path,{...saved,cashReceiptId:'CASH-other'});
    if(change==='office')f.db.put(path,{...saved,reference:'OTHER'});
    if(change==='held'){const key=`economicPayments/${saved.economicId}`;f.db.put(key,{...f.db.read(key),cashReceiptId:'other'});}
    if(change==='print'){const key=`cashPrintEvents/${saved.lastPrintEventId}`;f.db.put(key,{...f.db.read(key),cashReceiptId:'other'});}
    if(change==='photo'){const key=`paymentProofs/${saved.proofId}`;f.db.put(key,{...f.db.read(key),cashReceiptId:'other'});}
    await assert.rejects(f.cash.mutate('admin','approve',f.approve(p)),{code:change==='held'?'FUNDS_REVIEW':change==='print'?'PRINT_REQUIRED':change==='photo'?'INVALID_PROOF':'INTEGRITY_ERROR'});
    assert.equal(f.db.count('receipts'),0);
  }
});
test('admin recording retains actual cash even when the buyer already has five open cases',async()=>{
  const f=cashFixture(),path=`paymentSubmissionScopes/${f.key}`;f.db.put(path,{...f.db.read(path),openCases:5});
  const p=await f.cash.mutate('admin','record',f.record());assert.equal(f.db.read(path).openCases,6);
  assert.equal(f.db.read(`paymentReconciliations/${p.paymentId}`).state,'open');
});
