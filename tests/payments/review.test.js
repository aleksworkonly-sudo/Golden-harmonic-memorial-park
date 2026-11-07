'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewFixture}=require('./review-fixture');
const {manualEconomicId}=require('../../lib/payments/identities');
const {createAccessService}=require('../../lib/payments/access');
const {createReviewService}=require('../../lib/payments/review');
const {createPaymentService}=require('../../lib/payments/service');

test('sidebar count includes all pending presale and customer proofs, beyond one page, and excludes resolved cases',async()=>{
  const f=reviewFixture(),saved=await f.submit(),base=f.db.read(`payments/${saved.paymentId}`);
  for(let i=0;i<25;i++)f.db.put(`payments/pending-${i}`,{...base,paymentId:`pending-${i}`,sourceKind:'presale',sourceId:'PS-0001'});
  for(const status of ['verified','rejected','resubmit_requested','needs_reconciliation'])
    f.db.put(`payments/${status}`,{...base,paymentId:status,status});
  f.db.put('payments/cash',{...base,paymentId:'cash',schemaVersion:5});
  f.db.put('payments/old',{...base,paymentId:'old',schemaVersion:1});
  assert.deepEqual(await f.review.pendingCount('admin'),{pending:26});
  assert.equal((await f.review.queue('admin',{status:'pending_verification'})).cases.length,20);
  await f.review.decide('admin',f.decision(saved));
  assert.deepEqual(await f.review.pendingCount('admin'),{pending:25});
  for(const uid of ['staff','buyer','unknown'])await assert.rejects(f.review.pendingCount(uid),{code:'FORBIDDEN'});
  f.db.put('users/admin',{role:'admin',disabled:true});
  await assert.rejects(f.review.pendingCount('admin'),{code:'FORBIDDEN'});
});

test('a corrected proof returns to the notification count once, without counting its revisions separately',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  assert.equal((await f.review.pendingCount('admin')).pending,1);
  const correction=await f.review.decide('admin',f.note(saved));
  assert.equal((await f.review.pendingCount('admin')).pending,0);
  const command=await f.command({requestId:'count-corrected-001',paymentId:saved.paymentId,expectedVersion:correction.version});
  await f.core.submit(f.account,command);await f.core.submit(f.account,command);
  assert.equal((await f.review.pendingCount('admin')).pending,1);
});

test('only current admins may list, inspect, fetch proof or decide; roles from tokens are ignored',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  for(const uid of ['buyer','staff','unknown','revoked']) {
    const code=uid==='revoked'?'UNAUTHENTICATED':'FORBIDDEN';
    for(const work of [()=>f.review.queue(uid),()=>f.review.detail(uid,saved.paymentId),()=>f.review.proof(uid,saved.paymentId,'r1'),()=>f.review.decide(uid,f.decision(saved))]) await assert.rejects(work(),{code});
  }
  f.db.put('users/admin',{role:'admin',disabled:true});await assert.rejects(f.review.queue('admin'),{code:'FORBIDDEN'});
});

test('actual amount approval atomically credits specified items, retains excess and preserves evidence/legacy records',async()=>{
  const f=reviewFixture(),saved=await f.submit(),before=f.db.read('customers/c1');
  const result=await f.review.decide('admin',f.decision(saved,{receivedCentavos:2600000,
    allocations:[{itemId:'item1',centavos:1000000},{itemId:'item2',centavos:1500000}],unappliedCentavos:100000}));
  const b=f.db.read('bookings/booking-c1');assert.equal(b.balanceCentavos,0);assert.equal(b.unappliedCentavos,100000);assert.equal(b.netCreditCentavos,2500000);
  assert.equal(b.status,'active');assert.equal(b.lifecycleReviewRequired,true);assert.deepEqual(f.db.read('customers/c1'),before);
  const receipt=f.db.read(`receipts/${result.receiptId}`);assert.equal(receipt.receivedCentavos,2600000);assert.equal(receipt.allocations.length,2);
  assert.equal(receipt.receivedDate,'2026-10-31');assert.equal(receipt.receivedAt,f.time-3600000);assert.equal(f.db.read(`payments/${saved.paymentId}`).status,'verified');
  assert.equal(f.db.count('paymentProofs'),1);assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,0);
  assert.equal(f.db.read(`emailOutbox/${result.receiptId}`).state,'awaiting_configuration');
  assert.equal(f.db.read('plots/c1_plot1').status,'reserved');
});

test('partial actual amount is credited once without inventing a schedule or penalty',async()=>{
  const f=reviewFixture(),saved=await f.submit();await f.review.decide('admin',f.decision(saved,{receivedCentavos:450000,allocations:[{itemId:'item2',centavos:450000}]}));
  const b=f.db.read('bookings/booking-c1');assert.equal(b.balanceCentavos,2050000);assert.equal(b.monthlyCentavos,null);assert.equal(b.nextDueDate,null);
  assert.equal(f.db.count('charges'),0);
});

test('customer and guest canonical histories use ledger credit exclusively and show unapplied money separately',async()=>{
  const f=reviewFixture();const saved=await f.submit();await f.review.decide('admin',f.decision(saved));
  f.db.put('customers/c1',{...f.db.read('customers/c1'),payments:[{amount:99999999,date:'2026-10-31'}]});
  const access=createAccessService({db:f.db,auth:f.auth,rateSecret:'test-only-secret-at-least-32-characters',now:()=>f.time});
  const view=await access.accountSummary({idToken:'buyer',customerId:'c1'});
  assert.equal(view.canonical,true);assert.equal(view.paidCentavos,500000);assert.equal(view.balanceCentavos,2000000);assert.equal(view.entries.length,2);
  const guest=await f.core.submit(f.guest,await f.command({requestId:'guest-payment-0001'}));
  await f.review.decide('admin',f.decision(guest,{requestId:'review-guest-00001',verifiedReference:'GUEST-STATEMENT'}));
  assert.equal((await access.guestSummary({secret:f.guest.secret})).paidCentavos,500000);
  f.db.put('bookings/booking-c1',{...f.db.read('bookings/booking-c1'),netCreditCentavos:1});
  await assert.rejects(access.accountSummary({idToken:'buyer',customerId:'c1'}),{code:'BOOKING_REVIEW'});
});

test('two admins, identical retries and uncertain responses cannot post twice or decrement counters twice',async()=>{
  const f=reviewFixture(),saved=await f.submit(),cmd=f.decision(saved);
  const attempts=await Promise.allSettled([f.review.decide('admin',cmd),f.review.decide('admin2',{...cmd,requestId:'other-admin-00001'})]);
  assert.equal(attempts.filter((r)=>r.status==='fulfilled').length,1);assert.equal(f.db.count('receipts'),1);
  const winner=attempts[0].status==='fulfilled'?'admin':'admin2';const retry=await f.review.decide(winner,winner==='admin'?cmd:{...cmd,requestId:'other-admin-00001'});
  assert.equal(retry.duplicate,true);assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,0);
  await assert.rejects(f.review.decide(winner,{...cmd,requestId:winner==='admin'?cmd.requestId:'other-admin-00001',reason:'Changed'}),{code:'IDEMPOTENCY_CONFLICT'});
  f.db.put(`users/${winner}`,{role:'staff'});await assert.rejects(f.review.decide(winner,cmd),{code:'FORBIDDEN'});
});

test('role removal during admin reads/decision prevents results and posting',async()=>{
  for(const operation of ['queue','detail','proof','decide']) {
    const f=reviewFixture(),saved=await f.submit();f.db.beforeCommit=(db)=>db.put('users/admin',{role:'staff'});
    await assert.rejects(operation==='queue'?f.review.queue('admin'):operation==='detail'?f.review.detail('admin',saved.paymentId):operation==='proof'?f.review.proof('admin',saved.paymentId,'r1'):f.review.decide('admin',f.decision(saved)),{code:'FORBIDDEN'});
    assert.equal(f.db.count('receipts'),0);
  }
});

test('source, plot, quote, recipient, opening balance and contract changes block posting',async()=>{
  for(const change of ['owner','mapping','plot','scope','terms','account','opening','total','legacy']) {
    const f=reviewFixture(),saved=await f.submit();
    f.db.beforeCommit=(db)=>{
      if(change==='owner')db.put('customers/c1',{...db.read('customers/c1'),authUid:'other'});
      if(change==='mapping')db.put('customers/c1',{...db.read('customers/c1'),canonicalBookingId:'elsewhere'});
      if(change==='plot')db.put('plots/c1_plot1',{...db.read('plots/c1_plot1'),paymentBookingId:'elsewhere'});
      if(change==='scope')db.put(`paymentSubmissionScopes/${f.key}`,{...db.read(`paymentSubmissionScopes/${f.key}`),version:2});
      if(change==='terms')db.put('bookings/booking-c1',{...db.read('bookings/booking-c1'),termsVersion:2});
      if(change==='account')db.put('paymentReceivingAccounts/demo-bank',{...db.read('paymentReceivingAccounts/demo-bank'),version:2});
      if(change==='opening')db.put('ledgerEntries/OPEN-c1',{...db.read('ledgerEntries/OPEN-c1'),contractCreditCentavos:9});
      if(change==='total')db.put('bookings/booking-c1',{...db.read('bookings/booking-c1'),balanceCentavos:1});
      if(change==='legacy')db.put('bookings/booking-c1',{...db.read('bookings/booking-c1'),legacyWritesBlocked:false});
    };
    await assert.rejects(f.review.decide('admin',f.decision(saved)));assert.equal(f.db.count('receipts'),0,change);
  }
});

test('correction requests do not consume proof revision allowance or expose internal reasons',async()=>{
  const f=reviewFixture(),saved=await f.submit();let version=1;
  // Exercise repeated distinct admin decisions against one immutable proof.
  for(let i=0;i<11;i++) {const result=await f.review.decide('admin',f.note({...saved,version},'request_correction',{requestId:`correction-note-${String(i).padStart(3,'0')}`}));version=result.version;}
  const corrected=await f.core.submit(f.account,await f.command({requestId:'corrected-proof-001',paymentId:saved.paymentId,expectedVersion:version,reference:'NEW-REF'}));
  assert.equal(corrected.revisionId,'r2');assert.ok(corrected.version>10);assert.equal(f.db.count('paymentProofs'),2);
  const list=await f.core.list(f.account);assert.equal(list.cases[0].evidenceRevisionCount,2);assert.equal(JSON.stringify(list).includes('Internal investigation'),false);
  assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,1);
});

test('stale approval conflicts with buyer correction and rejected retry closes once',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  await f.core.submit(f.account,await f.command({requestId:'corrected-proof-001',paymentId:saved.paymentId,expectedVersion:1}));
  await assert.rejects(f.review.decide('admin',f.decision(saved)),{code:'STALE_REVIEW'});
  const cmd=f.note({...saved,version:2,revisionId:'r2'},'reject',{noFundsConfirmed:true});
  await f.review.decide('admin',cmd);assert.equal((await f.review.decide('admin',cmd)).duplicate,true);
  assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,0);assert.equal(f.db.count('receipts'),0);
  await assert.rejects(f.core.submit(f.account,await f.command({requestId:'corrected-proof-002',paymentId:saved.paymentId,expectedVersion:3})),{code:'STALE_SUBMISSION'});
});

test('reconciliation records actual funds, protects economic identity and resolves into one receipt',async()=>{
  const f=reviewFixture(),saved=await f.submit();const cmd=f.note(saved,'reconcile',{fundsConfirmed:true,receivedCentavos:500000,receivedAt:f.time-3600000,verifiedReference:'BANK-001'});
  await f.review.decide('admin',cmd);assert.equal(f.db.read(`economicPayments/${manualEconomicId('demo-bank','BANK-001')}`).state,'held');
  assert.equal(f.db.read('bookings/booking-c1').balanceCentavos,2500000);assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,1);
  await assert.rejects(f.review.decide('admin',f.note({...saved,version:2},'reject',{requestId:'reject-held-00001',noFundsConfirmed:true})),{code:'FUNDS_REVIEW'});
  await assert.rejects(f.review.decide('admin',f.decision({...saved,version:2},{verifiedReference:'DIFFERENT'})),{code:'FUNDS_REVIEW'});
  const result=await f.review.decide('admin',f.decision({...saved,version:2}));
  assert.equal(f.db.read(`paymentReconciliations/${saved.paymentId}`).state,'resolved');assert.equal(f.db.count('receipts'),1);
  assert.equal(f.db.read(`economicPayments/${manualEconomicId('demo-bank','BANK-001')}`).receiptId,result.receiptId);
});

test('economic uniqueness uses the CP1 namespace across claims, channels and receiving versions',async()=>{
  const f=reviewFixture(),first=await f.submit();await f.review.decide('admin',f.decision(first));
  const second=await f.submit({requestId:'second-payment-001'});
  await assert.rejects(f.review.decide('admin',f.decision(second,{requestId:'second-review-0001',expectedBookingVersion:2})),{code:'DUPLICATE_PAYMENT'});
  assert.equal(f.db.count('economicPayments'),1);
  // A CP1 record checks the same permanent economic key before any write.
  f.db.put('payments/legacy',{schemaVersion:1,status:'pending_verification',version:1,bookingVersion:1,bookingId:'legacy-book',currency:'PHP',channel:'gcash',purpose:'balance',expectedAmountCentavos:500000,proofId:'legacy-proof',revisionId:'r1',receivingAccountId:'demo-bank'});
  f.db.put('bookings/legacy-book',{schemaVersion:1,postingEnabled:true,policyStatus:'approved',status:'active',currency:'PHP',version:1,totalCentavos:2500000,netCreditCentavos:0,balanceCentavos:2500000});
  f.db.put('paymentProofs/legacy-proof',{paymentId:'legacy',bookingId:'legacy-book',revisionId:'r1',validationStatus:'validated'});
  const old=createPaymentService({db:f.db,auth:f.auth,now:()=>f.time});
  await assert.rejects(old.approveManualPayment({idToken:'admin',command:{paymentId:'legacy',requestId:'legacy-review-0001',expectedVersion:1,receivedCentavos:500000,receivedAt:f.time-1,verifiedReference:' BANK-001 '}}),{code:'DUPLICATE_PAYMENT'});
});

test('wrong/duplicate/excess allocations, unsupported fields, false receipt and future time cannot post',async()=>{
  for(const change of [{allocations:[{itemId:'foreign',centavos:500000}]},{allocations:[{itemId:'item1',centavos:250000},{itemId:'item1',centavos:250000}]},
    {allocations:[{itemId:'item1',centavos:1}]},{receivedCentavos:2000000,allocations:[{itemId:'item1',centavos:2000000}]},
    {unappliedCentavos:100},{role:'admin'},{fundsConfirmed:false},{receivedAt:Date.parse('2099-01-01')}]) {
    const f=reviewFixture(),saved=await f.submit();await assert.rejects(f.review.decide('admin',f.decision(saved,change)));assert.equal(f.db.count('receipts'),0);
  }
});

test('failed commit leaves no partial ledger, receipt, outbox or budget change; retry succeeds',async()=>{
  const f=reviewFixture(),saved=await f.submit(),cmd=f.decision(saved);const budget=f.db.read('paymentProofBudget/manual'),outboxBefore=f.db.count('emailOutbox');
  f.db.failNextCommit=true;await assert.rejects(f.review.decide('admin',cmd),/Simulated/);
  assert.equal(f.db.count('receipts'),0);assert.equal(f.db.count('economicPayments'),0);assert.equal(f.db.count('emailOutbox'),outboxBefore);
  assert.equal(f.db.read('bookings/booking-c1').netCreditCentavos,0);assert.deepEqual(f.db.read('paymentProofBudget/manual'),budget);
  await f.review.decide('admin',cmd);assert.equal(f.db.count('receipts'),1);
});

test('queue applies all filters, uses stable pagination and excludes private proof payloads',async()=>{
  const f=reviewFixture(),saved=await f.submit();const p=f.db.read(`payments/${saved.paymentId}`);
  for(let i=0;i<25;i++)f.db.put(`payments/case-${i}`,{...p,paymentId:`case-${i}`,submittedAt:f.time-i*86400000});
  const filter={status:'pending_verification',channel:'bank',sourceId:'c1',from:'2026-10-01',to:'2026-10-31'};
  const first=await f.review.queue('admin',filter);assert.equal(first.cases.length,20);assert.equal(JSON.stringify(first).includes('base64'),false);
  const second=await f.review.queue('admin',filter,first.nextCursor);assert.equal(second.cases.length,6);
  assert.equal((await f.review.queue('admin',{...filter,channel:'gcash'})).cases.length,0);
  assert.equal((await f.review.queue('admin',{...filter,ageDays:24})).cases.length,1);
  await assert.rejects(f.review.queue('admin',{status:'verified'},first.nextCursor),{code:'INVALID_CURSOR'});
});

test('confirmed mismatch policy is the default; optional conservative adapter cannot silently credit mismatches',async()=>{
  const f=reviewFixture(),saved=await f.submit();const conservative=createReviewService({db:f.db,auth:f.auth,now:()=>f.time,allowActualAmount:false});
  await assert.rejects(conservative.decide('admin',f.decision(saved,{receivedCentavos:450000,allocations:[{itemId:'item1',centavos:450000}]})),{code:'AMOUNT_REQUIRES_REVIEW'});
});

test('unconfirmed reconciliation is closed atomically on approval or rejection',async()=>{
  for(const action of ['approve','reject']) {
    const f=reviewFixture(),saved=await f.submit();await f.review.decide('admin',f.note(saved,'reconcile'));
    const next={...saved,version:2};
    await f.review.decide('admin',action==='approve'?f.decision(next):f.note(next,'reject',{requestId:'terminal-review-01',noFundsConfirmed:true}));
    assert.equal(f.db.read(`paymentReconciliations/${saved.paymentId}`).state,action==='approve'?'resolved':'closed_no_funds');
    assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,0);
  }
});

test('ten own reference observations cannot hide a competing claim warning',async()=>{
  const f=reviewFixture();let current=await f.submit();
  for(let i=2;i<=10;i++)current=await f.core.submit(f.account,await f.command({requestId:`proof-revision-${String(i).padStart(3,'0')}`,paymentId:current.paymentId,expectedVersion:current.version}));
  await f.core.submit(f.guest,await f.command({requestId:'competing-claim-01'}));
  assert.equal((await f.review.detail('admin',current.paymentId)).possibleDuplicate,true);
});

test('buyer correction racing approval forces version retry without crediting stale evidence',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  f.db.beforeCommit=async()=>f.core.submit(f.account,await f.command({requestId:'racing-correction1',paymentId:saved.paymentId,expectedVersion:1,reference:'REPLACED'}));
  await assert.rejects(f.review.decide('admin',f.decision(saved)),{code:'STALE_REVIEW'});
  assert.equal(f.db.count('receipts'),0);assert.equal(f.db.read(`payments/${saved.paymentId}`).revisionId,'r2');
});
