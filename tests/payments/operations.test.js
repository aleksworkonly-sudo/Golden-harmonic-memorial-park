'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const { operationsFixture }=require('./operations-fixture');
const { createOutboxService,createBrevoSender,LEASE_MS }=require('../../lib/payments/outbox');
const { candidates }=require('../../payment-ocr');
const { csv }=require('../../lib/payments/reports');
test('receipt acknowledgements use immutable as-of amounts and current account/reservation authorization',async()=>{
  const f=operationsFixture(),p=await f.paid(),r=await f.reports.receipt(f.account,p.receiptId);
  assert.equal(r.creditCentavos,500000);assert.equal(r.balanceAfterCentavos,2000000);assert.match(r.notice,/not an official/);
  await assert.rejects(f.reports.receipt({...f.account,idToken:'other'},p.receiptId),{code:'FORBIDDEN'});
  await assert.rejects(f.reports.receipt(f.guest,p.receiptId),{code:'FORBIDDEN'});
  f.db.put('bookings/booking-c1',{...f.db.read('bookings/booking-c1'),balanceCentavos:1999999});await assert.rejects(f.reports.receipt(f.account,p.receiptId),{code:'BOOKING_REVIEW'});
});
test('statement reconciles contract and ledger and reports only saved allocation snapshots',async()=>{
  const f=operationsFixture();await f.paid();f.db.put('customers/c1',{...f.db.read('customers/c1'),payments:[{ref:'OLD-001',amount:999,alloc:{agent:5,broker:3,company:2}},{ref:'NO-SNAPSHOT',amount:1000}]});
  const s=await f.reports.statement('admin','booking-c1');assert.equal(s.creditCentavos,500000);assert.equal(s.totalCentavos,2500000);
  assert.equal(s.allocationSnapshot.rows.length,1);assert.equal(s.allocationSnapshot.rows[0].agentCentavos,500);assert.equal(s.allocationSnapshot.rows[0].vatCentavos,null);
  await assert.rejects(f.reports.statement('staff','booking-c1'),{code:'FORBIDDEN'});
  f.db.put('ledgerEntries/extra',{kind:'receipt',bookingId:'booking-c1',receiptId:'extra',recordedAt:f.time,contractCreditCentavos:100});await assert.rejects(f.reports.statement('admin','booking-c1'),{code:'REPORT_REVIEW'});
});
test('collections separate gateway fees and exclude opening balances; CSV guards formula injection',async()=>{
  const f=operationsFixture();await f.create();f.pay();await f.deliver();
  const report=await f.reports.collections('admin',{from:'2026-10-30',to:'2026-10-31'});
  assert.equal(report.rows.length,1);assert.equal(report.byChannel.paymongo.creditCentavos,500000);assert.equal(report.byChannel.paymongo.grossCentavos,512500);
  assert.ok(csv([{receiptId:'=HYPERLINK("bad")'}]).includes("'=HYPERLINK"));await assert.rejects(f.reports.collections('staff',{from:'2026-10-30',to:'2026-10-31'}),{code:'FORBIDDEN'});
  f.db.put('ledgerEntries/reversal',{receiptId:'reverse',receivedDate:'2026-10-31',kind:'reversal'});await assert.rejects(f.reports.collections('admin',{from:'2026-10-31',to:'2026-10-31'}),{code:'REPORT_REVIEW'});
});
test('large reports fail explicitly instead of returning a truncated financial total',async()=>{
  const f=operationsFixture();for(let i=0;i<501;i++)f.db.put(`ledgerEntries/fill-${i}`,{receiptId:`fill-${i}`,receivedDate:'2026-10-31',kind:'opening_balance'});
  await assert.rejects(f.reports.collections('admin',{from:'2026-10-31',to:'2026-10-31'}),{code:'REPORT_TOO_LARGE'});
});

test('a linked provider receipt reports fees separately without duplicating manual principal',async()=>{
  const f=operationsFixture(),p=await f.paid();
  f.db.put(`providerReceiptLinks/${p.receiptId}`,{grossCentavos:512500,buyerFeeCentavos:12500});
  const report=await f.reports.collections('admin',{from:'2026-10-30',to:'2026-10-31'});
  assert.equal(report.rows.length,1);assert.equal(report.byChannel.bank.creditCentavos,500000);
  assert.equal(report.rows[0].linkedBuyerFeeCentavos,12500);assert.equal(report.rows[0].grossCentavos,500000);
  assert.match(report.csv,/linkedProviderGrossCentavos,linkedBuyerFeeCentavos/);
});

test('receipt ownership snapshots and unbound historical email events fail closed',async()=>{
  const f=operationsFixture(),p=await f.paid();
  f.db.put(`receipts/${p.receiptId}`,{...f.db.read(`receipts/${p.receiptId}`),ownerBinding:'uid:previous-owner'});
  await assert.rejects(f.reports.receipt(f.account,p.receiptId),{code:'BOOKING_REVIEW'});
  f.db.put(`emailOutbox/${p.receiptId}`,{...f.db.read(`emailOutbox/${p.receiptId}`),ownerBinding:null});
  await assert.rejects(f.outbox.prepare('admin',p.receiptId),{code:'EVENT_REVIEW'});assert.equal(f.sent.length,0);
});
test('notification pages order by time, are scoped, and exclude internal review notes',async()=>{
  const f=operationsFixture();for(let i=0;i<24;i++)f.db.put(`notifications/${i===23?'aaa-newest':`z-${i}`}`,{submissionScope:f.key,ownerBinding:'uid:buyer',createdAt:f.time+i,title:`Notice ${i}`,reason:'SECRET-INTERNAL'});
  const first=await f.reports.notices(f.account);assert.equal(first.rows[0].id,'aaa-newest');assert.equal(first.rows.length,20);assert.ok(first.nextCursor);
  const second=await f.reports.notices(f.account,first.nextCursor);assert.equal(second.rows.length,4);assert.equal(JSON.stringify(first).includes('SECRET-INTERNAL'),false);
  await assert.rejects(f.reports.notices(f.guest,first.nextCursor),{code:'INVALID_CURSOR'});
});
test('outbox prepares only stored verified contacts and immutable receipt template, never a caller address',async()=>{
  const f=operationsFixture(),p=await f.paid();await assert.rejects(f.outbox.prepare('staff',p.receiptId),{code:'FORBIDDEN'});
  const e=await f.outbox.prepare('admin',p.receiptId);assert.equal(e.to,'buyer@example.test');assert.match(e.text,/PHP 5000.00/);assert.match(e.text,/PHP 20000.00/);
  assert.equal((await f.outbox.prepare('admin',p.receiptId)).version,1);assert.equal(f.sent.length,0);
  f.db.put('customers/c1',{...f.db.read('customers/c1'),email:'changed@example.test'});assert.equal((await f.outbox.dispatch(p.receiptId)).state,'not_claimed');assert.equal(f.sent.length,0);assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'suppressed');
});
test('parallel dispatch claims one attempt, stores provider acceptance and never rolls back principal',async()=>{
  const f=operationsFixture(),p=await f.paid();await f.outbox.prepare('admin',p.receiptId);
  await Promise.all([f.outbox.dispatch(p.receiptId),f.outbox.dispatch(p.receiptId)]);assert.equal(f.sent.length,1);assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'accepted');assert.equal(f.db.read('bookings/booking-c1').netCreditCentavos,500000);
  assert.match(f.sent[0].providerKey,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('uncertain delivery requires audited provider investigation before identical retry',async()=>{
  const f=operationsFixture(),p=await f.paid();f.state.outcome='uncertain';await f.outbox.prepare('admin',p.receiptId);await f.outbox.dispatch(p.receiptId);await f.outbox.dispatch(p.receiptId);assert.equal(f.sent.length,1);
  const e=f.db.read(`emailOutbox/${p.receiptId}`),cmd={id:p.receiptId,requestId:'email-review-000001',expectedVersion:e.version,action:'retry_not_sent',reason:'Provider search confirmed this event was never accepted.'};
  await f.outbox.reconcile('admin',cmd);await f.outbox.reconcile('admin',cmd);f.state.outcome='accepted';await f.outbox.dispatch(p.receiptId);assert.equal(f.sent.length,2);assert.equal(f.sent[0].providerKey,f.sent[1].providerKey);
  f.db.put('users/admin',{role:'staff'});await assert.rejects(f.outbox.reconcile('admin',cmd),{code:'FORBIDDEN'});
});
test('crash after send leaves sending then uncertain rather than automatically resending',async()=>{
  const f=operationsFixture(),p=await f.paid();await f.outbox.prepare('admin',p.receiptId);
  const core=createOutboxService({db:f.db,auth:f.auth,now:()=>f.clock.time,send:async()=>{f.db.failNextCommit=true;return {state:'accepted',messageId:'accepted-before-crash'};}});
  await assert.rejects(core.dispatch(p.receiptId),/Simulated/);assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'sending');f.clock.time+=LEASE_MS+1;
  assert.equal((await f.outbox.dispatch(p.receiptId)).state,'not_claimed');assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'uncertain');assert.equal(f.sent.length,0);
});
test('explicit rate-limit rejections use bounded backoff and stop at attempt limit',async()=>{
  const f=operationsFixture(),p=await f.paid();await f.outbox.prepare('admin',p.receiptId);f.state.outcome='retry';
  for(let i=0;i<5;i++){await f.outbox.dispatch(p.receiptId);f.clock.time=f.db.read(`emailOutbox/${p.receiptId}`).nextAttemptAt;}
  assert.equal(f.sent.length,5);assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'failed');await f.outbox.dispatch(p.receiptId);assert.equal(f.sent.length,5);
});
test('reminders catch up to latest stage, suppress old stages and deduplicate every booking/deadline/stage',async()=>{
  const f=operationsFixture();assert.equal((await f.outbox.reminders('admin')).created,2);assert.equal((await f.outbox.reminders('admin')).created,0);
  const first=(await f.outbox.queue('admin')).rows.find((e)=>e.bookingId==='booking-c1');await f.outbox.prepare('admin',first.id);
  f.clock.time+=2*86400000;assert.equal((await f.outbox.reminders('admin')).created,2);await f.outbox.dispatch(first.id);assert.equal(f.db.read(`emailOutbox/${first.id}`).state,'suppressed');
  f.clock.time+=2*86400000;assert.equal((await f.outbox.reminders('admin')).created,2);assert.equal((await f.outbox.reminders('admin')).created,0);
});
test('pending proofs/open gateways and fulfilled deposits suppress reminders without releasing plots',async()=>{
  const f=operationsFixture();await f.submit();assert.equal((await f.outbox.reminders('admin')).created,1);assert.equal(f.db.read('plots/c1_plot1').status,'reserved');
  const g=operationsFixture();await g.create();assert.equal((await g.outbox.reminders('admin')).created,1);
  const full=operationsFixture();await full.paid();const second=await full.submit({requestId:'second-proof-request',reference:'BANK-002'});
  await full.review.decide('admin',full.decision(second,{requestId:'second-approval-001',expectedBookingVersion:2,verifiedReference:'BANK-002',receivedAt:full.time}));
  assert.equal((await full.outbox.reminders('admin')).created,1);assert.equal(full.db.read('plots/c1_plot1').status,'reserved');
});

test('each worker run dispatches at most five due emails and excludes future retries',async()=>{
  const f=operationsFixture(),p=await f.paid();await f.outbox.prepare('admin',p.receiptId);
  const template=f.db.read(`emailOutbox/${p.receiptId}`);
  for(let i=0;i<8;i++)f.db.put(`emailOutbox/due-${i}`,{...template,providerKey:`key-${i}`,nextAttemptAt:f.clock.time-100+i});
  f.db.put('emailOutbox/future',{...template,state:'retry',nextAttemptAt:f.clock.time+100000});
  await f.outbox.tick();assert.equal(f.sent.length,5);assert.equal(f.db.read('emailOutbox/future').state,'retry');
});
test('one invalid mapping cannot starve reminder progress or unrelated ready delivery',async()=>{
  const f=operationsFixture(),p=await f.paid();await f.outbox.prepare('admin',p.receiptId);
  f.db.put('presaleApplications/PS-0001',{...f.db.read('presaleApplications/PS-0001'),canonicalBookingId:'wrong'});
  await f.outbox.tick();assert.equal(f.db.read(`emailOutbox/${p.receiptId}`).state,'accepted');assert.ok(f.db.read('paymentWorkerState/reminders'));
});
test('Brevo sender uses fixed endpoint/text/recipient/key and separates rejection from uncertain outcome',async()=>{
  const calls=[];let status=201;const send=createBrevoSender({apiKey:'test',sender:'office@example.test',fetchFn:async(url,options)=>{calls.push({url,options});return {ok:status===201,status,json:async()=>({messageId:'known-id'})};}});
  const message={to:'buyer@example.test',subject:'Receipt',text:'Snapshot',eventId:'id',providerKey:'11111111-1111-4111-a111-111111111111'};
  assert.equal((await send(message)).state,'accepted');const b=JSON.parse(calls[0].options.body);assert.equal(b.to[0].email,message.to);assert.equal(b.headers.idempotencyKey,message.providerKey);assert.equal(b.htmlContent,undefined);
  status=429;assert.equal((await send(message)).state,'retry');status=503;assert.equal((await send(message)).state,'uncertain');status=400;assert.equal((await send(message)).state,'failed');
});
test('OCR produces bounded suggestions only and validated metadata never establishes money',async()=>{
  const list=candidates('Reference No: ABC12345\nAmount: PHP 5,000.00\n2026-10-30\nRecipient: Example Person',93.5);
  assert.equal(list.find((c)=>c.field==='amount').value,'5000.00');assert.equal(list.find((c)=>c.field==='reference').confidence,94);
  const f=operationsFixture(),p=await f.submit({claimAssistance:{source:'ocr',candidates:list}});
  assert.equal(f.db.read(`payments/${p.paymentId}`).claimAssistance.source,'ocr');assert.equal(f.db.count('receipts'),0);
  const detail=await f.review.detail('admin',p.paymentId);assert.deepEqual(detail.revisions[0].claimAssistance.candidates,list);
  await assert.rejects(f.submit({requestId:'invalid-ocr-request',claimAssistance:{source:'verified',candidates:list}}),{code:'INVALID_COMMAND'});
});
