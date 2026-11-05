'use strict';
// Synthetic browser integration: no production Firebase calls or real payments.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {reviewFixture}=require('./review-fixture');
const root=path.resolve(__dirname,'../..');
const modules=process.env.PAYMENT_BROWSER_MODULES || path.join(root,'node_modules/.review-qa/node_modules');
const mock=`
window.__role='admin'; window.__roleListeners=[];
const user={uid:'admin',email:'admin@example.test',getIdToken:async()=>'admin'};
window.auth={currentUser:user,onAuthStateChanged(cb){let live=true;queueMicrotask(()=>{if(live)cb(this.currentUser)});return()=>{live=false}},
  signInWithEmailAndPassword(){throw Error('Embedded review must reuse the existing sign-in')},signOut:async()=>{}};
window.db={collection(name){const query={orderBy(){return query},where(){return query},
  onSnapshot(cb){queueMicrotask(()=>cb({docs:[],size:0}));return()=>{}},
  doc(){return {onSnapshot(cb){const notify=()=>cb({exists:true,data:()=>({role:window.__role})});window.__roleListeners.push(notify);queueMicrotask(notify);return()=>{window.__roleListeners=window.__roleListeners.filter(x=>x!==notify)}}}}};return query}};
window.__setRole=role=>{window.__role=role;window.__roleListeners.forEach(cb=>cb())};
`;

(async()=>{
  const f=reviewFixture();await f.submit();let posts=0;
  const publicFiles=new Set(['admin-app.js','payment-review.js','payment-review.css','payment-review-admin.css','payment-view.css','payment-legacy-guard.js','logo-header.png','favicon-32.png','admin-favicon-32.png']);
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=url.pathname.slice(1);
    if(url.pathname==='/api/payment-review'){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:true}));
      posts++;
      try {
        assert.equal(req.headers.authorization,'Bearer admin');
        const parts=[];for await(const part of req)parts.push(part);const b=JSON.parse(Buffer.concat(parts));let result;
        if(b.action==='queue')result=await f.review.queue('admin',b.filters,b.cursor);
        else if(b.action==='detail')result=await f.review.detail('admin',b.paymentId);
        else if(b.action==='proof')result=await f.review.proof('admin',b.paymentId,b.revisionId);
        else if(b.action==='decide')result=await f.review.decide('admin',b.command);
        else throw Error('Unexpected action');
        return res.end(JSON.stringify(result));
      }catch(error){res.statusCode=error.status || 500;return res.end(JSON.stringify({code:error.code,error:error.message}));}
    }
    if(file==='firebase-config.js'){res.setHeader('Content-Type','application/javascript');return res.end(mock);}
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
    const nav=page.locator('.sidebar-nav').getByRole('button',{name:'Online payments to check'});
    await nav.click();
    await page.getByRole('heading',{name:'Oldest first'}).waitFor();
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
    await page.getByLabel('Message to the customer').fill('Please upload a clearer image.');
    await page.getByRole('button',{name:'Review decision'}).click();
    await page.getByRole('button',{name:'Confirm decision'}).click();
    await page.getByRole('status').filter({hasText:'Saved: resubmit requested'}).waitFor();
    assert.equal((await f.core.list(f.account)).cases[0].status,'resubmit_requested');
    assert.equal(f.db.count('receipts'),0);
    await page.getByText('Earlier customer payment references',{exact:true}).click();
    await page.getByText(/No pending payment submissions right now/).waitFor();
    await page.evaluate(()=>window.__setRole('staff'));
    await page.locator('.admin-payment-review').waitFor({state:'detached'});
    assert.equal(await nav.count(),0);
    assert.ok(posts>0);
    await page.goto(base+'/payment-review.html');
    await page.getByRole('heading',{name:'Admin sign-in'}).waitFor();
    await page.getByRole('button',{name:'Use my current sign-in'}).click();
    await page.getByRole('heading',{name:'Oldest first'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,checks:'regular admin embedded sign-in, single navigation entry, private proof, correction, role revocation, earlier references, standalone review, 320/390/768/1440 widths',desktop,mobile}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
