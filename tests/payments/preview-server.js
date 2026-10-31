'use strict';

// Local-only visual fixture. No Firebase, credentials, email or provider network calls.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { legacySummary } = require('../../lib/payments/read-model');
const ROOT = path.resolve(__dirname, '../..');
const files = new Map(['/my-payments.html','/payment-view.js','/payment-view.css','/payment-link.html','/payment-link.js','/favicon-32.png'].map((name) => [name,path.join(ROOT,name)]));

function createPreviewServer() {
  const state = { enabled:true, exchanges:0, requests:0, failNext:false };
  const account = { firstName:'Maria',lastName:'Santos',name:'Maria Santos',plan:{ tierName:'Regular plot · A-0001',totalPrice:27500,monthlyAmount:1875 },
    totalPrice:27500,monthly:1875,years:1,plots:[{plotCode:'A-0001'}],status:'new',
    firstPaymentDeadlineDate:'2027-02-10',nextInstallmentDueDate:'2027-01-15',
    paymentSubmissions:[{status:'pending'}],payments:Array.from({length:24},(_,index) => ({date:'2026-12-15',amount:index === 0 ? 5000 : 10,ref:`DEMO-${index+1}`,method:'Cash'})) };
  const server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');
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
      return res.end(JSON.stringify(result));
    }
    if(url.pathname === '/__preview/auth.js') {
      res.setHeader('Content-Type','application/javascript');
      return res.end(`window.firebase={auth:{Auth:{Persistence:{SESSION:'session'}}}};
        window.auth={currentUser:null,setPersistence:async()=>{},onAuthStateChanged:()=>()=>{},
        signInWithEmailAndPassword:async()=>{window.auth.currentUser={uid:'demo',getIdToken:async()=>'demo'};return {user:window.auth.currentUser};},signOut:async()=>{window.auth.currentUser=null;}};`);
    }
    const name=url.pathname === '/my-payments' || url.pathname === '/' ? '/my-payments.html' : url.pathname;
    if(!files.has(name)) {res.writeHead(404);return res.end('Not found');}
    let content=await fs.readFile(files.get(name));
    if(name === '/my-payments.html') {
      content=content.toString().replace(/  <script[^\n]*(?:firebasejs|firebase-config)[^\n]*\n/g,'')
        .replace('<script src="/payment-view.js"','<script src="/__preview/auth.js" defer></script><script src="/payment-view.js"')
        .replace('<body>','<body><p class="pv-notice" style="margin:0">Local preview · sample data only · no real email or payments</p>');
    }
    const ext=path.extname(name);
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[ext]);
    res.end(content);
  });
  return { server,state };
}

if(require.main === module) createPreviewServer().server.listen(4173,'127.0.0.1',() => console.log('Sample-only preview: http://127.0.0.1:4173/my-payments'));
module.exports={createPreviewServer};
