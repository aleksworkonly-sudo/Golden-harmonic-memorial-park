'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {presaleFixture}=require('./presale-payment-fixture');
const {createPresalePaymentService}=require('../../lib/payments/presale-payment');

function presaleEndpoint(f){
  const filename=path.resolve(__dirname,'../../api/presale.js'),actualRequire=createRequire(filename);
  const admin={apps:[{}],firestore:()=>f.db,auth:()=>f.auth};
  const context={module:{exports:{}},require:name=>name==='firebase-admin'?admin:name==='../lib/payments/presale-payment'?
    {createPresalePaymentService:options=>createPresalePaymentService({...options,qrAssets:f.settings.qrAssets,now:f.now})}:actualRequire(name),
    process:{env:f.settings.env},Buffer,AbortController,setTimeout,clearTimeout,console:{error(){}},fetch:()=>{throw Error('No external call allowed');}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});return context.module.exports;
}
const body={lots:[{block:'A',lot:1}],name:'Synthetic Buyer',address:'Synthetic address',mobile:'09123456789',email:'buyer@example.test',
  consent:true,method:'gcash',plan:'installment',years:2,requestId:'c'.repeat(64)};
async function call(handler,overrides={}){
  const req={method:'POST',body,headers:{origin:'https://park.example.test','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},...overrides};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
}
test('presale endpoint issues scoped HttpOnly cookie, preserves API URLs and never exposes session secret',async()=>{
  const f=presaleFixture(),handler=presaleEndpoint(f),r=await call(handler);
  assert.equal(r.code,200);assert.equal(r.body.paymentFlow,'manual_qr');assert.equal(r.body.secret,undefined);
  assert.equal(r.body.depositCentavos,300000);assert.equal(r.body.total,54625);
  assert.match(r.headers['Set-Cookie'],/^__Host-gh_payment_session=/);
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=1800'])assert.ok(r.headers['Set-Cookie'].includes(flag));
  const again=await call(handler);assert.equal(again.body.ref,r.body.ref);assert.equal(f.db.count('plots'),1);
});
test('manual reservation rejects invalid origins, malformed bodies and unknown QR methods before holding plots',async()=>{
  const f=presaleFixture(),handler=presaleEndpoint(f);
  assert.equal((await call(handler,{headers:{origin:'https://other.test','content-type':'application/json'}})).code,403);
  assert.equal((await call(handler,{body:'{'})).code,400);
  assert.equal((await call(handler,{body:{...body,method:'maya'}})).code,503);
  assert.equal((await call(handler,{body:{...body,requestId:undefined}})).code,400);
  assert.equal(f.db.count('plots'),0);
});
test('lost-response HTTP recovery preserves original terms after products are repriced',async()=>{
  const f=presaleFixture(),handler=presaleEndpoint(f),request={body:{...body,customMonthly:2500}};
  const initial=await call(handler,request);assert.equal(initial.code,200);
  f.db.put('products/corner-premium',{price:60000});
  const retry=await call(handler,request);assert.equal(retry.code,200);
  assert.equal(retry.body.total,initial.body.total);assert.equal(retry.body.ref,initial.body.ref);
  assert.equal(f.db.count('bookings'),1);
});
module.exports={presaleEndpoint};

test('deployment URL supports reservation, QR context, proof upload and payment access on the same host',async()=>{
  const f=presaleFixture(),host='park-current-team.vercel.app';
  f.settings.env={...f.settings.env,VERCEL:'1',VERCEL_URL:host,PAYMENT_PRESALE_GCASH_ACCOUNT_ID:'gcash-qr-v1'};
  f.settings.qrAssets=require('../../lib/payments/qr-assets.json');
  f.now=()=>Date.now()-60000;
  f.db.put('paymentReceivingAccounts/gcash-qr-v1',require('../../docs/payments/examples/gcash-receiving-account.json'));
  const headers={origin:`https://${host}`,host,'sec-fetch-site':'same-origin','content-type':'application/json'};
  const handler=presaleEndpoint(f),saved=await call(handler,{headers});
  assert.equal(saved.code,200,JSON.stringify(saved.body));
  const cookie=saved.headers['Set-Cookie'].split(';')[0];
  const {createSubmissionHandler}=require('../../lib/payments/submission-http');
  const {createAccessHandler}=require('../../lib/payments/access-http');
  const options={env:f.settings.env,services:()=>({db:f.db,auth:f.auth})};
  const submission=createSubmissionHandler(options);
  const target={mode:'reservation',reservationRef:saved.body.ref};
  const context=await call(submission,{headers:{...headers,cookie},body:{action:'context',...target}});
  assert.equal(context.code,200,JSON.stringify(context.body));
  assert.equal(context.body.offers[0].qrImagePath,'/payment-qr/gcash-v1.jpg');
  const command=await require('./submission-fixture').fixture().command({
    transferDate:require('../../lib/payments/calendar').manilaDate(Date.now()),
    transferTime:new Date(Date.now()+8*60*60*1000).toISOString().slice(11,16),
    payerName:'Synthetic Wallet Owner',payerMobile:'09123456789'
  });
  const proof=await call(submission,{headers:{...headers,cookie},body:{action:'submit',...target,command}});
  assert.equal(proof.code,200,JSON.stringify(proof.body));
  const list=await call(submission,{headers:{...headers,cookie},body:{action:'list',...target}});
  assert.equal(list.code,200);
  assert.equal(list.body.cases.length,1);
  assert.equal(f.db.read(`bookings/PRESALE-${saved.body.ref}`).netCreditCentavos,0);
  const sent=[];
  const accessHandler=createAccessHandler({...options,sender:async mail=>sent.push(mail),sleep:async()=>{},minimumRequestMs:0});
  const restricted=await call(accessHandler,{headers:{...headers,cookie},body:{action:'guest_summary'}});
  assert.equal(restricted.code,401,'Creation session must still require email verification for payment history');
  const link=await call(accessHandler,{headers,body:{action:'request_link',reference:saved.body.ref,email:body.email}});
  assert.equal(link.code,200);
  const url=new URL(sent[0].url);
  assert.equal(url.origin,f.settings.env.PAYMENT_ACCESS_ORIGIN,'Email destination remains the public website');
  const exchange=await call(accessHandler,{headers,body:{action:'exchange',token:url.hash.slice(8)}});
  assert.equal(exchange.code,200,JSON.stringify(exchange.body));
  const verifiedCookie=exchange.headers['Set-Cookie'].split(';')[0];
  const access=await call(accessHandler,{headers:{...headers,cookie:verifiedCookie},body:{action:'guest_summary'}});
  assert.equal(access.code,200,JSON.stringify(access.body));
  const retry=await call(handler,{headers});
  assert.equal(retry.body.ref,saved.body.ref);
  assert.equal(f.db.count('bookings'),1);
});
