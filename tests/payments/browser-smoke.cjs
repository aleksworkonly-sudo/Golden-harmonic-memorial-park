'use strict';

// Optional browser QA using an installed Playwright module. Not part of the Node-only test script.
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const { chromium }=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const { createPreviewServer }=require('./preview-server');

(async () => {
  const {server,state}=createPreviewServer();
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});
    const context=await browser.newContext({viewport:{width:1365,height:1000}});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',(error)=>errors.push(error.message));
    await page.goto(base+'/my-payments');
    await page.getByRole('button',{name:'Send verification link'}).waitFor();
    await page.getByLabel('Reservation reference').fill('PS-0001');
    await page.getByLabel('Registered email address').fill('buyer@example.test');
    await page.getByRole('button',{name:'Send verification link'}).click();
    await page.getByRole('status').filter({hasText:'If the details match'}).waitFor();
    assert.equal(state.requests,1);
    state.failNext=true;
    await page.getByRole('button',{name:'Send verification link'}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('alert').evaluate((node)=>node===document.activeElement),true);
    assert.equal(await page.getByLabel('Registered email address').inputValue(),'buyer@example.test');
    await page.getByRole('button',{name:'Send verification link'}).click();
    await page.getByRole('status').filter({hasText:'If the details match'}).waitFor();
    const desktop=path.join(os.tmpdir(),'gh-payment-cp2-desktop.png');
    await page.screenshot({path:desktop,fullPage:true});
    await page.getByRole('button',{name:'Account login',exact:true}).click();
    await page.getByLabel('Account email').fill('buyer@example.test');
    await page.getByLabel('Password',{exact:true}).fill('demo-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('heading',{name:'Choose your account'}).waitFor();
    await page.getByRole('button',{name:/Regular plot/}).click();
    await page.getByRole('heading',{name:'Recorded payment history'}).waitFor();
    assert.equal(await page.locator('tbody tr').count(),20);
    await page.getByRole('button',{name:'Load earlier payments'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===24);
    await page.getByRole('button',{name:'Choose another account'}).click();
    await page.getByRole('button',{name:/Premium plot/}).click();
    await page.getByRole('heading',{name:'Recorded payment history'}).waitFor();
    await page.getByRole('button',{name:'Close payment history'}).click();
    await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
    await page.goto(base+'/payment-link.html#access='+'a'.repeat(43));
    await page.getByRole('button',{name:'Continue securely'}).waitFor();
    assert.equal(new URL(page.url()).hash,'');
    assert.equal(state.exchanges,0);
    await page.getByRole('button',{name:'Continue securely'}).click();
    await page.getByRole('heading',{name:'Recorded payment history'}).waitFor();
    assert.equal(state.exchanges,1);
    for(const width of [320,390,768]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`page overflows at ${width}px`);
    }
    await page.setViewportSize({width:390,height:844});
    const mobile=path.join(os.tmpdir(),'gh-payment-cp2-mobile.png');
    await page.screenshot({path:mobile,fullPage:true});
    await page.goto(base+'/payment-link.html');
    assert.equal(await page.getByRole('button',{name:'Continue securely'}).isDisabled(),true);
    state.enabled=false;
    await page.goto(base+'/my-payments');
    await page.getByRole('heading',{name:'Please contact the office'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,checks:'request confirmation, account selection/history/pagination/logout, explicit link exchange, invalid link, disabled state, 320/390/768px overflow, console errors',desktop,mobile},null,2));
  } finally {
    if(browser) await browser.close();
    await new Promise((resolve)=>server.close(resolve));
  }
})().catch((error)=>{console.error(error);process.exitCode=1;});
