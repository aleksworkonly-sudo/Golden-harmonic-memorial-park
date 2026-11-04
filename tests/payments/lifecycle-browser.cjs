'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), os = require('node:os');
const { chromium } = require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const { createPreviewServer } = require('./preview-server');
(async () => {
  const { server, state, submissions:f } = createPreviewServer({ lifecycleMode:true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`; let browser;
  try {
    browser = await chromium.launch({ channel:'msedge', headless:true });
    const admin = await browser.newPage({ viewport:{ width:1440, height:1000 } }), errors = [];
    admin.on('pageerror', (e) => errors.push(e.message));
    await admin.goto(base + '/payment-lifecycle-admin.html');
    await admin.getByLabel('Admin email').fill('staff@example.test'); await admin.getByLabel('Password', { exact:true }).fill('fake');
    await admin.getByRole('button', { name:'Sign in for reservation review' }).click();
    await admin.getByRole('alert').filter({ hasText:'Only an admin' }).waitFor();
    await admin.getByLabel('Admin email').fill('admin@example.test'); await admin.getByLabel('Password', { exact:true }).fill('fake');
    await admin.getByRole('button', { name:'Sign in for reservation review' }).click();
    await admin.locator('.pr-queue button').filter({ hasText:'c1' }).click();
    await admin.getByText('The reservation deadline has passed', { exact:false }).waitFor();
    await admin.getByLabel('Reason for retaining the hold').fill('Waiting for buyer statement. Keep the plots held.');
    await admin.getByRole('button', { name:'Review retained hold' }).click();
    state.loseNextLifecycle = true; await admin.getByRole('button', { name:'Confirm and retain hold' }).click();
    await admin.getByRole('button', { name:'Retry same review' }).click();
    await admin.getByRole('status').filter({ hasText:'Review saved' }).waitFor();
    assert.equal(f.db.count('reservationReviews'), 1); assert.equal(f.db.read('plots/c1_plot1').status, 'reserved');
    await admin.getByRole('button', { name:'Refresh reservation list' }).click();
    await admin.locator('.pr-queue button').filter({ hasText:'c1' }).click();
    await admin.getByText('Last retained-hold review:', { exact:false }).waitFor();
    const page = await browser.newPage({ viewport:{ width:1440, height:1000 } }); page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/my-payments?mode=account'); await page.getByLabel('Account email').fill('buyer@example.test');
    await page.getByLabel('Password', { exact:true }).fill('fake'); await page.getByRole('button', { name:'Sign in', exact:true }).click();
    await page.getByRole('button', { name:/Regular plot/ }).click(); await page.getByRole('heading', { name:'Your reservation and deposit' }).waitFor();
    assert.equal(await page.getByText('Waiting for buyer statement', { exact:false }).count(), 0);
    const p = await f.submit(); await f.review.decide('admin', f.decision(p, { expectedBookingVersion:2, receivedCentavos:1000000, allocations:[{ itemId:'item1', centavos:1000000 }], receivedAt:f.time }));
    await page.getByRole('button', { name:'Refresh', exact:true }).click(); await page.getByText('Deposit complete', { exact:true }).waitFor();
    await page.getByText('View installment timing calendar', { exact:true }).click();
    assert.equal(await page.getByText('Nov 30, 2026 — amount awaiting confirmation', { exact:true }).count(), 1);
    assert.equal(await page.getByText('Dec 31, 2026 — amount awaiting confirmation', { exact:true }).count(), 1);
    const desktop = path.join(os.tmpdir(), 'gh-payment-cp7-desktop.png'); await page.screenshot({ path:desktop, fullPage:true });
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height:1000 }); await admin.setViewportSize({ width, height:1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await admin.setViewportSize({ width:390, height:844 }); const mobile = path.join(os.tmpdir(), 'gh-payment-cp7-mobile.png'); await admin.screenshot({ path:mobile, fullPage:true });
    await page.getByRole('button', { name:'Close payment history', exact:true }).click();
    await page.getByRole('heading', { name:'Sign in to your account' }).waitFor();
    const guest = await browser.newPage(); guest.on('pageerror', (e) => errors.push(e.message)); await guest.goto(base + '/my-payments?mode=reservation');
    await guest.getByText('Full spot-cash balance deadline', { exact:true }).waitFor();
    assert.equal(await guest.getByText('View installment timing calendar').count(), 0);
    await admin.getByRole('button', { name:'Sign out', exact:true }).click(); await admin.getByRole('heading', { name:'Admin sign-in' }).waitFor();
    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed:true, desktop, mobile, checks:'admin denial, overdue review, retained hold, lost response retry, principal funding, calendar, guest spot cash, privacy, responsive widths' }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise((r) => server.close(r)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
