'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewFixture}=require('./review-fixture');
const {adminRecord}=require('../../lib/payments/admin-records');
const {deriveLifecycle}=require('../../lib/payments/lifecycle-model');
const {newInstallment}=require('../../lib/payments/new-installment');

test('admin records recover existing verified payments without copying or double counting on approval retries',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  const args={db:f.db,auth:f.auth,token:'admin',kind:'customer',id:'c1',now:f.time};
  assert.equal((await adminRecord(args)).paid,0);
  const command=f.decision(saved,{receivedCentavos:300000,allocations:[{itemId:'item1',centavos:300000}]});
  await f.review.decide('admin',command);await f.review.decide('admin',command);
  const record=await adminRecord(args);
  assert.equal(record.paid,3000);assert.equal(record.balance,22000);
  assert.equal(record.payments.length,1);assert.equal(record.payments[0].amount,3000);
  assert.equal(record.payments[0].ref,'BANK-001');assert.equal(f.db.count('receipts'),1);
  assert.equal((f.db.read('customers/c1').payments || []).length,0);
  await assert.rejects(adminRecord({...args,token:'staff'}),{code:'FORBIDDEN'});
  await assert.rejects(adminRecord({...args,token:'buyer'}),{code:'FORBIDDEN'});
  f.db.put('bookings/booking-c1',{...f.db.read('bookings/booking-c1'),netCreditCentavos:400000,balanceCentavos:2100000,
    items:f.db.read('bookings/booking-c1').items.map((x,i)=>({...x,creditCentavos:i===0?400000:0}))});
  await assert.rejects(adminRecord(args),{code:'BOOKING_REVIEW'});
});

test('new installment schedule deducts the verified deposit and preserves old deposit terms',()=>{
  const at=Date.parse('2026-11-05T04:00:00Z'),reservedAt=at-86400000;
  const booking={termsVersion:1,version:2,totalCentavos:2200000,netCreditCentavos:300000,openingCreditCentavos:0,
    openingBalanceId:'opening',status:'active',items:[{itemId:'plot1',creditCentavos:300000}],
    lifecycleTerms:{version:1,bookingTermsVersion:1,reservationVerified:true,reservedAt,plan:'installment',termMonths:12,
      depositPerPlotCentavos:300000,installmentCalculation:'remaining_after_deposit_v1'}};
  const entries=[{kind:'opening_balance',receiptId:'opening',contractCreditCentavos:0},
    {kind:'receipt',receiptId:'receipt1',bookingTermsVersion:1,contractCreditCentavos:300000,receivedAt:at,
      allocations:[{itemId:'plot1',centavos:300000}]}];
  const result=deriveLifecycle(booking,entries,at);
  assert.equal(result.depositRequiredCentavos,300000);assert.equal(result.monthlyCentavos,158333);
  assert.equal(result.calendar.at(-1).amountCentavos,158337);
  assert.equal(result.calendar.reduce((n,r)=>n+r.amountCentavos,0),1900000);
  const old={...booking,lifecycleTerms:{...booking.lifecycleTerms}};
  delete old.lifecycleTerms.depositPerPlotCentavos;delete old.lifecycleTerms.installmentCalculation;
  const legacy=deriveLifecycle(old,entries,at);
  assert.equal(legacy.depositRequiredCentavos,500000);assert.equal(legacy.state,'partial_deposit');
  assert.equal(legacy.monthlyCentavos,null);
});

test('new office-paid reservations use the deposit-adjusted amount in reminders and customer history',()=>{
  const a={plan:'installment',installmentCalculation:'remaining_after_deposit_v1',depositPerPlotCentavos:300000,
    totalPrice:22000,years:1,plots:[{plotCode:'A-0001'}],status:'paid',monthly:1583.33,
    payments:[{amount:3000,date:Date.parse('2026-11-05T04:00:00Z'),ref:'DEPOSIT-1'}]};
  const summary=newInstallment(a);
  assert.equal(summary.balance,19000);assert.equal(summary.monthly,1583.33);assert.equal(summary.monthsPaid,0);
  assert.equal(summary.nextDue,Date.parse('2026-12-05T00:00:00+08:00'));
  assert.deepEqual(require('../../lib/presale-reminders').ledger(a),summary);
  const history=require('../../lib/payments/read-model').legacySummary('presale','PS-0001',a);
  assert.equal(history.balanceCentavos,1900000);assert.equal(history.monthlyCentavos,158333);
  assert.equal(history.nextDueDate,'2026-12-05');
  assert.equal(newInstallment({...a,installmentCalculation:undefined}),null);
});
