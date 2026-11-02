'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const registry = require('../../lib/payments/qr-assets.json');
const account = require('../../docs/payments/examples/gcash-receiving-account.json');
const { receivingQr } = require('../../lib/payments/receiving-qr');
const { createPresalePaymentService } = require('../../lib/payments/presale-payment');
const { createSubmissionService } = require('../../lib/payments/submission');
const { presaleFixture } = require('./presale-payment-fixture');

test('authorized GCash asset and setup record match exact recipient, version and original image bytes', () => {
  assert.equal(registry.gcash.accountName, 'JU**L B.');
  assert.equal(registry.gcash.verified, true);
  const bytes = fs.readFileSync(path.resolve(__dirname, '../..', registry.gcash.imagePath.slice(1)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), registry.gcash.imageSha256);
  assert.deepEqual(receivingQr(account, registry, 'gcash-qr-v1'), {
    imagePath: '/payment-qr/gcash-v1.jpg', accountName: 'JU**L B.'
  });
  assert.equal(account.accountNumber, '', 'Do not fabricate a mobile number from the QR routing payload');
  for (const changed of [{ accountName: 'Golden Harmonic' }, { version: 2 }, { accountNumber: '09090909999' }, { qrVerified: false }]) {
    assert.equal(receivingQr({ ...account, ...changed }, registry, 'gcash-qr-v1'), null);
  }
  assert.equal(receivingQr(account, registry, 'different-account'), null);
});

test('documented GCash configuration enables only GCash and returns the replacement QR through actual service gates', async () => {
  const f = presaleFixture();
  const env = { ...f.settings.env, PAYMENT_PRESALE_GCASH_ACCOUNT_ID: 'gcash-qr-v1' };
  f.db.put('paymentReceivingAccounts/gcash-qr-v1', account);
  const core = createPresalePaymentService({ db: f.db, env, now: f.now });
  assert.deepEqual(await core.availability(), { gcash: true, maya: false });
  const saved = await core.reserve(f.input);
  const submissions = createSubmissionService({ db: f.db, auth: f.auth, now: f.now });
  const context = await submissions.context({ mode: 'reservation', secret: saved.secret, reservationRef: saved.ref });
  assert.equal(context.offers[0].qrImagePath, '/payment-qr/gcash-v1.jpg');
  assert.equal(context.offers[0].accountName, 'JU**L B.');
  assert.equal(context.offers[0].expectedAmountCentavos, 500000);
  assert.equal(f.db.count('receipts'), 0);
  f.db.put('paymentReceivingAccounts/gcash-qr-v1', { ...account, enabled: false });
  assert.deepEqual(await core.availability(), { gcash: false, maya: false });
});
