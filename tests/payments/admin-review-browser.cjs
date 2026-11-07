'use strict';
// Synthetic browser integration: no production Firebase calls or real payments.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {reviewFixture}=require('./review-fixture');
const {adminRecord}=require('../../lib/payments/admin-records');
const root=path.resolve(__dirname,'../..');
const modules=process.env.PAYMENT_BROWSER_MODULES || path.join(root,'node_modules/.review-qa/node_modules');
const mock=`
window.__role='admin'; window.__roleListeners=[];
const user={uid:'admin',email:'admin@example.test',getIdToken:async()=>'admin'};
window.auth={currentUser:user,onAuthStateChanged(cb){let live=true;queueMicrotask(()=>{if(live)cb(this.currentUser)});return()=>{live=false}},
  signInWithEmailAndPassword(){throw Error('Embedded review must reuse the existing sign-in')},signOut:async()=>{}};
window.db={collection(name){const query={orderBy(){return query},where(){return query},
  onSnapshot(cb){const rows=name==='presaleApplications'?(window.__presales || []):[];queueMicrotask(()=>cb({docs:rows.map(r=>({id:r.ref,data:()=>r})),size:rows.length}));return()=>{}},
  doc(id){return {async get(options){if(options?.source!=='server')throw Error('Sheet must load fresh server data');const row=(window.__presales || []).find(r=>r.ref===id);return {id,exists:!!row,data:()=>row}},onSnapshot(cb){const notify=()=>cb({exists:true,data:()=>({role:window.__role})});window.__roleListeners.push(notify);queueMicrotask(notify);return()=>{window.__roleListeners=window.__roleListeners.filter(x=>x!==notify)}}}}};return query}};
window.__setRole=role=>{window.__role=role;window.__roleListeners.forEach(cb=>cb())};
`;

(async()=>{
  const f=reviewFixture();await f.submit();let posts=0;
  const source={...f.db.read('presaleApplications/PS-0001'),ref:'PS-0001',name:'Verified GCash Buyer',plan:'cash',
    method:'gcash',totalPrice:25000,createdAt:f.time,plotCode:'A-0001',typeId:'regular',blockId:'A',lotNo:1};
  f.db.put('presaleApplications/PS-0001',source);
  f.db.put('paymentReceivingAccounts/demo-gcash',{...f.db.read('paymentReceivingAccounts/demo-bank'),channel:'gcash'});
  const initialScope=f.db.read('paymentSubmissionScopes/'+f.guestKey);
  f.db.put('paymentSubmissionScopes/'+f.guestKey,{...initialScope,offers:initialScope.offers.map(o=>({...o,receivingAccountId:'demo-gcash'}))});
  const paid=await f.core.submit(f.guest,await f.command({requestId:'presale-browser-001',reference:'GCASH-REPORT'}));
  await f.review.decide('admin',f.decision(paid,{verifiedReference:'GCASH-REPORT',receivedCentavos:300000,allocations:[{itemId:'item1',centavos:300000}]}));
  const publicFiles=new Set(['admin-app.js','admin-payment-notifications.js','admin-payment-records.js','cash-receipts.js','payment-review.js','payment-review.css','payment-review-admin.css','payment-view.css','payment-legacy-guard.js','logo-header.png','logo-192.png','favicon-32.png','admin-favicon-32.png']);
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=url.pathname.slice(1);
    if(url.pathname==='/api/cash-receipt'){
      const parts=[];for await(const part of req)parts.push(part);
      const body=JSON.parse(Buffer.concat(parts));
      assert.ok(['list','clients'].includes(body.action));
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({receipts:[],clients:[]}));
    }
    if(url.pathname==='/api/payment-review'){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:true}));
      posts++;
      try {
        assert.equal(req.headers.authorization,'Bearer admin');
        const parts=[];for await(const part of req)parts.push(part);const b=JSON.parse(Buffer.concat(parts));let result;
        if(b.action==='queue')result=await f.review.queue('admin',b.filters,b.cursor);
        else if(b.action==='count')result=await f.review.pendingCount('admin');
        else if(b.action==='detail')result=await f.review.detail('admin',b.paymentId);
        else if(b.action==='proof')result=await f.review.proof('admin',b.paymentId,b.revisionId);
        else if(b.action==='decide')result=await f.review.decide('admin',b.command);
        else if(b.action==='record')result=await adminRecord({db:f.db,auth:f.auth,token:'admin',kind:b.kind,id:b.id,now:f.time});
        else throw Error('Unexpected action');
        return res.end(JSON.stringify(result));
      }catch(error){res.statusCode=error.status || 500;return res.end(JSON.stringify({code:error.code,error:error.message}));}
    }
    if(file==='firebase-config.js'){res.setHeader('Content-Type','application/javascript');return res.end(mock+'\nwindow.__presales='+JSON.stringify([source])+';');}
    if(file==='__react.js' || file==='__react-dom.js'){
      res.setHeader('Content-Type','application/javascript');
      const pkg=file==='__react.js'?'react':'react-dom';
      return res.end(fs.readFileSync(path.join(modules,pkg,'umd',`${pkg}.production.min.js`)));
    }
    if(['admin.html','payment-review.html'].includes(file)){
      let html=fs.readFileSync(path.join(root,file),'utf8')
        .replace(/<script\b[^>]*src="https:[^"]*"[^>]*><\/script>/g,'')
        .replace(/<link[^>]*href="https:[^"]*"[^>]*>/g,'');
      html=html.replace('</head>','<script src="/__react.js"></script><script src="/__react-dom.js"></script></head>');
      res.setHeader('Content-Type','text/html');return res.end(html);
    }
    if(publicFiles.has(file)){
      res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png');
      return res.end(fs.readFileSync(path.join(root,file)));
    }
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const base=`http://127.0.0.1:${server.address().port}`;
    await page.goto(base+'/admin.html');
    assert.doesNotMatch(await page.locator('body').innerText(),/<<<<<<<|>>>>>>>/);
    await page.locator('.sidebar-nav').getByRole('button',{name:/Cash Payments/}).click();
    await page.getByText('No payments waiting for verification.',{exact:true}).waitFor();
    for(const href of ['/payment-cash.html','/payment-gateway-admin.html','/payment-lifecycle-admin.html','/payment-operations-admin.html']){
      assert.equal(await page.locator(`.sidebar-nav a[href="${href}"]`).count(),1);
    }
    const nav=page.locator('.sidebar-nav').getByRole('button',{name:'Online payments to check'});
    await nav.click();
    await page.getByRole('heading',{name:'Oldest first'}).waitFor();
    const count=page.locator('.sidebar-nav .payment-count-badge');
    await count.filter({hasText:/^1$/}).waitFor();
    // A new Presale proof arrives while the administrator already has the page open.
    f.db.put('paymentReceivingAccounts/demo-gcash',{...f.db.read('paymentReceivingAccounts/demo-bank'),channel:'gcash'});
    const scope=f.db.read('paymentSubmissionScopes/'+f.guestKey);
    f.db.put('paymentSubmissionScopes/'+f.guestKey,{...scope,offers:scope.offers.map(o=>({...o,receivingAccountId:'demo-gcash'}))});
    const incoming=await f.core.submit(f.guest,await f.command({requestId:'incoming-presale-002',reference:'GCASH-NEW'}));
    f.db.put('payments/'+incoming.paymentId,{...f.db.read('payments/'+incoming.paymentId),submittedAt:f.time+1});
    await page.evaluate(()=>window.dispatchEvent(new Event('payment-count-refresh')));
    await count.filter({hasText:/^2$/}).waitFor();
    await page.locator('.pr-queue button').filter({hasText:'Verified GCash Buyer'}).waitFor();
    assert.match(await page.locator('.pr-queue').innerText(),/gcash/);
    assert.equal(page.url(),base+'/admin.html');
    assert.equal(await nav.count(),1);
    assert.equal(await page.locator('a[href="/payment-review.html"]').count(),0);
    assert.equal(await page.getByLabel('Admin email',{exact:true}).count(),0);
    await page.locator('.pr-queue button').first().click();
    await page.getByRole('button',{name:'Open selected proof'}).click();
    await page.getByRole('img',{name:'Private proof r1',exact:true}).waitFor();
    const desktop=path.join(os.tmpdir(),'gh-admin-online-review-desktop.png');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:desktop,fullPage:true});
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
    await page.evaluate(()=>window.scrollTo(0,0));
    const mobile=path.join(os.tmpdir(),'gh-admin-online-review-mobile.png');await page.screenshot({path:mobile,fullPage:true});
    await page.getByLabel('Internal review reason').fill('Synthetic correction check');
    const countResponse=page.waitForResponse(r=>r.url().endsWith('/api/payment-review') && r.request().method()==='POST' && r.request().postDataJSON()?.action==='count');
    await page.evaluate(()=>window.dispatchEvent(new Event('payment-count-refresh')));
    await countResponse;
    assert.equal(await page.getByLabel('Internal review reason').inputValue(),'Synthetic correction check');
    await page.getByLabel('Message to the customer').fill('Please upload a clearer image.');
    await page.getByRole('button',{name:'Review decision'}).click();
    await page.getByRole('button',{name:'Confirm decision'}).click();
    await page.getByRole('status').filter({hasText:'Saved: resubmit requested'}).waitFor();
    await count.filter({hasText:/^1$/}).waitFor();
    assert.equal((await f.core.list(f.account)).cases[0].status,'resubmit_requested');
    assert.equal(f.db.count('receipts'),1);
    const failCount=async route=>{
      if(route.request().method()==='POST' && route.request().postDataJSON()?.action==='count')
        return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Count temporarily unavailable'})});
      return route.continue();
    };
    await page.route('**/api/payment-review',failCount);
    await page.evaluate(()=>window.dispatchEvent(new Event('payment-count-refresh')));
    await count.filter({hasText:'!'}).waitFor();
    assert.equal(await count.getAttribute('aria-label'),'Payment count unavailable');
    await page.unroute('**/api/payment-review',failCount);
    await page.evaluate(()=>window.dispatchEvent(new Event('payment-count-refresh')));
    await count.filter({hasText:/^1$/}).waitFor();
    await page.getByText('Earlier customer payment references',{exact:true}).click();
    await page.getByText(/No earlier customer-portal references are pending/).waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('.sidebar-nav').getByRole('button',{name:/Presale Reservations/}).click();
    await page.getByText('Verified GCash Buyer',{exact:true}).click();
    await page.locator('.modal').getByText(/Paid ₱3,000 of ₱25,000 · balance ₱22,000/).waitFor();
    await page.locator('.modal').getByText(/GCASH-REPORT/).waitFor();
    await page.screenshot({path:path.join(os.tmpdir(),'gh-admin-verified-balance.png'),fullPage:true});
    assert.deepEqual(await page.evaluate(async()=>{const rows=await window.AdminPaymentRecords.hydrate(window.__presales.map(r=>({...r,_id:r.ref})),'presale');const sheet=presaleSheetData(rows[0]);return sheet.payments.map(p=>({amount:p.amount,ref:p.ref}));}),[{amount:3000,ref:'GCASH-REPORT'}]);
    await page.getByRole('button',{name:'📝 Customer sheet (edit, then Word)',exact:true}).click();
    const sheet=page.locator('.modal').filter({has:page.getByRole('heading',{name:'Customer monitoring sheet',exact:true})});
    await sheet.getByLabel('Payment 1 ref',{exact:true}).waitFor();
    assert.equal(await sheet.getByLabel('Payment 1 ref',{exact:true}).inputValue(),'GCASH-REPORT');
    assert.equal(await sheet.getByLabel('Payment 1 amount',{exact:true}).inputValue(),'3000');
    assert.equal(await sheet.getByLabel('Payment 1 amount',{exact:true}).getAttribute('readonly'),'');
    assert.match(await sheet.innerText(),/Verified paid ₱3,000.00 · Remaining balance ₱22,000.00/);
    assert.equal(await sheet.getByRole('button',{name:/Save to record/}).count(),0);
    await page.screenshot({path:path.join(os.tmpdir(),'gh-admin-monitoring-sheet.png'),fullPage:true});
    // Exercise the form's download payload, including the payment channel and reference.
    await page.evaluate(()=>{window.__downloadSheet=downloadCustomerSheet;downloadCustomerSheet=async data=>{window.__sheetDownload=data};});
    await sheet.getByRole('button',{name:/Download Word sheet/}).click();
    const downloadedSheet=await page.evaluate(()=>window.__sheetDownload);
    assert.equal(downloadedSheet.amountValue,3000);
    assert.equal(downloadedSheet.payments[0].ref,'GCASH-REPORT');
    assert.equal(downloadedSheet.payments[0].amount,3000);
    assert.match(downloadedSheet.payments[0].note,/GCash/);
    await page.evaluate(()=>{downloadCustomerSheet=window.__downloadSheet});
    const failSheet=async route=>{
      if(route.request().method()==='POST' && route.request().postDataJSON()?.action==='record')
        return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic sheet outage'})});
      return route.continue();
    };
    await page.route('**/api/payment-review',failSheet);
    await page.getByRole('button',{name:'📝 Customer sheet (edit, then Word)',exact:true}).click();
    await sheet.getByRole('alert').filter({hasText:'The sheet could not load current payments'}).waitFor();
    assert.equal(await sheet.getByRole('button',{name:/Download Word sheet/}).count(),0);
    await page.unroute('**/api/payment-review',failSheet);
    await sheet.getByRole('button',{name:'Retry sheet',exact:true}).click();
    await sheet.getByLabel('Payment 1 ref',{exact:true}).waitFor();
    assert.equal(await sheet.getByLabel('Payment 1 ref',{exact:true}).inputValue(),'GCASH-REPORT');
    await sheet.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.locator('.modal').getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:'🖨 Print sheet',exact:true}).click();
    await sheet.getByLabel('Payment 1 ref',{exact:true}).waitFor();
    assert.equal(await sheet.getByLabel('Payment 1 ref',{exact:true}).inputValue(),'GCASH-REPORT');
    await sheet.getByRole('button',{name:'Cancel',exact:true}).click();
    // The sheet can be opened with an old snapshot that predates canonical binding.
    await page.evaluate(()=>{
      const old={...window.__presales[0],_id:window.__presales[0].ref,payments:[]};delete old.canonicalBookingId;
      window.__sheetHost=document.body.appendChild(document.createElement('div'));
      window.__sheetRoot=ReactDOM.createRoot(window.__sheetHost);
      window.__sheetRoot.render(React.createElement(CustomerSheetEditor,{data:presaleSheetData(old),canSave:true,onClose:()=>{}}));
    });
    await sheet.getByLabel('Payment 1 ref',{exact:true}).waitFor();
    assert.equal(await sheet.getByLabel('Payment 1 ref',{exact:true}).inputValue(),'GCASH-REPORT');
    page.once('dialog',dialog=>dialog.accept());
    await sheet.getByRole('button',{name:'Reload sheet',exact:true}).click();
    await sheet.getByLabel('Payment 1 ref',{exact:true}).waitFor();
    assert.equal(await sheet.getByLabel('Payment 1 ref',{exact:true}).inputValue(),'GCASH-REPORT');
    assert.equal(await sheet.getByLabel('Payment 2 amount',{exact:true}).inputValue(),'');
    await page.evaluate(()=>{window.__sheetRoot.unmount();window.__sheetHost.remove();});
    const exports=[];
    for(const label of ['Sales','Tax (VAT)','Allocation']){
      await page.getByRole('button',{name:label,exact:true}).click();
      const downloaded=page.waitForEvent('download');
      await page.getByRole('button',{name:/Download.*Excel/}).click();
      const download=await downloaded;const csv=fs.readFileSync(await download.path(),'utf8');
      assert.match(csv,/Verified GCash Buyer/);
      if(label==='Sales'){assert.match(csv,/Verified paid/);assert.match(csv,/3000.00/);assert.match(csv,/22000.00/);}
      else {assert.match(csv,/GCASH-REPORT/);assert.match(csv,/3000/);}
      exports.push(label);
    }
    const failRecord=async route=>{
      if(route.request().method()==='POST' && route.request().postDataJSON()?.action==='record')
        return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic ledger outage'})});
      return route.continue();
    };
    await page.route('**/api/payment-review',failRecord);
    await page.evaluate(()=>window.dispatchEvent(new Event('payment-records-changed')));
    await page.getByRole('alert').filter({hasText:'Reports are paused'}).waitFor();
    assert.equal(await page.getByRole('button',{name:/Download.*Excel/}).count(),0);
    await page.unroute('**/api/payment-review',failRecord);
    await page.getByRole('button',{name:'Retry records',exact:true}).click();
    await page.getByText('Verified GCash Buyer',{exact:true}).first().waitFor();
    await nav.click();
    await page.evaluate(()=>window.__setRole('staff'));
    await page.locator('.admin-payment-review').waitFor({state:'detached'});
    assert.equal(await nav.count(),0);
    assert.ok(posts>0);
    await page.goto(base+'/payment-review.html');
    await page.getByRole('heading',{name:'Admin sign-in'}).waitFor();
    await page.getByRole('button',{name:'Use my current sign-in'}).click();
    await page.getByRole('heading',{name:'Oldest first'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,checks:'regular admin embedded sign-in, single navigation entry, private proof, correction, role revocation, earlier references, verified reservation balance and sales/VAT/allocation CSV exports, monitoring sheet from both entry points and stale snapshots, protected payment rows and download data, sheet outage/retry/reload, standalone review, 320/390/768/1440 widths',desktop,mobile}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
