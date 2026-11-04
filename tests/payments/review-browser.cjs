'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {createPreviewServer}=require('./preview-server');
(async()=>{
  const {server,state,submissions}=createPreviewServer({reviewMode:true});
  await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;let browser;
  try {
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',(error)=>errors.push(error.message));await page.goto(base+'/payment-review.html');
    await page.getByLabel('Admin email').fill('staff@example.test');await page.getByLabel('Password',{exact:true}).fill('fake-password');
    await page.getByRole('button',{name:'Sign in to review'}).click();await page.getByRole('alert').filter({hasText:'Only an admin'}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Oldest first'}).count(),0);
    await page.getByLabel('Admin email').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill('fake-password');
    await page.getByRole('button',{name:'Sign in to review'}).click();
    await page.locator('.pr-queue button').filter({hasText:'c1'}).click();await page.getByRole('heading',{name:'Review c1',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open selected proof'}).click();await page.getByRole('img',{name:'Private proof r1',exact:true}).waitFor();
    await page.getByLabel('Decision',{exact:true}).selectOption('request_correction');
    await page.getByLabel('Internal review reason').fill('Internal-only: unreadable reference.');await page.getByLabel('Message to the customer').fill('Please send a clearer receipt.');
    await page.getByRole('button',{name:'Review decision'}).click();await page.getByRole('button',{name:'Confirm decision'}).click();
    await page.getByRole('status').filter({hasText:'Saved: resubmit requested'}).waitFor();
    const current=(await submissions.core.list(submissions.account)).cases[0];assert.equal(current.evidenceRevisionCount,1);
    await submissions.core.submit(submissions.account,await submissions.command({requestId:'browser-correct-01',paymentId:current.paymentId,expectedVersion:current.version,reference:'CLEAR-REF'}));
    await page.getByRole('button',{name:'Refresh queue'}).click();await page.locator('.pr-queue button').filter({hasText:'c1'}).click();
    await page.getByRole('button',{name:'Open selected proof'}).click();await page.getByRole('img',{name:'Private proof r2',exact:true}).waitFor();
    await page.getByLabel('Decision',{exact:true}).selectOption('approve');await page.getByLabel('I checked the statement').check();
    await page.getByLabel('Actual amount received').fill('26000');await page.getByLabel('Actual received date/time').fill('2026-10-30T12:00');
    await page.getByLabel('Statement reference',{exact:true}).fill('BROWSER-BANK-01');
    await page.getByLabel('c1_plot1 — remaining').fill('10000');await page.getByLabel('c1_plot2 — remaining').fill('15000');
    await page.getByLabel('Internal review reason').fill('Verified actual funds; excess retained.');await page.getByLabel('Message to the customer').fill('Payment verified. Excess retained as unapplied credit.');
    await page.getByRole('button',{name:'Review decision'}).click();await page.getByText('Principal credit ₱25,000.00 · unapplied credit ₱1,000.00').waitFor();
    const desktop=path.join(os.tmpdir(),'gh-payment-cp4-desktop.png');await page.screenshot({path:desktop,fullPage:true});
    for(const width of [320,390,768]) {await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);}
    await page.setViewportSize({width:390,height:844});const mobile=path.join(os.tmpdir(),'gh-payment-cp4-mobile.png');await page.screenshot({path:mobile,fullPage:true});
    state.loseNextDecision=true;await page.getByRole('button',{name:'Confirm decision'}).click();await page.getByRole('button',{name:'Retry saved decision'}).waitFor();
    assert.equal(submissions.db.count('receipts'),1);await page.getByRole('button',{name:'Retry saved decision'}).click();
    await page.getByRole('status').filter({hasText:'Saved: verified'}).waitFor();assert.equal(submissions.db.count('receipts'),1);
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Admin sign-in'}).waitFor();
    await page.goto(base+'/my-payments?mode=account');await page.getByLabel('Account email').fill('buyer@example.test');await page.getByLabel('Password',{exact:true}).fill('fake-password');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:/Regular plot/}).click();
    await page.getByText('Unapplied credit: ₱1,000.00.',{exact:false}).waitFor();assert.equal(await page.locator('tbody tr').count(),2);
    await page.getByText(/Acknowledgement PAY-/).waitFor();assert.equal(submissions.db.read('bookings/booking-c1').balanceCentavos,0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:'staff denied, admin correction, immutable revision, actual/excess approval, lost-response retry, customer canonical parity, 320/390/768px layouts',desktop,mobile},null,2));
  } finally {if(browser)await browser.close();await new Promise((resolve)=>server.close(resolve));}
})().catch((error)=>{console.error(error);process.exitCode=1;});
