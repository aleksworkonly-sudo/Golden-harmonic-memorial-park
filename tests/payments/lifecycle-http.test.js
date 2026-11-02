'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { lifecycleFixture } = require('./lifecycle-fixture');
const { createLifecycleHandler } = require('../../lib/payments/lifecycle-http');
const origin = 'https://park.example.test';
const env = { PAYMENT_ACCESS_ENABLED:'true', PAYMENT_LIFECYCLE_ENABLED:'true', PAYMENT_ACCESS_ORIGIN:origin,
  PAYMENT_ACCESS_RATE_SECRET:'local-testing-secret-at-least-32-characters', BREVO_API_KEY:'test', SENDER_EMAIL:'test@example.test' };
async function call(handler, body, options = {}) {
  const req = { method:'POST', body, socket:{ remoteAddress:'127.0.0.1' }, ...options,
    headers:{ origin, 'content-type':'application/json', authorization:'Bearer admin', ...options.headers } };
  const res = { headers:{}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
  await handler(req, res); return res;
}
test('lifecycle route needs separate opt-in plus complete access config and does not initialize when disabled', async () => {
  for (const patch of [{ PAYMENT_LIFECYCLE_ENABLED:'false' }, { PAYMENT_ACCESS_ENABLED:'false' }, { PAYMENT_ACCESS_ORIGIN:'http://unsafe.test' }]) {
    const h = createLifecycleHandler({ env:{ ...env, ...patch }, services:() => { throw Error('Do not initialize'); } });
    assert.equal((await call(h, {}, { method:'GET' })).body.enabled, false); assert.equal((await call(h, {})).code, 503);
  }
});
test('lifecycle HTTP enforces origin, admin identity, allowlists and body caps', async () => {
  const f = lifecycleFixture(), h = createLifecycleHandler({ env, services:() => f, now:() => f.time });
  assert.equal((await call(h, { action:'queue' }, { headers:{ origin:'https://other.test' } })).code, 403);
  assert.equal((await call(h, { action:'queue' }, { headers:{ authorization:'Bearer staff' } })).code, 403);
  assert.equal((await call(h, { action:'queue', role:'admin' })).code, 400);
  assert.equal((await call(h, 'x'.repeat(8193))).code, 413);
  assert.equal((await call(h, { action:'release' })).code, 400);
  const result = await call(h, { action:'detail', bookingId:'booking-c1' }); assert.equal(result.code, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(result.body.lifecycle.reviewRequired, true);
});
test('review HTTP retry preserves one review and reports unavailable persistence without backend details', async () => {
  const f = lifecycleFixture(), h = createLifecycleHandler({ env, services:() => f, now:() => f.time });
  const body = { action:'retain', command:f.retainCommand() };
  assert.equal((await call(h, body)).code, 200); assert.equal((await call(h, body)).body.duplicate, true);
  assert.equal(f.db.count('reservationReviews'), 1);
  const failed = createLifecycleHandler({ env, services:() => { throw Error('private backend secret'); } });
  const result = await call(failed, { action:'queue' }); assert.equal(result.code, 503); assert.equal(JSON.stringify(result.body).includes('secret'), false);
});
