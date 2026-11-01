'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {createPreviewServer}=require('./preview-server');
(async()=>{
  const {server,state,submissions:f}=createPreviewServer({gatewayMode:true});await new Promise((r)=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',(e)=>errors.push(e.message));await page.goto(base+'/my-payments?mode=account&gateway_return=1');
    await page.getByLabel('Account email').fill('buyer@example.test');await page.getByLabel('Password',{exact:true}).fill('fake');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:/Regular plot/}).click();await page.getByRole('button',{name:'Review online checkout'}).click();
    await page.getByText('deposit · principal ₱5,000.00 · buyer fee ₱125.00 · total ₱5,125.00').waitFor();
    state.loseNextGateway=true;await page.getByRole('button',{name:'Create secure checkout'}).click();await page.getByRole('button',{name:'Retry same checkout request'}).click();
    const checkout=page.getByRole('link',{name:'Continue to PayMongo'});await checkout.waitFor();assert.match(await checkout.getAttribute('href'),/^https:\/\/checkout.paymongo.com\//);assert.equal(f.state.creates,1);
    await f.submit();f.pay();assert.equal((await f.deliver()).state,'needs_reconciliation');await page.getByRole('button',{name:'Refresh checkout status'}).click();
    await page.getByText('Provider payment needs office reconciliation.').first().waitFor();assert.equal(f.db.count('receipts'),0);
    const admin=await browser.newPage({viewport:{width:1440,height:1000}});admin.on('pageerror',(e)=>errors.push(e.message));await admin.goto(base+'/payment-gateway-admin.html');
    await admin.getByLabel('Admin email').fill('staff@example.test');await admin.getByLabel('Password',{exact:true}).fill('fake');await admin.getByRole('button',{name:'Sign in for reconciliation'}).click();
    await admin.getByRole('alert').filter({hasText:'Only an admin'}).waitFor();await admin.getByLabel('Admin email').fill('admin@example.test');await admin.getByLabel('Password',{exact:true}).fill('fake');
    await admin.getByRole('button',{name:'Sign in for reconciliation'}).click();await admin.locator('.pr-queue button').filter({hasText:'evt_001'}).click();
    await admin.getByLabel('Provider decision').selectOption('post');await admin.getByLabel('c1_plot1 — remaining').fill('5000');
    await admin.getByLabel('I checked manual receipts').check();await admin.getByLabel('Reconciliation reason').fill('Checked statement: manual screenshot is unrelated.');
    await admin.getByRole('button',{name:'Review provider decision'}).click();
    const desktop=path.join(os.tmpdir(),'gh-payment-cp6-desktop.png');await admin.screenshot({path:desktop,fullPage:true});
    for(const width of [320,390,768]){await admin.setViewportSize({width,height:1000});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await admin.setViewportSize({width:390,height:844});const mobile=path.join(os.tmpdir(),'gh-payment-cp6-mobile.png');await admin.screenshot({path:mobile,fullPage:true});
    state.loseNextGateway=true;await admin.getByRole('button',{name:'Confirm provider action',exact:true}).click();await admin.getByRole('button',{name:'Retry provider action'}).click();
    await admin.getByRole('status').filter({hasText:'Saved provider result: posted'}).waitFor();assert.equal(f.db.count('receipts'),1);
    await page.getByRole('button',{name:'Refresh checkout status'}).click();await page.getByText('Payment recorded.',{exact:true}).waitFor();
    f.state.timeout=true;const guest=await f.gateway.create(f.guest,f.gatewayCommand({requestId:'guest-browser-001'}));
    await admin.getByLabel('Internal checkout ID').fill(guest.intentId);await admin.getByLabel('PayMongo session ID').fill('cs_2');
    await admin.getByRole('button',{name:'Review checkout recovery'}).click();await admin.getByRole('button',{name:'Confirm provider action',exact:true}).click();
    await admin.getByRole('status').filter({hasText:'Saved provider result: ready'}).waitFor();assert.equal(f.state.creates,2);
    await admin.getByRole('button',{name:'Sign out',exact:true}).click();await admin.getByRole('heading',{name:'Admin sign-in'}).waitFor();assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,desktop,mobile,checks:'approved fee review, checkout reuse, uncertain response, manual overlap, admin resolution, recovered session, customer status, responsive widths'},null,2));
  }finally{if(browser)await browser.close();await new Promise((r)=>server.close(r));}
})().catch((e)=>{console.error(e);process.exitCode=1;});
