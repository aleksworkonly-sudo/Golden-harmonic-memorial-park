'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const { operationsFixture }=require('./operations-fixture');
const { createOperationsHandler,createMessagingWorker }=require('../../lib/payments/operations-http');
const origin='https://park.example.test',secret='worker-secret-longer-than-32-test-characters';
const env={PAYMENT_ACCESS_ENABLED:'true',PAYMENT_OPERATIONS_ENABLED:'true',PAYMENT_EMAIL_DISPATCH_ENABLED:'true',PAYMENT_WORKER_SECRET:secret,
  PAYMENT_ACCESS_ORIGIN:origin,PAYMENT_ACCESS_RATE_SECRET:'access-secret-at-least-32-characters',BREVO_API_KEY:'test',SENDER_EMAIL:'office@example.test'};
async function call(handler,body,options={}){
  const req={method:'POST',body,socket:{remoteAddress:'127.0.0.1'},...options,headers:{origin,'content-type':'application/json',authorization:'Bearer admin',...options.headers}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(value){this.body=value;return this;}};await handler(req,res);return res;
}
test('CP8 APIs default off with no initialization and require complete configuration',async()=>{
  const services=()=>{throw Error('Should not initialize');};
  for(const patch of [{PAYMENT_OPERATIONS_ENABLED:'false'},{PAYMENT_ACCESS_ORIGIN:'http://unsafe.test'}]){
    const h=createOperationsHandler({env:{...env,...patch},services});assert.equal((await call(h,{}, {method:'GET'})).body.enabled,false);assert.equal((await call(h,{})).code,503);
  }
  assert.equal((await call(createMessagingWorker({env:{...env,PAYMENT_EMAIL_DISPATCH_ENABLED:'false'},services}),{})).code,503);
});
test('operations route enforces admin authority, owner scope, CSRF and request allowlists',async()=>{
  const f=operationsFixture(),h=createOperationsHandler({env,services:()=>f,now:()=>f.time});
  assert.equal((await call(h,{action:'queue'},{headers:{authorization:'Bearer staff'}})).code,403);
  assert.equal((await call(h,{action:'queue'},{headers:{origin:'https://other.test'}})).code,403);
  assert.equal((await call(h,{action:'prepare',eventId:'x',to:'attacker@example.test'})).code,400);
  assert.equal((await call(h,'x'.repeat(8193))).code,413);
  assert.equal((await call(h,{action:'notices',mode:'account',customerId:'c1'},{headers:{authorization:'Bearer buyer'}})).code,200);
  assert.equal((await call(h,{action:'notices',mode:'account',customerId:'c1'},{headers:{authorization:'Bearer other'}})).code,403);
});
test('worker requires its separate secret; malformed auth never starts sending',async()=>{
  const f=operationsFixture(),h=createMessagingWorker({env,services:()=>f,send:f.send,now:()=>f.time});
  assert.equal((await call(h,{})).code,401);assert.equal((await call(h,{}, {headers:{authorization:['bad']}})).code,401);assert.equal(f.sent.length,0);
  assert.equal((await call(h,{}, {headers:{authorization:`Bearer ${secret}`}})).code,200);assert.ok(f.sent.length>0);
});
test('worker persistence errors return retryable status without exposing provider credentials',async()=>{
  const h=createMessagingWorker({env,services:()=>{throw Error('secret credential');}});
  const r=await call(h,{}, {headers:{authorization:`Bearer ${secret}`}});assert.equal(r.code,503);assert.equal(JSON.stringify(r.body).includes('credential'),false);
});
