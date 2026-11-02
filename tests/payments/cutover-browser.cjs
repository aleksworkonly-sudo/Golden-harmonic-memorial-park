'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');

(async()=>{
  const site=fs.readFileSync(path.resolve(__dirname,'../../site.jsx'),'utf8');
  const index=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
  const css=[...index.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n')+
    [...site.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)].map(m=>m[1]).join('\n');
  const component=site.slice(site.indexOf('function PortalDashboard('),site.indexOf('function CustomerPortal('));
  const balance=site.slice(site.indexOf('function customerPlanBalance('),site.indexOf('function PortalLogin('));
  const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
    body{margin:0;padding:20px;box-sizing:border-box}#sample{max-width:540px;margin:auto}a,button{min-height:44px}</style>
    <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script><script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script></head><body><p>Local synthetic cutover preview</p><div id="sample"></div></body></html>`;
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.Babel && window.ReactDOM);
    await page.evaluate(({site,component,balance})=>{
      // Parse the complete modified JSX, then mount the actual portal component with synthetic props only.
      Babel.transform(site,{presets:['react']});
      const code=Babel.transform(`const {useState,useEffect,useMemo,useRef}=React;${balance}\n${component}\nwindow.sampleRoot=ReactDOM.createRoot(document.getElementById('sample'));window.mountSample=(customer)=>sampleRoot.render(React.createElement(PortalDashboard,{customer,onLogout:()=>{window.sampleLoggedOut=true;}}));`,{presets:['react']}).code;
      (0,eval)(code);window.mountSample({_id:'synthetic',canonicalBookingId:'synthetic-booking',payments:[]});
    },{site,component,balance});
    await page.getByRole('heading',{name:'Your secure payment history'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Open secure payment history'}).getAttribute('href'),'/my-payments?mode=account');
    assert.equal(await page.getByText('Remaining balance',{exact:true}).count(),0);
    for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.setViewportSize({width:390,height:844});const screenshot=path.join(os.tmpdir(),'gh-payment-cp9-cutover.png');await page.screenshot({path:screenshot,fullPage:true});
    await page.getByRole('button',{name:'Log out'}).click();assert.equal(await page.evaluate(()=>window.sampleLoggedOut),true);
    await page.evaluate(()=>window.mountSample({_id:'synthetic',paymentMigrationLock:'review',payments:[]}));await page.getByRole('heading',{name:'Your secure payment history'}).waitFor();
    await page.evaluate(()=>window.mountSample({_id:'synthetic',payments:[]}));await page.getByText('No payment plan has been set up on your account yet.',{exact:false}).waitFor();
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,screenshot,checks:'full JSX parse, canonical/locked portal routing, legacy fallback, logout, 320/390/768px layout'},null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
