'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {createPreviewServer}=require('./preview-server');
(async()=>{
  const {server,state,submissions:f}=createPreviewServer({operationsMode:true});const paid=await f.paid();
  await new Promise((r)=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const admin=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];admin.on('pageerror',(e)=>errors.push(e.message));
    await admin.goto(base+'/payment-operations-admin.html');await admin.getByLabel('Admin email').fill('staff@example.test');await admin.getByLabel('Password',{exact:true}).fill('fake');await admin.getByRole('button',{name:'Sign in for payment operations'}).click();await admin.getByRole('alert').filter({hasText:'Only an admin'}).waitFor();
    await admin.getByLabel('Admin email').fill('admin@example.test');await admin.getByLabel('Password',{exact:true}).fill('fake');await admin.getByRole('button',{name:'Sign in for payment operations'}).click();
    await admin.locator('.pr-queue button').filter({hasText:'payment verified'}).click();await admin.getByRole('button',{name:'Prepare stored message'}).click();await admin.getByText('To: buyer@example.test',{exact:true}).waitFor();assert.equal(f.sent.length,0);
    f.state.outcome='uncertain';await f.outbox.dispatch(paid.receiptId);await admin.getByLabel('Delivery state').selectOption('uncertain');await admin.locator('.pr-queue button').first().click();
    await admin.getByLabel('Verified provider outcome').selectOption('retry_not_sent');await admin.getByLabel('Provider investigation notes').fill('Provider lookup confirmed no acceptance of this event.');await admin.getByRole('button',{name:'Review delivery decision'}).click();
    state.loseNextOperations=true;await admin.getByRole('button',{name:'Confirm delivery review',exact:true}).click();await admin.getByRole('button',{name:'Retry same delivery review'}).click();await admin.getByRole('status').filter({hasText:'Delivery review saved: retry'}).waitFor();assert.equal(f.sent.length,1);
    await admin.getByRole('button',{name:'Collection report',exact:true}).click();await admin.getByLabel('From date (Manila)').fill('2026-10-30');await admin.getByLabel('To date (Manila)').fill('2026-10-31');await admin.getByRole('button',{name:'Generate collection report'}).click();await admin.getByRole('heading',{name:'Verified collections'}).waitFor();
    const download=admin.waitForEvent('download');await admin.getByRole('button',{name:'Download CSV'}).click();assert.match((await download).suggestedFilename(),/^collections-/);
    await admin.getByRole('button',{name:'Customer statement',exact:true}).click();await admin.getByLabel('Canonical booking ID').fill('booking-c1');await admin.getByRole('button',{name:'Open customer statement'}).click();await admin.getByRole('heading',{name:'Customer monitoring statement'}).waitFor();
    const desktop=path.join(os.tmpdir(),'gh-payment-cp8-desktop.png');await admin.screenshot({path:desktop,fullPage:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',(e)=>errors.push(e.message));await page.goto(base+'/my-payments?mode=account');await page.getByLabel('Account email').fill('buyer@example.test');await page.getByLabel('Password',{exact:true}).fill('fake');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:/Regular plot/}).click();
    await page.getByRole('heading',{name:'Updates and acknowledgements'}).waitFor();await page.getByRole('button',{name:`View ${paid.receiptId}`,exact:true}).click();await page.getByRole('heading',{name:'Payment acknowledgement'}).waitFor();
    await page.getByRole('button',{name:'Add payment proof'}).click();await page.getByLabel('Amount you transferred (₱)').fill('123');await page.getByLabel('Transfer reference').fill('KEEP-MANUAL');await page.getByLabel('Transfer date (Philippines)').fill('2026-10-30');
    const input=await f.command();await page.getByLabel('Receipt image',{exact:true}).setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from(input.image,'base64')});
    await page.getByRole('button',{name:'Read receipt image',exact:true}).waitFor();
    if(process.env.PAYMENT_TEST_REAL_OCR==='true'){
      const failures=[];page.on('requestfailed',(r)=>failures.push({url:r.url(),error:r.failure()?.errorText}));page.on('console',(m)=>{if(m.type()==='error')failures.push({error:m.text()});});
      const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='32px Arial';['Reference No: OCR12345','Amount: PHP 5,000.00','2026-10-30'].forEach((line,i)=>ctx.fillText(line,40,60+i*70));return c.toDataURL('image/png').split(',')[1];});
      await page.getByLabel('Receipt image',{exact:true}).setInputFiles({name:'synthetic-receipt.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
      await page.getByRole('button',{name:'Read receipt image',exact:true}).click();
      try{await page.getByText('Auto-detected — please check each suggestion.',{exact:true}).waitFor({timeout:25000});}
      catch(e){console.error(JSON.stringify({ocrStatus:await page.getByRole('region',{name:'Optional receipt reader'}).innerText(),failures}));throw e;}
      assert.equal(await page.getByLabel('Transfer reference').inputValue(),'KEEP-MANUAL');
      assert.ok(await page.getByRole('button',{name:'Use amount suggestion',exact:true}).count());
    }
    await page.evaluate(()=>{window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:'Reference No: OCR12345\nAmount: PHP 5,000.00\n2026-10-30',confidence:92}}),terminate:async()=>{}})};});
    await page.getByRole('button',{name:'Read receipt image',exact:true}).click();await page.getByText('Auto-detected — please check each suggestion.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Transfer reference').inputValue(),'KEEP-MANUAL');assert.equal(await page.getByLabel('Amount you transferred (₱)').inputValue(),'123');
    await page.getByRole('button',{name:'Use reference suggestion',exact:true}).click();assert.equal(await page.getByLabel('Transfer reference').inputValue(),'OCR12345');
    await page.evaluate(()=>{window.Tesseract={createWorker:async()=>({recognize:async()=>new Promise(()=>{}),terminate:async()=>{}})};});await page.getByRole('button',{name:'Read receipt image',exact:true}).click();await page.getByRole('button',{name:'Cancel reading'}).click();await page.getByText('Reading cancelled. Enter details manually.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Transfer reference').inputValue(),'OCR12345');
    for(const width of [320,390,768]){await admin.setViewportSize({width,height:1000});await page.setViewportSize({width,height:1000});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.setViewportSize({width:390,height:844});const mobile=path.join(os.tmpdir(),'gh-payment-cp8-mobile.png');await page.screenshot({path:mobile,fullPage:true});
    await admin.getByRole('button',{name:'Sign out',exact:true}).click();await admin.getByRole('heading',{name:'Admin sign-in'}).waitFor();assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,desktop,mobile,realOCR:process.env.PAYMENT_TEST_REAL_OCR==='true',checks:'staff denial, stored email preparation, uncertain retry, CSV, statement, owner acknowledgement, OCR fallback/manual preservation, responsive widths'},null,2));
  }finally{if(browser)await browser.close();await new Promise((r)=>server.close(r));}
})().catch((e)=>{console.error(e);process.exitCode=1;});
