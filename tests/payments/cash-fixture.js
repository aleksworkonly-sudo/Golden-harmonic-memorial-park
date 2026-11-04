'use strict';
const {reviewFixture}=require('./review-fixture');
const {createCashService}=require('../../lib/payments/cash');
function cashFixture() {
  const f=reviewFixture();
  f.db.put('paymentReceivingAccounts/office-register',{enabled:true,version:1,channel:'cash',label:'Sample office register — not live'});
  for(const key of [f.key,f.guestKey]) {
    const path=`paymentSubmissionScopes/${key}`;
    f.db.put(path,{...f.db.read(path),cash:{enabled:true,receivingAccountId:'office-register',receivingAccountVersion:1,purposes:['deposit','installment','advance','settlement']}});
  }
  const cash=createCashService({db:f.db,auth:f.auth,now:()=>f.time});
  const record=(overrides={})=>({requestId:'cash-record-000001',sourceKind:'customer',sourceId:'c1',scopeVersion:1,expectedBookingVersion:1,
    purpose:'deposit',receivedCentavos:500000,receivedAt:f.time-86400000,collector:'Sample admin',officeReference:'SERIES-A-00001',fundsConfirmed:true,...overrides});
  const step=(p,overrides={})=>({requestId:`cash-step-${p.version}-000001`,paymentId:p.paymentId,expectedVersion:p.version,...overrides});
  const approve=(p,overrides={})=>step(p,{requestId:'cash-approve-00001',revisionId:p.revisionId,expectedBookingVersion:1,
    allocations:[{itemId:'item1',centavos:500000}],unappliedCentavos:0,reason:'Cash and printed receipt photo match.',photoConfirmed:true,...overrides});
  const ready=async(overrides={})=>{
    let saved=await cash.mutate('admin','record',record(overrides));
    saved=await cash.mutate('admin','print',step(saved));
    return cash.mutate('admin','photo',step(saved,{image:(await f.command()).image}));
  };
  return {...f,cash,record,step,approve,ready};
}
module.exports={cashFixture};
