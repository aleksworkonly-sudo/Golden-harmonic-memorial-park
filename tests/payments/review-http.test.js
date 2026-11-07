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

test('payment count is authenticated and reports read failures without claiming zero pending submissions',async()=>{
  const f=reviewFixture();await f.submit();
  const handler=createReviewHandler({env,services:()=>f});
  const result=await call(handler,{action:'count'});
  assert.equal(result.code,200);assert.deepEqual(result.body,{pending:1});
  assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal((await call(handler,{action:'count'},{headers:{authorization:'Bearer staff'}})).code,403);
  assert.equal((await call(handler,{action:'count',role:'admin'})).code,400);
  const broken=createReviewHandler({env,services:()=>{throw Error('private database details');},logger:{error(){}}});
  const failure=await call(broken,{action:'count'});
  assert.equal(failure.code,503);assert.equal(failure.body.code,'REVIEW_READ_UNAVAILABLE');
  assert.equal(Object.hasOwn(failure.body,'pending'),false);
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
  const handler=createReviewHandler({env,services:()=>{throw Error('secret Firebase credential');},logger:{error(){}}});
  const result=await call(handler,{action:'queue'});assert.equal(result.code,503);assert.equal(JSON.stringify(result.body).includes('secret'),false);
  assert.equal(result.body.code,'REVIEW_READ_UNAVAILABLE');
  assert.doesNotMatch(result.body.error,/result is uncertain/);
});

test('admin record endpoint returns verified ledger balances and rejects staff and extra fields',async()=>{
  const f=reviewFixture(),saved=await f.submit();
  await f.review.decide('admin',f.decision(saved));
  const handler=createReviewHandler({env,services:()=>f});
  const body={action:'record',kind:'customer',id:'c1'};
  const result=await call(handler,body);
  assert.equal(result.code,200);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.body.paid,5000);assert.equal(result.body.balance,20000);
  assert.equal((await call(handler,body,{headers:{authorization:'Bearer staff'}})).code,403);
  assert.equal((await call(handler,{...body,paid:100000})).code,400);
});

test('missing default admin queue index reports a setup error without modifying payment records',async()=>{
  const f=reviewFixture(),saved=await f.submit(),logs=[];
  const before=f.db.read(`payments/${saved.paymentId}`),transaction=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=work=>transaction(tx=>{
    const get=tx.get.bind(tx);
    tx.get=ref=>{
      if(ref.collection==='payments' && ref.options.order){
        assert.deepEqual(ref.options.filters,[['schemaVersion','==',3],['status','==','pending_verification']]);
        assert.deepEqual(ref.options.order,[['submittedAt','asc'],['paymentId','asc']]);
        throw Object.assign(new Error('The query requires an index. PRIVATE_PROJECT_URL'),{code:9});
      }
      return get(ref);
    };
    return work(tx);
  });
  const handler=createReviewHandler({env,services:()=>f,logger:{error:(...args)=>logs.push(args)}});
  const result=await call(handler,{action:'queue',filters:{status:'pending_verification'}});
  assert.equal(result.code,503);
  assert.equal(result.body.code,'REVIEW_INDEX_REQUIRED');
  assert.doesNotMatch(result.body.error,/result is uncertain/);
  assert.deepEqual(logs[0],['[payment-review]',{action:'queue',stage:'queue',reason:'missing_index',grpcCode:9}]);
  assert.equal(JSON.stringify({logs,body:result.body}).includes('PRIVATE_PROJECT_URL'),false);
  assert.deepEqual(f.db.read(`payments/${saved.paymentId}`),before);
  assert.equal(f.db.count('receipts'),0);
});

test('uncertain decision writes retain the same-command recovery instruction',async()=>{
  const handler=createReviewHandler({env,services:()=>{throw Error('PRIVATE_FAILURE');},logger:{error(){}}});
  const result=await call(handler,{action:'decide',command:{}});
  assert.equal(result.code,503);
  assert.equal(result.body.code,'REVIEW_UNAVAILABLE');
  assert.match(result.body.error,/Retry the same reviewed decision/);
  assert.equal(JSON.stringify(result.body).includes('PRIVATE_FAILURE'),false);
});
