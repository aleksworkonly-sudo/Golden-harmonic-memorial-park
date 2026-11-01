'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cashFixture}=require('./cash-fixture');
const {createCashHandler}=require('../../lib/payments/cash-http');
const origin='https://park.example.test';
const env={PAYMENT_ACCESS_ENABLED:'true',PAYMENT_CASH_ENABLED:'true',PAYMENT_ACCESS_ORIGIN:origin,
  PAYMENT_ACCESS_RATE_SECRET:'test-only-secret-at-least-32-characters',BREVO_API_KEY:'test',SENDER_EMAIL:'office@example.test'};
async function call(handler,body,options={}) {
  const req={method:'POST',body,socket:{remoteAddress:'127.0.0.1'},...options,
    headers:{origin,'content-type':'application/json',authorization:'Bearer admin',...options.headers}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await handler(req,res);return res;
}
test('cash gate stays off without opt-in; no service initialization',async()=>{
  const handler=createCashHandler({env:{...env,PAYMENT_CASH_ENABLED:'false'},services:()=>{throw Error('must not initialize');}});
  assert.deepEqual((await call(handler,null,{method:'GET'})).body,{enabled:false});assert.equal((await call(handler,{action:'queue'})).code,503);
});
test('admin HTTP authorization, origin/body limits and field allowlists apply to every operation',async()=>{
  const f=cashFixture();const handler=createCashHandler({env,services:()=>f});const body={action:'queue',filters:{}};
  for(const [options,status] of [[{headers:{authorization:''}},401],[{headers:{authorization:'Bearer staff'}},403],
    [{headers:{origin:'https://elsewhere.test'}},403],[{headers:{'content-type':'text/plain'}},415]]) assert.equal((await call(handler,body,options)).code,status);
  assert.equal((await call(handler,{...body,role:'admin'})).code,400);assert.equal((await call(handler,'x'.repeat(740000))).code,413);
});
test('cash HTTP record and retry return one pending record, with private/no-store detail',async()=>{
  const f=cashFixture(),handler=createCashHandler({env,services:()=>f});
  const command=f.record();const first=await call(handler,{action:'record',command});assert.equal(first.code,200);
  const retry=await call(handler,{action:'record',command});assert.equal(retry.body.paymentId,first.body.paymentId);assert.equal(retry.body.duplicate,true);
  const detail=await call(handler,{action:'detail',paymentId:first.body.paymentId});assert.equal(detail.code,200);assert.equal(detail.headers['Cache-Control'],'no-store');
  assert.equal(f.db.count('receipts'),0);
});
test('unknown backend errors return no private implementation detail',async()=>{
  const handler=createCashHandler({env,services:()=>{throw Error('secret Firebase credential');}});
  const result=await call(handler,{action:'queue'});assert.equal(result.code,503);assert.equal(JSON.stringify(result.body).includes('secret'),false);
});
