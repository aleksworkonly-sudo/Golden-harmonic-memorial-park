'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {gatewayFixture}=require('./gateway-fixture');
const {providerKey,buyerFee,createPaymongoClient}=require('../../lib/payments/paymongo');
const {hash}=require('../../lib/payments/identities');
test('checkout return rechecks booking mapping changed during the provider request',async()=>{
  const f=gatewayFixture(),create=f.client.create;
  f.client.create=async(i)=>{const result=await create(i);f.db.put('customers/c1',{...f.db.read('customers/c1'),canonicalBookingId:'replacement-booking'});return result;};
  await assert.rejects(f.create(),{code:'BOOKING_REVIEW'});assert.equal(f.state.creates,1);
});
test('admin recovery and expiration retain idempotent audit evidence',async()=>{
  const f=gatewayFixture();f.state.timeout=true;const i=await f.create();
  await f.gateway.recover('admin',{intentId:i.intentId,sessionId:'cs_1'});
  await f.gateway.recover('admin',{intentId:i.intentId,expire:true});
  await f.gateway.recover('admin',{intentId:i.intentId,expire:true});
  assert.equal(f.db.read(`auditLogs/${hash(['gateway-attach',i.intentId,'cs_1','admin'])}`).action,'gateway_session_recovered');
  assert.equal(f.db.read(`auditLogs/${hash(['gateway-expired',i.intentId,'cs_1'])}`).action,'gateway_session_expired');
});
test('authorized account/guest quotes derive principal, exact 2.5% fee and allocations server-side',async()=>{
  const f=gatewayFixture();assert.equal(buyerFee(500001),12500);assert.equal(buyerFee(5020),126);
  const c=await f.gateway.context(f.account);assert.equal(c.offers[0].totalCentavos,512500);assert.equal(c.offers[0].allocations,undefined);
  const guest=await f.gateway.create(f.guest,f.gatewayCommand());assert.equal(guest.state,'ready');
  await assert.rejects(f.gateway.create(f.account,{...f.gatewayCommand(),amount:1}),{code:'INVALID_COMMAND'});
  await assert.rejects(f.gateway.create({...f.account,idToken:'other'},f.gatewayCommand()),{code:'FORBIDDEN'});
  await assert.rejects(f.gateway.context({...f.guest,secret:'q'.repeat(43)}),{code:'SESSION_REQUIRED'});
  const b='bookings/booking-c1';f.db.put(b,{...f.db.read(b),gatewayEnvironment:'live'});await assert.rejects(f.create(),{code:'BOOKING_REVIEW'});
});
test('concurrent and changed retries create one provider session; open attempts are reused',async()=>{
  const f=gatewayFixture();const all=await Promise.all([f.create(),f.create(),f.create({requestId:'different-request-01'})]);
  assert.equal(f.state.creates,1);assert.equal(new Set(all.map((i)=>i.intentId)).size,1);
  await assert.rejects(f.create({offerId:'changed'}),{code:'IDEMPOTENCY_CONFLICT'});assert.equal((await f.create()).state,'ready');
});
test('timeout/crash remains uncertain without blind recreation; admin recovers by verified session',async()=>{
  const f=gatewayFixture();f.state.timeout=true;const i=await f.create();assert.equal(i.state,'creation_uncertain');
  assert.equal((await f.create({requestId:'new-request-00001'})).intentId,i.intentId);assert.equal(f.state.creates,1);
  await assert.rejects(f.gateway.recover('staff',{intentId:i.intentId,sessionId:'cs_1'}),{code:'FORBIDDEN'});
  await f.gateway.recover('admin',{intentId:i.intentId,sessionId:'cs_1'});assert.equal((await f.gateway.context(f.account)).active.state,'ready');
  const s=f.state.sessions.get('cs_1');s.attributes.metadata.quoteHash='wrong';await assert.rejects(f.gateway.recover('admin',{intentId:i.intentId,sessionId:'cs_1'}),{code:'PROVIDER_MISMATCH'});
});
test('paid event atomically posts principal and separates buyer fee from provider fees',async()=>{
  const f=gatewayFixture(),i=await f.create();f.pay();const result=await f.deliver();assert.equal(result.state,'posted');
  const r=f.db.read(`receipts/${result.receiptId}`);assert.equal(r.receivedCentavos,512500);assert.equal(r.contractCreditCentavos,500000);assert.equal(r.buyerFeeCentavos,12500);
  assert.equal(r.providerFeeCentavos,10000);assert.equal(r.providerNetCentavos,502500);assert.equal(r.receivedAt,f.time-3600000);
  assert.equal(f.db.read('bookings/booking-c1').balanceCentavos,2000000);assert.equal(f.db.read('bookings/booking-c1').status,'active');
  assert.equal(f.db.read(`paymentIntents/${i.intentId}`).state,'paid');assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).gatewayActiveId,null);
  assert.equal(f.db.read(`emailOutbox/${result.receiptId}`).state,'awaiting_configuration');assert.equal(f.db.read('customers/c1').payments.length,0);
});
test('same event, concurrent distinct events and both paid event types share one economic receipt',async()=>{
  const f=gatewayFixture();await f.create();f.pay();const e=f.event();
  await Promise.all([f.deliver(e),f.deliver(e),f.deliver(f.event('evt_second','payment.paid'))]);assert.equal(f.db.count('receipts'),1);
  await f.deliver(f.event('evt_third'));assert.equal(f.db.count('receipts'),1);
  const changed=structuredClone(e);changed.attributes.data.attributes.reference_number='tampered';await assert.rejects(f.deliver(changed),{code:'EVENT_CONFLICT'});
});
test('unmatched, wrong amount/currency/environment and missing payment identities are durable exceptions',async()=>{
  for(const change of ['amount','currency','environment','id','time','session']) {
    const f=gatewayFixture();await f.create();f.pay(change==='session'?'cs_1':'cs_1',change==='amount'?{amount:1}:change==='currency'?{currency:'USD'}:change==='environment'?{livemode:true}:change==='time'?{paid_at:null}:{});
    const e=f.event();if(change==='id')e.attributes.data.attributes.payments[0].id='';if(change==='session')e.attributes.data.id='cs_unmatched';
    const result=await f.deliver(e);assert.equal(result.state,'needs_reconciliation');assert.equal(f.db.count('receipts'),0);assert.equal(f.db.count('providerEvents'),1);
  }
});
test('webhook before creation attachment is retained then recovered without creating a new session',async()=>{
  const f=gatewayFixture();f.state.timeout=true;const i=await f.create();f.pay();assert.equal((await f.deliver()).state,'needs_reconciliation');
  const result=await f.gateway.recover('admin',{intentId:i.intentId,sessionId:'cs_1'});assert.equal(result.state,'posted');assert.equal(f.state.creates,1);assert.equal(f.db.count('receipts'),1);
});
test('changed source, plot, contract, receiving config and test/live booking changes retain money',async()=>{
  for(const change of ['owner','plot','version','environment','account','scope']) {
    const f=gatewayFixture();await f.create();f.pay();const paths={owner:'customers/c1',plot:'plots/c1_plot1',version:'bookings/booking-c1',environment:'bookings/booking-c1',account:'paymentReceivingAccounts/paymongo-test',scope:`paymentSubmissionScopes/${f.key}`};
    const patches={owner:{authUid:'other'},plot:{paymentOwnershipVersion:2},version:{version:2},environment:{gatewayEnvironment:'live'},account:{version:2},scope:{version:2}};
    const path=paths[change];f.db.put(path,{...f.db.read(path),...patches[change]});assert.equal((await f.deliver()).state,'needs_reconciliation');assert.equal(f.db.count('receipts'),0);
  }
});
test('failed event commit has no partial money or acknowledgement; identical retry succeeds',async()=>{
  const f=gatewayFixture();await f.create();f.pay();f.db.failNextCommit=true;await assert.rejects(f.deliver(),/Simulated/);
  assert.equal(f.db.count('receipts'),0);assert.equal(f.db.count('providerEvents'),0);assert.equal((await f.deliver()).state,'posted');
});
test('manual overlap holds gateway and blocks manual approval; admin can explicitly post distinct money',async()=>{
  const f=gatewayFixture();await f.create();const manual=await f.submit();f.pay();const e=f.event();assert.equal((await f.deliver(e)).reason,'MANUAL_OVERLAP');
  await assert.rejects(f.review.decide('admin',f.decision(manual)),{code:'GATEWAY_REVIEW'});
  const cmd=f.resolve(e);await assert.rejects(f.gateway.resolve('staff',cmd),{code:'FORBIDDEN'});
  const result=await f.gateway.resolve('admin',cmd);assert.equal(result.state,'posted');assert.equal((await f.gateway.resolve('admin',cmd)).duplicate,true);
  assert.equal(f.db.count('receipts'),1);
  await assert.rejects(f.review.decide('admin',f.decision(manual,{requestId:'manual-after-gw-01',expectedBookingVersion:2})),{code:'GATEWAY_REVIEW'});
  await f.review.decide('admin',f.decision(manual,{requestId:'manual-distinct-01',expectedBookingVersion:2,gatewayReviewed:true}));assert.equal(f.db.count('receipts'),2);
});
test('linking a proven previous manual receipt adds no second ledger credit and reserves provider identity',async()=>{
  const f=gatewayFixture();await f.create();const manual=await f.submit();
  // Simulates an already-posted receipt from a reconciled migration; CP6 itself blocks this legacy bypass.
  const scopePath=`paymentSubmissionScopes/${f.key}`,scope=f.db.read(scopePath);f.db.put(scopePath,{...scope,gatewayActiveId:null});
  const posted=await f.review.decide('admin',f.decision(manual,{gatewayReviewed:true}));f.db.put(scopePath,{...f.db.read(scopePath),gatewayActiveId:scope.gatewayActiveId});
  f.pay();const e=f.event();assert.equal((await f.deliver(e)).state,'needs_reconciliation');
  const cmd=f.resolve(e,{action:'link_receipt',receiptId:posted.receiptId});const result=await f.gateway.resolve('admin',cmd);
  assert.equal(result.receiptId,posted.receiptId);assert.equal(f.db.count('receipts'),1);assert.equal(f.db.count('providerReceiptLinks'),1);
  assert.equal((await f.deliver(f.event('evt_later','payment.paid'))).receiptId,posted.receiptId);
});
test('admin recovery requires confirmed provider expiry before replacement; active paid session cannot expire',async()=>{
  const f=gatewayFixture(),i=await f.create();await f.gateway.recover('admin',{intentId:i.intentId,expire:true});
  assert.equal((await f.gateway.context(f.account)).active,null);const next=await f.create({requestId:'new-after-expiry-01'});assert.notEqual(next.intentId,i.intentId);
  f.pay('cs_2');assert.equal((await f.gateway.recover('admin',{intentId:next.intentId,expire:true})).state,'posted');assert.equal(f.db.count('receipts'),1);
});

test('every customer checkout return rejects a changed owner or reservation contact binding',async()=>{
  const f=gatewayFixture();await f.create();const path='customers/c1';f.db.put(path,{...f.db.read(path),authUid:'new-buyer'});
  await assert.rejects(f.gateway.context({...f.account,idToken:'new-buyer'}),{code:'BOOKING_REVIEW'});
  await assert.rejects(f.gateway.create({...f.account,idToken:'new-buyer'},f.gatewayCommand()),{code:'BOOKING_REVIEW'});
  const g=gatewayFixture();await g.gateway.create(g.guest,g.gatewayCommand());const gp='presaleApplications/PS-0001';g.db.put(gp,{...g.db.read(gp),accessVersion:2});
  await assert.rejects(g.gateway.context(g.guest),{code:'SESSION_REQUIRED'});
});
test('a paid payment ID cannot attach a second checkout to the first receipt',async()=>{
  const f=gatewayFixture();await f.create();f.pay();await f.deliver();const first=f.db.read('bookings/booking-c1').balanceCentavos;
  const second=await f.gateway.create(f.guest,f.gatewayCommand({requestId:'other-source-00001'}));f.pay('cs_2');
  const result=await f.deliver(f.event('evt_second_session','checkout_session.payment.paid','cs_2'));assert.equal(result.reason,'PAYMENT_CONFLICT');
  assert.equal(f.db.read(`paymentIntents/${second.intentId}`).state,'ready');assert.equal(f.db.count('receipts'),1);assert.equal(f.db.read('bookings/booking-c1').balanceCentavos,first);
});
test('malformed signed paid evidence cannot poison later valid economic identity',async()=>{
  const f=gatewayFixture();await f.create();f.pay('cs_1',{paid_at:null});assert.equal((await f.deliver()).reason,'INVALID_PAID_EVIDENCE');assert.equal(f.db.count('economicPayments'),0);
  f.pay();assert.equal((await f.deliver(f.event('evt_fixed'))).state,'posted');assert.equal(f.db.count('receipts'),1);
});
test('admin retry keeps its request, actor and reason when it resolves an existing event',async()=>{
  const f=gatewayFixture();f.state.timeout=true;const intent=await f.create();f.pay();const e=f.event();await f.deliver(e);
  // Attach the known session through recovery without its payment, then retry the saved signed evidence.
  const s=f.state.sessions.get('cs_1'),payments=s.attributes.payments;s.attributes.payments=[];
  await f.gateway.recover('admin',{intentId:intent.intentId,sessionId:'cs_1'});s.attributes.payments=payments;
  const cmd=f.resolve(e,{action:'retry'});assert.equal((await f.gateway.resolve('admin',cmd)).state,'posted');assert.equal((await f.gateway.resolve('admin',cmd)).duplicate,true);
  const audit=[...f.db.records].find(([k,v])=>k.startsWith('auditLogs/') && v.action==='retry');assert.equal(audit[1].reason,cmd.reason);assert.equal(audit[1].actor.uid,'admin');
});
test('provider queue is bounded, private and paginated; role loss blocks admin resolution at commit',async()=>{
  const f=gatewayFixture();await f.create();f.pay();await f.deliver();
  await assert.rejects(f.gateway.adminQueue('buyer'),{code:'FORBIDDEN'});
  const queue=await f.gateway.adminQueue('admin');assert.equal(JSON.stringify(queue).includes('checkoutUrl'),false);
  assert.equal((await f.gateway.adminDetail('admin',queue.rows[0].id)).event.state,'posted');
  const g=gatewayFixture();await g.create();await g.submit();g.pay();const e=g.event();await g.deliver(e);
  g.db.beforeCommit=async()=>g.db.put('users/admin',{role:'staff'});await assert.rejects(g.gateway.resolve('admin',g.resolve(e)),{code:'FORBIDDEN'});
});
test('provider client sends server quote and trusted returns; no fee pass-on or automatic POST retry',async()=>{
  const f=gatewayFixture(),saved=await f.create(),i=f.db.read(`paymentIntents/${saved.intentId}`);const calls=[];
  const client=createPaymongoClient({secretKey:'sk_test_fake_key',origin:f.config.origin,fetchFn:async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>JSON.stringify({data:f.state.sessions.get('cs_1')})};}});
  await client.create(i);const body=JSON.parse(calls[0].options.body).data.attributes;
  assert.equal(body.line_items[1].amount,12500);assert.equal(body.send_email_receipt,false);assert.equal(body.pass_on_fees,undefined);assert.ok(body.success_url.startsWith(f.config.origin));
  assert.equal(body.billing,undefined);assert.equal(calls.length,1);
});
