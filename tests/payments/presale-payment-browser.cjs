'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {presaleFixture}=require('./presale-payment-fixture');
const {fixture}=require('./submission-fixture');

(async()=>{
  const f=presaleFixture(),reservation=await f.core.reserve(f.input),credentials={mode:'reservation',secret:reservation.secret};
  f.advance(60000);const {secret,maxAge,...publicReservation}=reservation;
  let loseNext=true;
  const root=path.resolve(__dirname,'../..');
  const files=new Set(['payment-submit.js','presale-payment.js','presale-payment.css','presale.jsx']);
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/presale-payment.css">
    <style>body{margin:0;background:#f6f1e8}#demo-label{position:fixed;z-index:99999;bottom:0;background:#fff3bf;padding:5px;font:12px system-ui}</style>
    <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script><script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
    <script src="/payment-submit.js"></script><script src="/presale-payment.js"></script></head><body><div id="root"></div><div id="demo-label">Synthetic test only — no real payments</div></body></html>`;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
    if(files.has(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));}
    if(url.pathname==='/payment-qr/synthetic-gcash.png'){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(root,'payment-qr/gcash-placeholder.png')));}
    if(url.pathname==='/api/presale'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(url.searchParams.has('paymentOptions')?{gcash:true,maya:false}:{taken:[1]}));}
    if(url.pathname==='/api/payment-submission'){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:true}));
      try{const parts=[];for await(const part of req)parts.push(part);const b=JSON.parse(Buffer.concat(parts));let result;
        if(b.action==='context')result=await f.submissions.context(credentials);
        if(b.action==='list')result=await f.submissions.list(credentials,b.cursor);
        if(b.action==='proof')result=await f.submissions.proof(credentials,b.paymentId,b.revisionId);
        if(b.action==='submit'){result=await f.submissions.submit(credentials,b.command);if(loseNext){loseNext=false;res.statusCode=503;return res.end(JSON.stringify({error:'Simulated lost acknowledgement'}));}}
        return res.end(JSON.stringify(result));
      }catch(e){res.statusCode=e.status||500;return res.end(JSON.stringify({code:e.code,error:e.message}));}
    }
    res.setHeader('Content-Type','text/html');res.end(html);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>window.Babel && window.PresalePayment);
    await page.evaluate(({source,reservation})=>{
      sessionStorage.setItem('ghmp-presale-payment',JSON.stringify(reservation));
      (0,eval)(Babel.transform(source,{presets:['react']}).code);
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.PresaleFlow,{fullPage:true,tiers:[],onClose:()=>{}}));
    },{source:fs.readFileSync(path.join(root,'presale.jsx'),'utf8'),reservation:publicReservation});
    await page.getByRole('button',{name:'I have paid — submit proof'}).waitFor().catch(async e=>{console.error(await page.locator('body').innerText());throw e;});
    assert.equal(await page.getByLabel('Wallet account holder name').count(),0);
    for(const width of [320,390,768,1365]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`QR overflow at ${width}`);}
    await page.setViewportSize({width:390,height:844});const qrShot=path.join(os.tmpdir(),'gh-presale-qr-mobile.png');await page.screenshot({path:qrShot,fullPage:true});
    await page.getByRole('button',{name:'I have paid — submit proof'}).click();
    await page.getByLabel('Wallet account holder name').fill('Synthetic Wallet Owner');await page.getByLabel('Wallet mobile number').fill('09123456789');
    await page.getByLabel('Transfer reference',{exact:true}).fill('QR-BROWSER-001');await page.getByLabel('Transfer date').fill('2026-11-02');await page.getByLabel('Transaction time').fill('12:00');
    const image=Buffer.from((await fixture().command()).image,'base64');
    await page.getByLabel('Receipt image',{exact:true}).setInputFiles({name:'proof.png',mimeType:'image/png',buffer:image});
    await page.getByRole('button',{name:'Review submission',exact:true}).click();await page.getByRole('heading',{name:'Review before submitting'}).waitFor();
    assert.ok(await page.getByText('Synthetic Wallet Owner',{exact:true}).count());
    await page.getByRole('button',{name:'Confirm and submit proof'}).click();await page.getByRole('alert').filter({hasText:'Simulated lost acknowledgement'}).waitFor();
    await page.getByRole('button',{name:'Check / retry submission'}).click();
    await page.getByRole('heading',{name:'Payment submitted — pending admin verification'}).waitFor();assert.equal([...f.db.records.keys()].filter(k=>/^payments\/[^/]+$/.test(k)).length,1);assert.equal(f.db.count('paymentProofs'),1);
    assert.equal(f.db.read('bookings/PRESALE-PS-0001').netCreditCentavos,0);assert.equal(f.db.read('plots/A_1').hold,true);
    const rows=await f.submissions.list(credentials),p=rows.cases[0];
    await f.review.decide('admin',{paymentId:p.paymentId,requestId:'browser-correction-1',expectedVersion:p.version,revisionId:p.revisionId,action:'request_correction',reason:'Clearer image required',buyerNote:'Please upload a clearer screenshot.'});
    await page.getByRole('button',{name:'Refresh submissions'}).click();await page.getByText('Please upload a clearer screenshot.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Correct submission'}).click();assert.equal(await page.getByLabel('Wallet account holder name').inputValue(),'Synthetic Wallet Owner');
    await page.getByLabel('Wallet account holder name').fill('Corrected Wallet Name');await page.getByLabel('Receipt image',{exact:true}).setInputFiles({name:'clearer.png',mimeType:'image/png',buffer:image});
    await page.getByRole('button',{name:'Review submission',exact:true}).click();await page.getByRole('button',{name:'Confirm and submit proof'}).click();
    await page.getByText('Revision 2',{exact:false}).waitFor();assert.equal([...f.db.records.keys()].filter(k=>/^payments\/[^/]+$/.test(k)).length,1);assert.equal(f.db.count('paymentProofs'),2);
    for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    const proofShot=path.join(os.tmpdir(),'gh-presale-pending-mobile.png');await page.screenshot({path:proofShot,fullPage:true});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,qrShot,proofShot,checks:'full presale JSX integration, QR before form, mobile layouts, payer fields, private proof, lost response, correction and held plots'},null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
