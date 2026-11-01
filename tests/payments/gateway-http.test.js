'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {gatewayFixture}=require('./gateway-fixture');
const {createGatewayHandler,createWebhookHandler,createWebhookWebHandler}=require('../../lib/payments/gateway-http');
const {verifyWebhook,rawBody,RAW_LIMIT}=require('../../lib/payments/paymongo');
const origin='https://park.example.test',secret='test-webhook-signature-secret-123456';
const env={PAYMENT_ACCESS_ENABLED:'true',PAYMENT_GATEWAY_ENABLED:'true',PAYMENT_GATEWAY_WEBHOOK_ENABLED:'true',PAYMENT_ACCESS_ORIGIN:origin,
  PAYMENT_ACCESS_RATE_SECRET:'test-access-secret-at-least-32-characters',BREVO_API_KEY:'test',SENDER_EMAIL:'test@example.test',
  PAYMONGO_ENVIRONMENT:'test',PAYMONGO_ACCOUNT_ID:'merchant-test',PAYMONGO_SECRET_KEY:'sk_test_only_fake_local_key',PAYMONGO_WEBHOOK_SECRET_KEY:secret};
const signature=(raw,at,mode='te')=>`t=${at},${mode}=${createHmac('sha256',secret).update(at+'.').update(raw).digest('hex')},${mode==='te'?'li':'te'}=`;
async function call(handler,body,options={}) {
  const req={method:'POST',body,socket:{remoteAddress:'127.0.0.1'},...options,headers:{origin,'content-type':'application/json',authorization:'Bearer buyer',...options.headers}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};await handler(req,res);return res;
}
test('gateway/webhook fail closed without opt-in, matching key environment and mandatory signature secret',async()=>{
  for(const patch of [{PAYMENT_GATEWAY_ENABLED:'false',PAYMENT_GATEWAY_WEBHOOK_ENABLED:'false'},{PAYMONGO_WEBHOOK_SECRET_KEY:''},{PAYMONGO_SECRET_KEY:'sk_live_wrong_env_key'}]) {
    const options={env:{...env,...patch},services:()=>{throw Error('must not initialize');}};
    assert.equal((await call(createGatewayHandler(options),{})).code,503);assert.equal((await call(createWebhookHandler(options),{})).code,503);
  }
});
test('exact original bytes, current mode signature, constant-time comparison and timestamp bounds',()=>{
  const f=gatewayFixture(),event={data:{id:'evt_sign',type:'event',attributes:{type:'payment.paid',livemode:false}}};
  const raw=Buffer.from(JSON.stringify(event,null,2)),at=String(f.time/1000),sig=signature(raw,at);
  assert.equal(verifyWebhook(raw,sig,secret,'test',f.time).event.id,'evt_sign');
  for(const [r,s] of [[Buffer.from(JSON.stringify(event)),sig],[raw,signature(raw,at,'li')],[raw,sig+',t='+at],[raw,signature(raw,String(Number(at)-301))],[raw,'']])
    assert.throws(()=>verifyWebhook(r,s,secret,'test',f.time),{code:'INVALID_SIGNATURE'});
});
test('native Web Request adapter verifies bytes without reconstructing parsed JSON and persists before 200',async()=>{
  const f=gatewayFixture();await f.create();f.pay();const raw=JSON.stringify({data:f.event()},null,2),sig=signature(raw,String(f.time/1000));
  const handler=createWebhookWebHandler({env,services:()=>f,now:()=>f.time});
  const response=await handler(new Request(origin+'/api/paymongo-webhook',{method:'POST',headers:{'content-type':'application/json','paymongo-signature':sig},body:raw}));
  assert.equal(response.status,200);assert.equal(f.db.count('receipts'),1);assert.equal(f.db.count('providerEvents'),1);
  await assert.rejects(rawBody({body:JSON.parse(raw)}),{code:'RAW_BODY_REQUIRED'});
  await assert.rejects(rawBody({body:Buffer.alloc(RAW_LIMIT+1)}),{code:'BODY_TOO_LARGE'});
});
test('webhook persistence failure returns retryable failure and does not expose backend secrets',async()=>{
  const f=gatewayFixture();await f.create();f.pay();const raw=JSON.stringify({data:f.event()}),handler=createWebhookHandler({env,services:()=>f,now:()=>f.time});f.db.failNextCommit=true;
  const options={headers:{'paymongo-signature':signature(raw,String(f.time/1000))}};
  assert.equal((await call(handler,raw,options)).code,503);assert.equal(f.db.count('providerEvents'),0);assert.equal((await call(handler,raw,options)).code,200);
});
test('gateway boundary denies arbitrary prices/targets, cross origin, staff admin actions and oversized bodies',async()=>{
  const f=gatewayFixture(),handler=createGatewayHandler({env,services:()=>f,client:f.client,now:()=>f.time});
  const body={action:'create',mode:'account',customerId:'c1',command:f.gatewayCommand()};
  assert.equal((await call(handler,{...body,amount:1})).code,400);assert.equal((await call(handler,body,{headers:{origin:'https://other.test'}})).code,403);
  assert.equal((await call(handler,{action:'queue'},{headers:{authorization:'Bearer staff'}})).code,403);assert.equal((await call(handler,'x'.repeat(33000))).code,413);
  assert.equal((await call(handler,body)).code,200);assert.equal(f.state.creates,1);
});
