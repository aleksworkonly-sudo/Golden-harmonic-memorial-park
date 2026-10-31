'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./submission-fixture');
const { createSubmissionHandler, BODY_BYTES } = require('../../lib/payments/submission-http');
const ORIGIN = 'https://park.example.test';
const env = {PAYMENT_ACCESS_ENABLED:'true',PAYMENT_SUBMISSIONS_ENABLED:'true',PAYMENT_ACCESS_ORIGIN:ORIGIN,
  PAYMENT_ACCESS_RATE_SECRET:'test-only-secret-at-least-32-characters',BREVO_API_KEY:'test',SENDER_EMAIL:'office@example.test'};
async function call(handler,body,options={}) {
  const req={method:'POST',body,socket:{remoteAddress:'127.0.0.1'},...options,
    headers:{origin:ORIGIN,'content-type':'application/json',authorization:'Bearer buyer',...options.headers}};
  const res={headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
  await handler(req,res);return res;
}
function setup() {const f=fixture();return {...f,handler:createSubmissionHandler({env,services:()=>({db:f.db,auth:f.auth})})};}

test('submission route remains off by default and requires the CP2 gate too',async()=>{
  for(const settings of [{},{...env,PAYMENT_SUBMISSIONS_ENABLED:'false'},{...env,PAYMENT_ACCESS_ENABLED:'false'}]) {
    const handler=createSubmissionHandler({env:settings,services:()=>{throw Error('must not initialize');}});
    assert.deepEqual((await call(handler,null,{method:'GET'})).body,{enabled:false});
    assert.equal((await call(handler,{action:'context'})).code,503);
  }
});

test('submission HTTP boundary rejects CSRF, body overflow, extra fields and forged guest target',async()=>{
  const {handler}=setup();const body={action:'context',mode:'account',customerId:'c1'};
  assert.equal((await call(handler,body,{headers:{origin:'https://evil.test'}})).code,403);
  assert.equal((await call(handler,body,{headers:{'sec-fetch-site':'cross-site'}})).code,403);
  assert.equal((await call(handler,body,{headers:{'content-type':'text/plain'}})).code,415);
  assert.equal((await call(handler,'a'.repeat(BODY_BYTES+1))).code,413);
  assert.equal((await call(handler,{...body,role:'admin'})).code,400);
  assert.equal((await call(handler,{...body,mode:'reservation'})).code,400);
  assert.equal((await call(handler,{action:'context',mode:'reservation',secret:'fake'})).code,400);
  assert.equal((await call(handler,'not-json')).code,400);
});

test('actual submission HTTP flow uses bearer ownership, returns no proof in lists and retries safely',async()=>{
  const f=setup();const target={mode:'account',customerId:'c1'};
  assert.equal((await call(f.handler,{action:'context',...target},{headers:{authorization:''}})).code,401);
  assert.equal((await call(f.handler,{action:'context',...target},{headers:{authorization:'Bearer other'}})).code,403);
  const context=await call(f.handler,{action:'context',...target});assert.equal(context.body.offers.length,1);
  const command=await f.command({transferDate:'2026-01-01'});
  const saved=await call(f.handler,{action:'submit',...target,command});assert.equal(saved.code,200);
  const retry=await call(f.handler,{action:'submit',...target,command});assert.equal(retry.body.duplicate,true);
  assert.equal(retry.body.paymentId,saved.body.paymentId);
  const list=await call(f.handler,{action:'list',...target});assert.equal(list.body.cases.length,1);assert.equal(JSON.stringify(list.body).includes('base64'),false);
  const proof=await call(f.handler,{action:'proof',...target,paymentId:saved.body.paymentId,revisionId:'r1'});
  assert.equal(proof.code,200);assert.equal(proof.body.mime,'image/jpeg');assert.equal(proof.headers['Cache-Control'],'no-store');
  assert.equal(proof.headers['X-Content-Type-Options'],'nosniff');
  assert.equal((await call(f.handler,{action:'proof',...target,customerId:'c2',paymentId:saved.body.paymentId,revisionId:'r1'})).code,404);
});

test('anonymous and forged command fields cannot create evidence; backend exceptions are private',async()=>{
  const f=setup();const command=await f.command();
  assert.equal((await call(f.handler,{action:'submit',mode:'reservation',command})).code,401);
  assert.equal((await call(f.handler,{action:'submit',mode:'account',customerId:'c1',command:{...command,status:'verified'}})).code,400);
  assert.equal(f.db.count('paymentProofs'),0);
  const handler=createSubmissionHandler({env,services:()=>{throw Error('secret provider diagnostics');}});
  const failed=await call(handler,{action:'context',mode:'account',customerId:'c1'});
  assert.equal(failed.code,503);assert.equal(JSON.stringify(failed.body).includes('secret'),false);
});
