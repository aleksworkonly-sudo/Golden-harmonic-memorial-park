'use strict';

// Local-only visual fixture. No Firebase, credentials, email or provider network calls.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { legacySummary } = require('../../lib/payments/read-model');
const { fixture } = require('./submission-fixture');
const { reviewFixture } = require('./review-fixture');
const { cashFixture } = require('./cash-fixture');
const { gatewayFixture } = require('./gateway-fixture');
const { createAccessService } = require('../../lib/payments/access');
const ROOT = path.resolve(__dirname, '../..');
const files = new Map(['/my-payments.html','/payment-view.js','/payment-submit.js','/payment-demo-qr.png','/payment-view.css','/payment-link.html','/payment-link.js','/favicon-32.png','/payment-review.html','/payment-review.js','/payment-review.css','/payment-cash.html','/payment-cash.js','/payment-cash.css','/payment-gateway.js','/payment-gateway-admin.js','/payment-gateway-admin.html'].map((name) => [name,path.join(ROOT,name)]));

function createPreviewServer({reviewMode=false,cashMode=false,gatewayMode=false}={}) {
  const state = { enabled:true, submissionsEnabled:true, reviewEnabled:true, exchanges:0, requests:0, failNext:false, loseNextSubmission:false, accessLost:false, loseNextDecision:false, loseNextCash:false,loseNextGateway:false };
  const submissions = gatewayMode ? gatewayFixture() : cashMode ? cashFixture() : reviewMode ? reviewFixture() : fixture();
  const reviewReady=reviewMode ? (async()=>{
    await submissions.submit();
    await submissions.core.submit(submissions.guest,await submissions.command({requestId:'guest-preview-001'}));
  })() : Promise.resolve();
  const access=createAccessService({db:submissions.db,auth:submissions.auth,rateSecret:'preview-only-secret-at-least-32-characters',now:()=>submissions.time});
  const account = { firstName:'Maria',lastName:'Santos',name:'Maria Santos',plan:{ tierName:'Regular plot · A-0001',totalPrice:27500,monthlyAmount:1875 },
    totalPrice:27500,monthly:1875,years:1,plots:[{plotCode:'A-0001'}],status:'new',
    firstPaymentDeadlineDate:'2027-02-10',nextInstallmentDueDate:'2027-01-15',
    paymentSubmissions:[{status:'pending'}],payments:Array.from({length:24},(_,index) => ({date:'2026-12-15',amount:index === 0 ? 5000 : 10,ref:`DEMO-${index+1}`,method:'Cash'})) };
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname === '/api/paymongo-checkout') {
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:gatewayMode}));
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>32768){res.writeHead(413);return res.end('{}');}}
      try {
        if(!gatewayMode)throw Error('Use --gateway preview mode.');
        const body=JSON.parse(raw || '{}'),token=String(req.headers.authorization || '').replace(/^Bearer /,'');let result;
        const core=submissions.gateway,c=body.mode==='account'?{mode:'account',customerId:body.customerId,idToken:token}:submissions.guest;
        if(body.action==='context')result=await core.context(c);
        if(body.action==='create')result=await core.create(c,body.command);
        if(body.action==='queue')result=await core.adminQueue(token,body.kind,body.cursor);
        if(body.action==='detail')result=await core.adminDetail(token,body.eventKey);
        if(body.action==='recover')result=await core.recover(token,body.command);
        if(body.action==='resolve')result=await core.resolve(token,body.command);
        if(state.loseNextGateway && ['create','resolve','recover'].includes(body.action)){state.loseNextGateway=false;res.writeHead(503);return res.end(JSON.stringify({error:'Preview lost the response. Retry the same operation.'}));}
        return res.end(JSON.stringify(result));
      }catch(error){res.writeHead(error.status || 503);return res.end(JSON.stringify({error:error.message,code:error.code}));}
    }
    if(url.pathname === '/api/payment-cash') {
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:cashMode}));
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>737280){res.writeHead(413);return res.end('{}');}}
      try {
        if(!cashMode)throw Error('Use --cash preview mode.');
        const body=JSON.parse(raw || '{}'),token=String(req.headers.authorization || '').replace(/^Bearer /,'');let result;
        const core=submissions.cash;
        if(body.action==='context')result=await core.context(token,body.sourceKind,body.sourceId);
        if(body.action==='queue')result=await core.queue(token,body.filters,body.cursor);
        if(body.action==='detail')result=await core.detail(token,body.paymentId);
        if(body.action==='proof')result=await core.proof(token,body.paymentId,body.revisionId);
        if(['record','print','photo','approve'].includes(body.action)) {
          result=await core.mutate(token,body.action,body.command);
          if(state.loseNextCash){state.loseNextCash=false;res.writeHead(503);return res.end(JSON.stringify({error:'Preview lost the response. Retry this exact step.'}));}
        }
        return res.end(JSON.stringify(result));
      }catch(error){res.writeHead(error.status || 503);return res.end(JSON.stringify({error:error.message,code:error.code}));}
    }
    if(url.pathname === '/api/payment-review') {
      res.setHeader('Content-Type','application/json');await reviewReady;
      if(req.method==='GET')return res.end(JSON.stringify({enabled:reviewMode && state.reviewEnabled}));
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>32768){res.writeHead(413);return res.end('{}');}}
      try {
        const body=JSON.parse(raw || '{}'), token=String(req.headers.authorization || '').replace(/^Bearer /,'');let result;
        if(!reviewMode)throw Error('Use the review preview mode.');
        if(body.action==='queue')result=await submissions.review.queue(token,body.filters,body.cursor);
        if(body.action==='detail')result=await submissions.review.detail(token,body.paymentId);
        if(body.action==='proof')result=await submissions.review.proof(token,body.paymentId,body.revisionId);
        if(body.action==='decide') {
          result=await submissions.review.decide(token,body.command);
          if(state.loseNextDecision){state.loseNextDecision=false;res.writeHead(503);return res.end(JSON.stringify({error:'Preview lost the response. Retry the same decision.'}));}
        }
        return res.end(JSON.stringify(result));
      }catch(error){res.writeHead(error.status || 503);return res.end(JSON.stringify({error:error.message,code:error.code}));}
    }
    if(url.pathname === '/api/payment-submission') {
      res.setHeader('Content-Type','application/json');
      if(req.method === 'GET') return res.end(JSON.stringify({enabled:state.submissionsEnabled}));
      if(state.accessLost) {res.writeHead(401);return res.end(JSON.stringify({code:'SESSION_REQUIRED',error:'Access expired.'}));}
      let raw=''; for await(const chunk of req) {raw+=chunk;if(raw.length>740000){res.writeHead(413);return res.end('{}');}}
      try {
        const body=JSON.parse(raw || '{}');
        const identity=body.mode === 'account' ? {...submissions.account,customerId:body.customerId} : submissions.guest;
        let result;
        if(body.action==='context') result=await submissions.core.context(identity);
        if(body.action==='list') result=await submissions.core.list(identity,body.cursor);
        if(body.action==='proof') result=await submissions.core.proof(identity,body.paymentId,body.revisionId);
        if(body.action==='submit') {
          result=await submissions.core.submit(identity,body.command);
          if(state.loseNextSubmission) {state.loseNextSubmission=false;res.writeHead(503);return res.end(JSON.stringify({error:'Preview lost the response. Retry these same details.'}));}
        }
        return res.end(JSON.stringify(result));
      } catch(error) {res.writeHead(error.status || 503);return res.end(JSON.stringify({error:error.message,code:error.code}));}
    }
    if (url.pathname === '/api/payment-access') {
      res.setHeader('Content-Type','application/json');
      if(req.method === 'GET') return res.end(JSON.stringify({enabled:state.enabled}));
      let raw=''; for await(const chunk of req) { raw+=chunk; if(raw.length>8192) {res.writeHead(413);return res.end('{}');} }
      const body=JSON.parse(raw || '{}');
      if(state.failNext) {state.failNext=false;res.writeHead(503);return res.end(JSON.stringify({error:'Please try again. Preview service unavailable.'}));}
      let result={ok:true};
      if(body.action === 'request_link') {state.requests++;result={message:'If the details match a reservation, a verification link will be sent to its registered email. Please check your inbox and spam folder.'};}
      if(body.action === 'exchange') state.exchanges++;
      if(body.action === 'guest_summary') result={summary:legacySummary('presale','PS-0001',{...account,plan:'installment'},body.cursor)};
      if(body.action === 'account_list') result={accounts:[{id:'c1',label:'Regular plot · A-0001'},{id:'c2',label:'Premium plot · B-0002'}]};
      if(body.action === 'account_summary') result={summary:legacySummary('customer',body.customerId,account,body.cursor)};
      if((reviewMode || cashMode || gatewayMode) && body.action==='account_summary')result={summary:await access.accountSummary({idToken:'buyer',customerId:body.customerId,cursor:body.cursor})};
      if((reviewMode || cashMode || gatewayMode) && body.action==='guest_summary')result={summary:await access.guestSummary({secret:submissions.guest.secret,cursor:body.cursor})};
      return res.end(JSON.stringify(result));
    }
    if(url.pathname === '/__preview/auth.js') {
      res.setHeader('Content-Type','application/javascript');
      return res.end(`window.firebase={auth:{Auth:{Persistence:{SESSION:'session'}}}};
        window.auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:()=>()=>{},
        signInWithEmailAndPassword:async(email)=>{const uid=email.split('@')[0];window.auth.currentUser={uid,getIdToken:async()=>uid};return {user:window.auth.currentUser};},signOut:async()=>{window.auth.currentUser=null;}};`);
    }
    const name=url.pathname === '/my-payments' || url.pathname === '/' ? '/my-payments.html' : url.pathname;
    if(!files.has(name)) {res.writeHead(404);return res.end('Not found');}
    let content=await fs.readFile(files.get(name));
    if(name === '/my-payments.html' || name === '/payment-review.html' || name === '/payment-cash.html' || name === '/payment-gateway-admin.html') {
      content=content.toString().replace(/  <script[^\n]*(?:firebasejs|firebase-config)[^\n]*\n/g,'')
        .replace('<script src="/payment-view.js"','<script src="/__preview/auth.js" defer></script><script src="/payment-view.js"')
        .replace('<script src="/payment-review.js"','<script src="/__preview/auth.js" defer></script><script src="/payment-review.js"')
        .replace('<script src="/payment-cash.js"','<script src="/__preview/auth.js" defer></script><script src="/payment-cash.js"')
        .replace('<script src="/payment-gateway-admin.js"','<script src="/__preview/auth.js" defer></script><script src="/payment-gateway-admin.js"')
        .replace('<body>','<body><p class="pv-notice" style="margin:0">Local preview · sample data only · use fake login details · no real email or payments</p>');
    }
    const ext=path.extname(name);
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[ext]);
    res.end(content);
  });
  return { server,state,submissions };
}

if(require.main === module) createPreviewServer({reviewMode:process.argv.includes('--review'),cashMode:process.argv.includes('--cash'),gatewayMode:process.argv.includes('--gateway')}).server.listen(4173,'127.0.0.1',() => console.log('Sample-only preview: http://127.0.0.1:4173/my-payments or /payment-review.html (with --review), /payment-cash.html (with --cash)'));
module.exports={createPreviewServer};
