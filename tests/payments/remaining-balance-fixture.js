'use strict';
const {presaleFixture}=require('./presale-payment-fixture');
const {fixture}=require('./submission-fixture');
const {createAccessService}=require('../../lib/payments/access');
async function remainingBalanceFixture(){
  const f=presaleFixture();
  f.db.put('products/corner-premium',{price:22000});
  f.input={...f.input,plan:'cash',years:0,total:22000,spot:22000,listPrice:22000,
    plots:[{...f.input.plots[0],price:22000,contractBase:22000}]};
  const reservation=await f.core.reserve(f.input);
  f.advance(60000);
  const command={...await fixture().command(),claimedCentavos:300000,transferDate:'2026-11-02',transferTime:'12:00',payerName:'Wallet Owner',payerMobile:'09123456789'};
  const approve=async(payment,amount,reference)=>f.review.decide('admin',{
    paymentId:payment.paymentId,requestId:'approve-'+reference,expectedVersion:payment.version,revisionId:payment.revisionId,
    action:'approve',reason:'Statement verified',buyerNote:'Verified.',fundsConfirmed:true,receivedCentavos:amount,
    receivedAt:f.now()-1000,verifiedReference:reference,expectedBookingVersion:f.db.read('bookings/PRESALE-PS-0001').version,
    allocations:[{itemId:'item-1',centavos:amount}],unappliedCentavos:0});
  const paid=await f.submissions.submit({mode:'reservation',secret:reservation.secret},command);
  await approve(paid,300000,'GCASH-DEPOSIT');
  const mail=[];
  const access=createAccessService({db:f.db,auth:f.auth,origin:f.settings.env.PAYMENT_ACCESS_ORIGIN,
    rateSecret:f.settings.env.PAYMENT_ACCESS_RATE_SECRET,now:f.now,sendLink:async message=>mail.push(message)});
  await access.requestLink({reference:reservation.ref,email:f.input.email,requester:'synthetic-balance'});
  const token=new URL(mail[0].url).hash.slice(8);
  return {...f,reservation,command,approve,access,token};
}
module.exports={remainingBalanceFixture};
