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
  assert.equal(r.body.depositCentavos,500000);assert.equal(r.body.total,54625);
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
