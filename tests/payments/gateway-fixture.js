'use strict';
const {reviewFixture}=require('./review-fixture');
const {createGatewayService}=require('../../lib/payments/gateway');
const {hash}=require('../../lib/payments/identities');
const {providerKey}=require('../../lib/payments/paymongo');
function gatewayFixture() {
  const f=reviewFixture(),config={accountId:'merchant-test',environment:'test',origin:'https://park.example.test'};
  f.db.put('paymentReceivingAccounts/paymongo-test',{enabled:true,version:1,channel:'paymongo',providerAccountId:config.accountId,environment:'test'});
  for(const [key,id] of [[f.key,'c1'],[f.guestKey,'PS-0001']]) {
    const path=`paymentSubmissionScopes/${key}`;f.db.put(path,{...f.db.read(path),gateway:{enabled:true,receivingAccountId:'paymongo-test',receivingAccountVersion:1,
      methods:['gcash','card'],offers:[{id:'gateway-deposit',purpose:'deposit',principalCentavos:500000,allocations:[{itemId:'item1',centavos:500000}]}]}});
    const b=`bookings/booking-${id}`;f.db.put(b,{...f.db.read(b),gatewayEnvironment:'test',gatewayAccountId:config.accountId});
  }
  const state={creates:0,timeout:false,sessions:new Map()};
  const client={create:async(i)=>{state.creates++;const s={id:`cs_${state.creates}`,type:'checkout_session',attributes:{livemode:false,status:'active',reference_number:i.intentId,
    metadata:{intentId:i.intentId,quoteHash:i.quoteHash},checkout_url:`https://checkout.paymongo.com/cs_${state.creates}`,payment_intent:{id:`pi_${state.creates}`},
    line_items:[{amount:i.principalCentavos,currency:'PHP',quantity:1},{amount:i.buyerFeeCentavos,currency:'PHP',quantity:1}],payments:[]}};
    state.sessions.set(s.id,s);if(state.timeout)throw Error('network timeout after creation');return structuredClone(s);},
    retrieve:async(id)=>structuredClone(state.sessions.get(id)),expire:async(id)=>{const s=state.sessions.get(id);if(s.attributes.payments.some((p)=>p.attributes.status==='paid'))throw Error('already paid');s.attributes.status='expired';return structuredClone(s);}};
  const gateway=createGatewayService({db:f.db,auth:f.auth,client,config,now:()=>f.time});
  const command=(overrides={})=>({requestId:'gateway-request-0001',offerId:'gateway-deposit',scopeVersion:1,...overrides});
  const create=(overrides={})=>gateway.create(f.account,command(overrides));
  const pay=(sessionId='cs_1',overrides={})=>{const s=state.sessions.get(sessionId);const p={id:'pay_001',type:'payment',attributes:{status:'paid',amount:512500,currency:'PHP',livemode:false,
    paid_at:(f.time-3600000)/1000,fee:10000,net_amount:502500,payment_intent_id:s.attributes.payment_intent.id,...overrides}};s.attributes.payments=[p];return p;};
  const event=(id='evt_001',type='checkout_session.payment.paid',sessionId='cs_1')=>({id,type:'event',attributes:{type,livemode:false,
    data:structuredClone(type==='payment.paid'?state.sessions.get(sessionId).attributes.payments[0]:state.sessions.get(sessionId))}});
  const deliver=async(e=event())=>gateway.accept(e,hash(e));
  const resolve=(e,overrides={})=>({eventKey:providerKey(config.accountId,'test',e.id),requestId:'gateway-resolution-01',action:'post',reason:'Distinct funds confirmed against provider and manual history.',distinctConfirmed:true,
    expectedBookingVersion:1,allocations:[{itemId:'item1',centavos:500000}],unappliedCentavos:0,...overrides});
  return {...f,config,state,client,gateway,gatewayCommand:command,create,pay,event,deliver,resolve};
}
module.exports={gatewayFixture};
