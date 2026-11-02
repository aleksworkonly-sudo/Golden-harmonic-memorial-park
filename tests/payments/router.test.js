'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPaymentRouter } = require('../../lib/payments/router');
const { MemoryFirestore } = require('./memory-firestore');
const config = require('../../vercel.json');

const factories = {
  'payment-access': require('../../lib/payments/access-http').createAccessHandler,
  'payment-submission': require('../../lib/payments/submission-http').createSubmissionHandler,
  'payment-review': require('../../lib/payments/review-http').createReviewHandler,
  'payment-cash': require('../../lib/payments/cash-http').createCashHandler,
  'payment-lifecycle': require('../../lib/payments/lifecycle-http').createLifecycleHandler,
  'payment-operations': require('../../lib/payments/operations-http').createOperationsHandler,
  'payment-messaging-worker': require('../../lib/payments/operations-http').createMessagingWorker
};
const origin = 'https://park.example.test';
const enabledEnv = {
  PAYMENT_ACCESS_ENABLED: 'true', PAYMENT_ACCESS_ORIGIN: origin,
  PAYMENT_ACCESS_RATE_SECRET: 'test-secret-with-at-least-32-characters',
  BREVO_API_KEY: 'test-only', SENDER_EMAIL: 'office@example.test',
  PAYMENT_SUBMISSIONS_ENABLED: 'true', PAYMENT_REVIEW_ENABLED: 'true',
  PAYMENT_CASH_ENABLED: 'true', PAYMENT_LIFECYCLE_ENABLED: 'true',
  PAYMENT_OPERATIONS_ENABLED: 'true', PAYMENT_EMAIL_DISPATCH_ENABLED: 'true',
  PAYMENT_WORKER_SECRET: 'worker-test-secret-with-at-least-32-characters'
};

async function call(handler, url, options = {}) {
  const req = {
    url, method: 'POST', body: { action: 'queue' },
    socket: { remoteAddress: '127.0.0.1' }, ...options,
    headers: { origin, 'content-type': 'application/json', ...options.headers }
  };
  const res = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await handler(req, res);
  return { code: res.code, body: res.body, headers: res.headers };
}

for (const [name, factory] of Object.entries(factories)) {
  test(`shared router preserves ${name} gates, methods and error responses`, async () => {
    for (const env of [{}, enabledEnv]) {
      const options = { env, services: () => { throw new Error('No live services in routing tests'); } };
      const router = createPaymentRouter(options);
      const original = factory(options);
      for (const request of [
        { method: 'GET' }, { method: 'DELETE' }, {},
        { headers: { origin: 'https://untrusted.example.test' } },
        { headers: { 'content-type': 'text/plain' } },
        { body: '{broken-json' }, { body: { action: 'queue', admin: true } }
      ]) {
        const url = `/api/${name}`;
        const expected = await call(original, url, request);
        for (const suffix of ['', '.js', '/', '?endpoint=payment-messaging-worker&route=payment-cash']) {
          assert.deepEqual(await call(router, url + suffix, request), expected);
        }
      }
    }
  });
}

test('unknown routes and routing query/header injection cannot select a handler', async () => {
  const router = createPaymentRouter({ env: {} });
  for (const url of ['/api/payments', '/api/payments?endpoint=payment-access',
    '/api/unknown', '/api/paymongo-webhook', '/api/send-reminders',
    '/api/payment-access/extra', '/api/__proto__', '/api/%70ayment-access']) {
    const result = await call(router, url, {
      method: 'GET', query: { endpoint: 'payment-access', route: 'payment-access' },
      headers: { 'x-original-url': '/api/payment-access', 'x-rewrite-url': '/api/payment-access' }
    });
    assert.equal(result.code, 404);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
});

test('guest link exchange, private cookie, history and logout work through the shared router', async () => {
  const db = new MemoryFirestore({
    'presaleApplications/PS-0001': { email: 'buyer@example.test', accessVersion: 1, totalPrice: 22000, payments: [] }
  });
  const sent = [];
  const router = createPaymentRouter({ env: enabledEnv,
    services: () => ({ db, auth: { verifyIdToken: async (uid) => ({ uid }) } }),
    sender: async (mail) => sent.push(mail), sleep: async () => {}, minimumRequestMs: 0
  });
  const url = '/api/payment-access';
  await call(router, url, { body: { action: 'request_link', reference: 'PS-0001', email: 'buyer@example.test' } });
  const token = new URL(sent[0].url).hash.slice(8);
  const exchange = await call(router, url, { body: { action: 'exchange', token } });
  assert.equal(exchange.code, 200);
  const cookie = exchange.headers['Set-Cookie'].split(';')[0];
  assert.match(exchange.headers['Set-Cookie'], /Path=\/; HttpOnly; Secure; SameSite=Strict/);
  const request = { body: { action: 'guest_summary' }, headers: { cookie } };
  assert.equal((await call(router, url, request)).code, 200);
  assert.equal((await call(router, url, { body: { action: 'logout' }, headers: { cookie } })).code, 200);
  assert.equal((await call(router, url, request)).code, 401);
});

test('Vercel function budget and all existing endpoint rewrites remain valid', () => {
  const root = path.resolve(__dirname, '../..');
  const entries = fs.readdirSync(path.join(root, 'api'), { recursive: true })
    .filter((file) => /\.(?:[cm]?js|tsx?|py|go|rb)$/.test(file));
  assert.ok(entries.length <= 12, `${entries.length} API files exceed the Hobby limit of 12`);
  assert.equal(entries.length, 9);
  assert.ok(!entries.some((file) => file.startsWith('_')), 'Helpers belong outside api/');
  assert.equal(typeof require('../../api/payments'), 'function');
  for (const name of Object.keys(factories)) {
    for (const extension of ['', '.js']) {
      const rules = config.rewrites.filter((rule) => rule.source === `/api/${name}${extension}`);
      assert.equal(rules.length, 1);
      assert.equal(rules[0].destination, '/api/payments');
    }
    assert.ok(!entries.includes(`${name}.js`), 'Old wrapper would create an extra function');
  }
  for (const name of ['paymongo-checkout.js', 'paymongo-webhook.mjs', 'presale.js',
    'presale-track.js', 'send-reminders.js', 'send-agent-commissions.js', 'send-email.js', 'send-ar.js']) {
    assert.ok(entries.includes(name), `${name} must retain its independent entry point`);
    assert.ok(!config.rewrites.some((rule) => rule.source === `/api/${name.replace(/\.(m?js)$/, '')}`));
  }
  for (const cron of config.crons) assert.ok(entries.includes(`${cron.path.slice(5)}.js`));
  assert.equal(typeof require('../../lib/presale-reminders').runPresaleReminders, 'function');
});
