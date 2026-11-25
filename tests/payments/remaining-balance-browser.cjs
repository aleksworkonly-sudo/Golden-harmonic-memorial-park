'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {remainingBalanceFixture}=require('./remaining-balance-fixture');
const root=path.resolve(__dirname,'../..'),modules=path.join(root,'node_modules/.review-qa/node_modules');
(async()=>{
  const f=await remainingBalanceFixture();let secret=null;
  const files=new Set(['payment-link.html','payment-link.js','payment-view.js','payment-view.css','payment-submit.js','payment-gateway.js','payment-lifecycle.js','payment-operations.css']);
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=url.pathname.slice(1);
    if(file.startsWith('api/')){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:['api/payment-access','api/payment-submission'].includes(file)}));
      try{
        const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts));let result;
        if(file==='api/payment-access'){
          if(body.action==='exchange'){const session=await f.access.exchange({token:body.token,requester:'browser'});secret=session.secret;result={ok:true};}
          else if(body.action==='guest_summary')result={summary:await f.access.guestSummary({secret})};
          else throw Error('Unexpected access action');
        }else if(file==='api/payment-submission'){
          const credentials={mode:'reservation',secret};
          if(body.action==='context')result=await f.submissions.context(credentials);
          else if(body.action==='list')result=await f.submissions.list(credentials);
          else if(body.action==='submit')result=await f.submissions.submit(credentials,body.command);
          else throw Error('Unexpected submission action');
        }else throw Error('Unexpected API');
        return res.end(JSON.stringify(result));
      }catch(error){res.statusCode=error.status || 500;return res.end(JSON.stringify({error:error.message,code:error.code}));}
    }
    if(file==='my-payments'){
      const html=fs.readFileSync(path.join(root,'my-payments.html'),'utf8')
        .replace(/<script\b[^>]*src="https:[^"]*"[^>]*><\/script>/g,'')
        .replace(/<script src="\/(firebase-config|payment-ocr|payment-communications).js" defer><\/script>/g,'')
        .replace('</title>','</title><script src="/__react.js" defer></script><script src="/__react-dom.js" defer></script>');
      res.setHeader('Content-Type','text/html');return res.end(html);
    }
    if(file==='__react.js' || file==='__react-dom.js'){
      const pkg=file==='__react.js'?'react':'react-dom';res.setHeader('Content-Type','application/javascript');
      return res.end(fs.readFileSync(path.join(modules,pkg,'umd',pkg+'.production.min.js')));
    }
    if(file==='payment-qr/synthetic-gcash.png'){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync(path.join(root,'payment-qr/gcash-placeholder.png')));}
    if(files.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');return res.end(fs.readFileSync(path.join(root,file)));}
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1365,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/payment-link.html#access=${f.token}`);
    await page.getByRole('button',{name:'Continue securely'}).click();
    await page.getByRole('heading',{name:'Recorded payment history'}).waitFor();
    assert.match(await page.locator('.pv-stats').innerText(),/₱19,000.00/);
    await page.getByRole('button',{name:'Pay remaining balance / submit proof',exact:true}).click();
    await page.getByRole('img',{name:'Receiving QR for Synthetic Recipient'}).waitFor();
    assert.equal(await page.getByRole('img',{name:'Receiving QR for Synthetic Recipient'}).evaluate(img=>img.complete && img.naturalWidth>0),true);
    await page.getByLabel('Wallet account holder name').fill('Wallet Owner');
    await page.getByLabel('Wallet mobile number').fill('09123456789');
    await page.getByLabel('Amount you transferred').fill('5000');
    await page.getByLabel('Transfer reference',{exact:true}).fill('BROWSER-PARTIAL-5000');
    await page.getByLabel('Transfer date').fill('2026-11-02');
    await page.getByLabel('Transaction time').fill('12:00');
    await page.getByLabel('Receipt image',{exact:true}).setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(f.command.image,'base64')});
    for(const width of [375,768,1365]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.getByRole('button',{name:'Review submission',exact:true}).click();
    await page.getByRole('heading',{name:'Review before submitting'}).waitFor();
    assert.equal(await page.getByText(/Your amount differs from the expected amount/).count(),0);
    await page.getByText(/Partial payments are allowed/).waitFor();
    await page.getByRole('button',{name:'Confirm and submit proof'}).click();
    await page.getByText(/saved. Awaiting verification/).waitFor();
    assert.equal(f.db.read('bookings/PRESALE-PS-0001').balanceCentavos,1900000);
    const pending=(await f.submissions.list({mode:'reservation',secret})).cases.find(row=>row.status==='pending_verification');
    await f.approve(pending,500000,'BROWSER-PARTIAL-5000');
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByRole('button',{name:'Refresh submissions',exact:true}).click();
    await page.getByText(/available for your remaining balance of ₱14,000.00/).waitFor();
    assert.match(await page.locator('.pv-stats').innerText(),/₱14,000.00/);
    const screenshot=path.join(os.tmpdir(),'gh-email-remaining-gcash.png');
    await page.getByRole('button',{name:'Pay remaining balance / submit proof',exact:true}).click();
    await page.screenshot({path:screenshot,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,checks:'email link exchange, correct balance, verified GCash QR, partial proof upload, approval refresh, 375/768/1365 layouts',screenshot}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
