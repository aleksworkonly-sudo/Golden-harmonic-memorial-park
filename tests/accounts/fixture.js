'use strict';
const {remainingBalanceFixture}=require('../payments/remaining-balance-fixture');
const {createInvitationService}=require('../../lib/accounts/invitations');
const {createClaimService}=require('../../lib/accounts/claims');
const {writeAccountPaymentEvent}=require('../../lib/accounts/posting');
const {sourceKey}=require('../../lib/accounts/policy');
async function accountFixture(){
  const f=await remainingBalanceFixture();
  const env={...f.settings.env,ACCOUNT_ACCESS_ENABLED:'true',ACCOUNT_INVITES_ENABLED:'true',ACCOUNT_EMAIL_DISPATCH_ENABLED:'true',
    ACCOUNT_LAUNCH_AT:'2026-11-01T00:00:00+08:00',ACCOUNT_INVITE_POLICY:'positive_credit',ACCOUNT_WORKER_SECRET:'test-account-worker-secret-at-least-32'};
  const source={kind:'presale',id:f.reservation.ref},key=sourceKey(source);
  const booking=f.db.read(`bookings/PRESALE-${source.id}`);
  const receipt=[...f.db.records].find(([path])=>path.startsWith('receipts/'))[1];
  await f.db.runTransaction(async tx=>writeAccountPaymentEvent(tx,f.db,{booking,bookingId:receipt.bookingId,receipt},env));
  const users={buyer:{uid:'buyer',email:f.input.email,emailVerified:true},other:{uid:'other',email:'other@example.test',emailVerified:true},
    unverified:{uid:'unverified',email:f.input.email,emailVerified:false},admin:{uid:'admin',email:f.input.email,emailVerified:true}};
  const auth={verifyIdToken:async token=>{if(token==='revoked')throw Object.assign(Error('revoked'),{code:'auth/id-token-revoked'});return {uid:token};},
    getUser:async uid=>users[uid] || {uid,email:f.input.email,emailVerified:true}};
  const invitations=createInvitationService({db:f.db,auth,env,now:f.now}),claims=createClaimService({db:f.db,auth,env,now:f.now});
  return {...f,env,source,key,auth,users,receipt,invitations,claims,
    issue:()=>invitations.issue(source),claim:async()=>{const issued=await invitations.issue(source);await claims.complete('buyer',issued.inviteId,true);return issued;}};
}
module.exports={accountFixture};
