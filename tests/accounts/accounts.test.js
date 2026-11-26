'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {accountFixture}=require('./fixture');
const {configuration,eligible,sourceKey,contactStamp}=require('../../lib/accounts/policy');
const {resolveBuyerSource}=require('../../lib/accounts/access');
const {createAccessService}=require('../../lib/payments/access');
const {createDeliveryService}=require('../../lib/accounts/delivery');
const {createClaimService}=require('../../lib/accounts/claims');
const {createAccountHandler,createAccountWorker}=require('../../lib/accounts/http');
const {createReportService}=require('../../lib/payments/reports');
const {createSubmissionService}=require('../../lib/payments/submission');
const options=f=>({db:f.db,auth:f.auth,env:f.env,now:f.now});

test('only positive principal posted after configured launch qualifies',()=>{
  const cfg=configuration({ACCOUNT_INVITES_ENABLED:'true',ACCOUNT_LAUNCH_AT:'2026-11-26T00:00:00+08:00',ACCOUNT_INVITE_POLICY:'positive_credit'});
  assert.equal(eligible({recordedAt:cfg.launchAt,contractCreditCentavos:1},cfg),true);
  for(const r of [{recordedAt:cfg.launchAt-1,contractCreditCentavos:500},{recordedAt:cfg.launchAt,contractCreditCentavos:0},{claimedCentavos:500}])assert.equal(eligible(r,cfg),false);
  assert.equal(eligible({recordedAt:cfg.launchAt,contractCreditCentavos:1},configuration({})),false);
});
test('claim preserves money and bindings and permits presale history and receipts by UID',async()=>{
  const f=await accountFixture(),before=f.db.read('bookings/'+f.receipt.bookingId),ledger=f.db.count('ledgerEntries');
  const {inviteId}=await f.issue();
  await assert.rejects(f.claims.context('other',inviteId),{code:'INVALID_INVITE'});
  await assert.rejects(f.claims.complete('unverified',inviteId,true),{code:'EMAIL_VERIFICATION_REQUIRED'});
  await assert.rejects(f.claims.complete('admin',inviteId,true),{code:'ACCOUNT_REVIEW'});
  await assert.rejects(f.claims.complete('buyer',inviteId,false),{code:'TERMS_REQUIRED'});
  await f.claims.complete('buyer',inviteId,true);
  const access=createAccessService({...options(f),rateSecret:'test-secret-more-than-32-characters'});
  assert.ok((await access.accountList({idToken:'buyer'})).some(s=>s.kind==='presale' && s.id===f.source.id));
  const summary=await access.accountSummary({idToken:'buyer',source:f.source});assert.equal(summary.balanceCentavos,before.balanceCentavos);
  const reports=createReportService(options(f));
  assert.equal((await reports.receipt({mode:'account',idToken:'buyer',source:f.source},f.receipt.receiptId)).receiptId,f.receipt.receiptId);
  assert.equal(f.db.read('bookings/'+f.receipt.bookingId).ownerBinding,before.ownerBinding);
  assert.equal(f.db.count('ledgerEntries'),ledger);assert.equal(f.db.count('receipts'),1);
  assert.equal(f.db.read('presaleApplications/'+f.source.id).authUid,undefined);
});
test('concurrent claims have one owner; successful replay survives expiry but not revocation',async()=>{
  const f=await accountFixture(),{inviteId}=await f.issue();
  const results=await Promise.allSettled([f.claims.complete('buyer',inviteId,true),f.claims.complete('second',inviteId,true)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const uid=f.db.read('portalAccess/'+f.key).uid;
  f.advance(25*3600000);assert.equal((await f.claims.complete(uid,inviteId,true)).ok,true);
  f.db.put('portalAccess/'+f.key,{...f.db.read('portalAccess/'+f.key),status:'revoked'});
  await assert.rejects(f.claims.complete(uid,inviteId,true),{code:'FORBIDDEN'});
});
test('expired unclaimed invitations, contact races and stale generations cannot link records',async()=>{
  let f=await accountFixture(),i=await f.issue();f.advance(25*3600000);
  await assert.rejects(f.claims.complete('buyer',i.inviteId,true),{code:'INVITE_EXPIRED'});
  f=await accountFixture();i=await f.issue();await f.invitations.issue(f.source,{force:true});
  await assert.rejects(f.claims.complete('buyer',i.inviteId,true),{code:'INVITE_EXPIRED'});
  f=await accountFixture();i=await f.issue();
  f.db.beforeCommit=()=>f.db.put('presaleApplications/'+f.source.id,{...f.db.read('presaleApplications/'+f.source.id),accountContactVersion:2});
  await assert.rejects(f.claims.complete('buyer',i.inviteId,true),{code:'CONTACT_CHANGED'});
  assert.equal(f.db.count('portalAccess'),0);
});
test('Auth-created but failed linkage resumes; a revoked legacy grant overrides authUid',async()=>{
  const f=await accountFixture(),i=await f.issue();f.db.failNextCommit=true;
  await assert.rejects(f.claims.complete('buyer',i.inviteId,true));assert.equal(f.db.count('portalAccess'),0);
  await f.claims.complete('buyer',i.inviteId,true);assert.equal(f.db.count('portalAccess'),1);
  const source={kind:'customer',id:'legacy'},key=sourceKey(source),data={authUid:'buyer',email:f.input.email};
  f.db.put('customers/legacy',data);
  await f.db.runTransaction(async tx=>{await resolveBuyerSource(tx,f.db,{uid:'buyer'},source);});
  f.db.put('portalAccess/'+key,{uid:'buyer',kind:'customer',sourceId:'legacy',status:'revoked',contactStamp:contactStamp(data),bookingId:null});
  await assert.rejects(f.db.runTransaction(tx=>resolveBuyerSource(tx,f.db,{uid:'buyer'},source)),{code:'FORBIDDEN'});
});
test('subsequent guest payments are blocked; activated account uses existing presale proof workflow',async()=>{
  const f=await accountFixture(),guest={mode:'reservation',secret:f.reservation.secret};
  const ctx=await f.submissions.context(guest);assert.equal(ctx.accountRequired,true);
  const command={...f.command,requestId:'next-payment-000001',offerId:ctx.offers[0].id,claimedCentavos:100000,reference:'NEXT-ONE'};
  await assert.rejects(f.submissions.submit(guest,command),{code:'ACCOUNT_REQUIRED'});
  await f.claim();const submissions=createSubmissionService({...options(f),qrAssets:f.settings.qrAssets});
  // Use the original fixture service to preserve its injected verified QR manifest; token validator accepts UID.
  const result=await f.submissions.submit({mode:'account',idToken:'buyer',source:f.source},command);
  assert.ok(result.paymentId);assert.equal(f.db.count('receipts'),1);
  await assert.rejects(submissions.list({mode:'account',idToken:'other',source:f.source}),{code:'FORBIDDEN'});
});
test('delivery failures never change payments, stale contacts suppress mail, links are not persisted',async()=>{
  const f=await accountFixture(),i=await f.issue(),mails=[];
  const service=createDeliveryService({...options(f),link:async()=> 'https://example.test/secret-action-link',send:async mail=>{mails.push(mail);return {state:'accepted',messageId:'m1'};}});
  assert.equal((await service.dispatch(i.inviteId)).state,'accepted');assert.equal(mails[0].to,f.input.email.toLowerCase());
  assert.equal(JSON.stringify([...f.db.records]).includes('secret-action-link'),false);
  const j=await f.invitations.issue(f.source,{force:true});
  f.db.put('presaleApplications/'+f.source.id,{...f.db.read('presaleApplications/'+f.source.id),email:'changed@example.test'});
  assert.equal((await service.dispatch(j.inviteId)).state,'not_claimed');assert.equal(mails.length,1);
  assert.equal(f.db.read('accountDeliveryEvents/'+j.inviteId).state,'suppressed');assert.equal(f.db.count('receipts'),1);
});
test('uncertain email is not blindly retried; worker recovers durable payment events',async()=>{
  const f=await accountFixture();let sends=0;
  const service=createDeliveryService({...options(f),link:async()=> 'https://example.test/link',send:async()=>{sends++;throw Error('timeout');}});
  await service.tick();await service.tick();assert.equal(sends,1);
  assert.equal([...f.db.records].find(([p])=>p.startsWith('accountDeliveryEvents/'))[1].state,'uncertain');
  assert.equal(f.db.count('receipts'),1);
});
async function call(handler,body,{token,origin='https://park.example.test',method='POST'}={}){
  const req={method,body,socket:{remoteAddress:'127.0.0.1'},headers:{origin,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})}};
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
}
test('HTTP rejects forged fields/origins, hides email matches, and worker requires its secret',async()=>{
  const f=await accountFixture();f.env.PAYMENT_ACCESS_ORIGIN='https://park.example.test';
  const handler=createAccountHandler({...options(f),services:()=>({db:f.db,auth:f.auth}),sleep:async()=>{},minimumRequestMs:0,
    link:async()=> 'https://example.test/link',send:async()=>({state:'accepted'})});
  assert.equal((await call(handler,{action:'request_setup',source:f.source,email:f.input.email,role:'admin'})).code,400);
  assert.equal((await call(handler,{action:'request_setup',source:f.source,email:f.input.email},{origin:'https://evil.example'})).code,403);
  const a=await call(handler,{action:'request_setup',source:f.source,email:f.input.email});
  const b=await call(handler,{action:'request_setup',source:f.source,email:'wrong@example.test'});assert.deepEqual(a.body,b.body);
  const worker=createAccountWorker({...options(f),services:()=>({db:f.db,auth:f.auth})});
  assert.equal((await call(worker,{})).code,401);
});
