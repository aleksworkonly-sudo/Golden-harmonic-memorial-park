'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pesosToCentavos, centavos, addCentavos, depositForPlots } = require('../../lib/payments/money');
const { manilaDate, addCalendarMonths, reservationDeadline, installmentDueDate } = require('../../lib/payments/calendar');
const { authenticate } = require('../../lib/payments/auth');
const { getFirebaseServices } = require('../../lib/payments/firebase');

test('money preserves centavos and credits a deposit per plot without float rounding', () => {
  assert.equal(pesosToCentavos('0.29'), 29);
  assert.equal(pesosToCentavos('5000'), 500000);
  assert.equal(pesosToCentavos(12.34), 1234);
  assert.equal(depositForPlots(3), 1500000);
  assert.equal(addCentavos(29, 71), 100);
  assert.equal(pesosToCentavos('90071992547409.91'), Number.MAX_SAFE_INTEGER);
});

test('money rejects ambiguous input, third decimals, unsafe totals and non-numeric values', () => {
  for (const value of ['', ' 10', '1,000', '1e3', '-1', '1.001', '01', Infinity, NaN, null, true,
    '90071992547409.92']) assert.throws(() => pesosToCentavos(value));
  for (const value of [0.1, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => centavos(value));
  assert.throws(() => addCentavos(Number.MAX_SAFE_INTEGER, 1));
  assert.throws(() => depositForPlots(0));
  assert.throws(() => depositForPlots(Number.MAX_SAFE_INTEGER));
});

test('Manila midnight determines the reservation date and original three-month deadline', () => {
  assert.equal(manilaDate(Date.parse('2026-11-09T15:59:59Z')), '2026-11-09');
  assert.equal(manilaDate(Date.parse('2026-11-09T16:00:00Z')), '2026-11-10');
  assert.equal(reservationDeadline(Date.parse('2026-11-10T04:00:00Z')), '2027-02-10');
  assert.equal(installmentDueDate(Date.parse('2026-12-15T04:00:00Z'), 1), '2027-01-15');
});

test('monthly dates clamp leap/month ends without drifting from original anchor', () => {
  assert.equal(addCalendarMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addCalendarMonths('2027-01-31', 2), '2027-03-31');
  assert.equal(addCalendarMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addCalendarMonths('2026-11-30', 3), '2027-02-28');
  for (const date of ['2026-02-30', '2026-13-01', 'not-a-date', '26-01-01']) {
    assert.throws(() => addCalendarMonths(date, 1));
  }
  assert.throws(() => installmentDueDate(Date.now(), 0));
  assert.throws(() => manilaDate(Infinity));
});

test('authentication checks revocation and ignores a claimed token role', async () => {
  const calls = [];
  const auth = { verifyIdToken: async (...args) => {
    calls.push(args);
    return { uid: 'buyer', role: 'superadmin' };
  } };
  assert.deepEqual(await authenticate(auth, 'token'), { uid: 'buyer' });
  assert.deepEqual(calls, [['token', true]]);
});

test('revoked/disabled credentials fail closed; infrastructure errors remain retryable', async () => {
  for (const code of ['auth/id-token-revoked', 'auth/user-disabled', 'auth/id-token-expired']) {
    await assert.rejects(authenticate({ verifyIdToken: async () => { throw { code }; } }, 'token'),
      { code: 'UNAUTHENTICATED', status: 401 });
  }
  await assert.rejects(authenticate({}, ''), { code: 'UNAUTHENTICATED' });
  await assert.rejects(authenticate({ verifyIdToken: async () => { throw new Error('network details'); } }, 'token'),
    { code: 'AUTH_UNAVAILABLE', status: 503 });
});

test('Firebase initializes before either database or auth access on a cold start', () => {
  const calls = [];
  const admin = {
    apps: [], credential: { cert: (value) => value },
    initializeApp: () => { calls.push('init'); admin.apps.push({}); },
    firestore: () => { assert.equal(admin.apps.length, 1); calls.push('db'); return 'db'; },
    auth: () => { assert.equal(admin.apps.length, 1); calls.push('auth'); return 'auth'; }
  };
  const env = { FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from('{}').toString('base64') };
  assert.deepEqual(getFirebaseServices(admin, env), { db: 'db', auth: 'auth' });
  getFirebaseServices(admin, {});
  assert.deepEqual(calls, ['init', 'db', 'auth', 'db', 'auth']);
});
