'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const { createAccessHandler, configuration, COOKIE, createLinkSender }=require('../../lib/payments/access-http');
const { MemoryFirestore }=require('./memory-firestore');
const legacyHandler=require('../../api/presale-track');
const ORIGIN='https://park.example.test';
const env={ PAYMENT_ACCESS_ENABLED:'true', PAYMENT_ACCESS_ORIGIN:ORIGIN, PAYMENT_ACCESS_RATE_SECRET:'test-only-secret-at-least-32-characters', BREVO_API_KEY:'test-key', SENDER_EMAIL:'office@example.test' };
function setup() {
  const db=new MemoryFirestore({ 'presaleApplications/PS-0001':{ email:'buyer@example.test',accessVersion:1,totalPrice:22000,payments:[] },
    'customers/c1':{ authUid:'buyer',plan:{ totalPrice:22000 },payments:[] } });
  const sent=[];
  const handler=createAccessHandler({ env, services:() => ({ db, auth:{ verifyIdToken:async (token) => ({ uid:token }) } }),
    sender:async (mail) => sent.push(mail),sleep:async () => {},minimumRequestMs:0 });
  return { db,sent,handler };
}
async function call(handler, body, options={}) {
  const req={ method:'POST',body,headers:{ origin:ORIGIN,'content-type':'application/json',...options.headers },socket:{ remoteAddress:'127.0.0.1' },...options };
  // Merge headers after top-level overrides.
  req.headers={ origin:ORIGIN,'content-type':'application/json',...options.headers };
  const res={ headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.body=data;return this;} };
  await handler(req,res); return res;
}

test('feature is off without complete trusted HTTPS configuration; no Firebase initialization', async () => {
  for(const settings of [{}, { ...env,PAYMENT_ACCESS_ORIGIN:'http://park.example.test' },{ ...env,PAYMENT_ACCESS_ORIGIN:ORIGIN+'/' }]) assert.equal(configuration(settings).enabled,false);
  const handler=createAccessHandler({env:{},services:() => {throw new Error('must not initialize');}});
  const result=await call(handler,{action:'account_list'});
  assert.equal(result.code,503);
  assert.deepEqual((await call(handler,null,{method:'GET'})).body,{enabled:false});
});

test('GET never consumes a link; POST exchange uses a Secure HttpOnly host cookie, not a JSON secret', async () => {
  const {handler,sent,db}=setup();
  await call(handler,{action:'request_link',reference:'PS-0001',email:'buyer@example.test'});
  const token=new URL(sent[0].url).hash.slice(8);
  await call(handler,null,{method:'GET',query:{token}});
  assert.equal(db.count('reservationSessions'),0);
  const result=await call(handler,{action:'exchange',token});
  assert.equal(result.code,200); assert.deepEqual(result.body,{ok:true});
  assert.match(result.headers['Set-Cookie'],new RegExp(`^${COOKIE}=`));
  for(const flag of ['Secure','HttpOnly','SameSite=Strict','Path=/']) assert.ok(result.headers['Set-Cookie'].includes(flag));
  assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal((await call(handler,{action:'exchange',token})).code,401);
  const cookie=result.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call(handler,{action:'guest_summary'},{headers:{cookie}})).code,200);
  assert.equal((await call(handler,{action:'logout'},{headers:{cookie}})).code,200);
  assert.equal((await call(handler,{action:'guest_summary'},{headers:{cookie}})).code,401);
});

test('CSRF, content-type, oversized bodies and caller-supplied destination/scope fields fail', async () => {
  const {handler,db}=setup();
  assert.equal((await call(handler,{action:'request_link'},{headers:{origin:'https://evil.example'}})).code,403);
  assert.equal((await call(handler,{action:'request_link'},{headers:{origin:undefined}})).code,403);
  assert.equal((await call(handler,{action:'logout'},{headers:{'content-type':'text/plain'}})).code,415);
  assert.equal((await call(handler,'x'.repeat(5000))).code,413);
  assert.equal((await call(handler,'{broken')).code,400);
  assert.equal((await call(handler,{action:'guest_summary',reference:'PS-0002'})).code,400);
  assert.equal((await call(handler,{action:'request_link',reference:'PS-0001',email:'buyer@example.test',to:'evil@example.test'})).code,400);
  assert.equal(db.count('reservationSessions'),0);
});

test('account reads require a verified bearer identity and return no private owner tokens', async () => {
  const {handler}=setup();
  assert.equal((await call(handler,{action:'account_list'})).code,401);
  const result=await call(handler,{action:'account_list'},{headers:{authorization:'Bearer buyer'}});
  assert.deepEqual(result.body.accounts,[{id:'c1',label:'Plot account'}]);
  assert.equal((await call(handler,{action:'account_summary',customerId:'c1'},{headers:{authorization:'Bearer another'}})).code,403);
});

test('legacy reference/mobile endpoint no longer exposes payment history', async () => {
  const result=await call(legacyHandler,{ref:'PS-0001',mobile:'09123456789'});
  assert.equal(result.code,410);
  assert.equal(result.body.code,'EMAIL_ACCESS_REQUIRED');
  assert.equal(result.body.payments,undefined);
});

test('Brevo sender uses a fixed template/subject and never forwards provider error details', async () => {
  const requests=[];
  const sender=createLinkSender(env,async (...args) => {requests.push(args);return {ok:true};});
  await sender({to:'buyer@example.test',url:ORIGIN+'/payment-link.html#access=test'});
  const payload=JSON.parse(requests[0][1].body);
  assert.deepEqual(payload.to,[{email:'buyer@example.test'}]);
  assert.ok(payload.textContent.includes('expires in 15 minutes'));
  assert.equal(payload.htmlContent,undefined);
});
