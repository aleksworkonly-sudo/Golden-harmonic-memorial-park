'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewFixture}=require('./review-fixture');
const {createReviewHandler}=require('../../lib/payments/review-http');
const origin='https://park.example.test';
const env={PAYMENT_ACCESS_ENABLED:'true',PAYMENT_REVIEW_ENABLED:'true',PAYMENT_ACCESS_ORIGIN:origin,
  PAYMENT_ACCESS_RATE_SECRET:'test-only-secret-at-least-32-characters',BREVO_API_KEY:'test',SENDER_EMAIL:'office@example.test'};
async function call(handler,body,options={}) {
  const req={method:'POST',body,socket:{remoteAddress:'127.0.0.1'},...options,
    headers:{origin,'content-type':'application/json',authorization:'Bearer admin',...options.headers}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await handler(req,res);return res;
}
test('review gate stays off without opt-in; no service initialization',async()=>{
  const handler=createReviewHandler({env:{...env,PAYMENT_REVIEW_ENABLED:'false'},services:()=>{throw Error('must not initialize');}});
  assert.deepEqual((await call(handler,null,{method:'GET'})).body,{enabled:false});assert.equal((await call(handler,{action:'queue'})).code,503);
});
test('admin HTTP authorization, origin/body limits and field allowlists apply to every operation',async()=>{
  const f=reviewFixture();const handler=createReviewHandler({env,services:()=>f});const body={action:'queue',filters:{}};
  for(const [options,status] of [[{headers:{authorization:''}},401],[{headers:{authorization:'Bearer staff'}},403],
    [{headers:{origin:'https://elsewhere.test'}},403],[{headers:{'content-type':'text/plain'}},415]]) assert.equal((await call(handler,body,options)).code,status);
  assert.equal((await call(handler,{...body,role:'admin'})).code,400);assert.equal((await call(handler,'x'.repeat(40000))).code,413);
});
test('HTTP review-to-approval response and retry use the same durable receipt; detail/proof are no-store',async()=>{
  const f=reviewFixture(),saved=await f.submit(),handler=createReviewHandler({env,services:()=>f});
  const detail=await call(handler,{action:'detail',paymentId:saved.paymentId});assert.equal(detail.code,200);assert.equal(detail.headers['Cache-Control'],'no-store');
  const proof=await call(handler,{action:'proof',paymentId:saved.paymentId,revisionId:'r1'});assert.equal(proof.code,200);assert.equal(proof.body.mime,'image/jpeg');
  const command=f.decision(saved);const first=await call(handler,{action:'decide',command});assert.equal(first.code,200);
  const retry=await call(handler,{action:'decide',command});assert.equal(retry.body.receiptId,first.body.receiptId);assert.equal(retry.body.duplicate,true);
});
test('unknown backend errors return no private implementation detail',async()=>{
  const handler=createReviewHandler({env,services:()=>{throw Error('secret Firebase credential');}});
  const result=await call(handler,{action:'queue'});assert.equal(result.code,503);assert.equal(JSON.stringify(result.body).includes('secret'),false);
});
