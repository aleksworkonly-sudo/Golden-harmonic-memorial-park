'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaymentService } = require('../../lib/payments/service');
const { MemoryFirestore } = require('./memory-firestore');

const NOW = Date.parse('2026-12-20T04:00:00Z');
function fixture() {
  const db = new MemoryFirestore({
    'users/admin': { role: 'admin' }, 'users/admin2': { role: 'superadmin' }, 'users/staff': { role: 'staff' },
    'customers/customer1': { authUid: 'buyer' }, 'customers/customer2': { authUid: 'other-buyer' },
    'bookings/booking1': { schemaVersion: 1, customerId: 'customer1', status: 'active',
      currency: 'PHP', postingEnabled: true, policyStatus: 'approved', version: 1,
      totalCentavos: 2750000, netCreditCentavos: 500000, balanceCentavos: 2250000 },
    'payments/payment1': { schemaVersion: 1, bookingId: 'booking1', currency: 'PHP', status: 'pending_verification',
      version: 1, bookingVersion: 1, channel: 'gcash', purpose: 'balance', expectedAmountCentavos: 100000,
      receivingAccountId: 'account1', proofId: 'proof1', revisionId: 'revision1' },
    'paymentProofs/proof1': { bookingId: 'booking1', paymentId: 'payment1', revisionId: 'revision1',
      validationStatus: 'validated' }
  });
  const auth = { verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    return { uid: token, role: 'superadmin' }; // spoofed claim must never grant authority
  } };
  const service = createPaymentService({ db, auth, now: () => NOW });
  const command = { paymentId: 'payment1', requestId: 'request_000000001', expectedVersion: 1,
    receivedCentavos: 100000, receivedAt: NOW - 86400000, verifiedReference: '000123456' };
  const approve = (overrides = {}, idToken = 'admin') => service.approveManualPayment({
    idToken, command: { ...command, ...overrides }
  });
  return { db, service, command, approve };
}

test('pending evidence never changes the balance; approval atomically creates financial and audit records', async () => {
  const { db, approve } = fixture();
  assert.equal(db.read('bookings/booking1').balanceCentavos, 2250000);
  const result = await approve();
  assert.equal(result.duplicate, false);
  assert.equal(result.balanceAfterCentavos, 2150000);
  assert.equal(db.read('payments/payment1').status, 'verified');
  for (const collection of ['receipts', 'ledgerEntries', 'economicPayments', 'auditLogs', 'notifications',
    'emailOutbox', 'operationKeys']) assert.equal(db.count(collection), 1, collection);
  assert.equal(db.read(`receipts/${result.receiptId}`).receivedAt, NOW - 86400000);
  assert.equal(db.read(`emailOutbox/${result.receiptId}`).state, 'awaiting_configuration');
});

test('buyers, staff, unknown and disabled admins cannot approve even with an admin token claim', async () => {
  const { db, approve } = fixture();
  db.put('users/disabled', { role: 'admin', disabled: true });
  for (const uid of ['buyer', 'staff', 'unknown', 'disabled']) await assert.rejects(approve({}, uid), { code: 'FORBIDDEN' });
  assert.equal(db.count('receipts'), 0);
  assert.equal(db.read('bookings/booking1').balanceCentavos, 2250000);
});

test('identical retry and concurrent approvals produce one credit and one receipt', async () => {
  const { db, approve } = fixture();
  const results = await Promise.all([approve(), approve({}, 'admin2'), approve()]);
  assert.equal(new Set(results.map((result) => result.receiptId)).size, 1);
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
  assert.ok(db.retries > 0);
  assert.equal(db.count('ledgerEntries'), 1);
  assert.equal(db.read('bookings/booking1').netCreditCentavos, 600000);
});

test('reused request with changed data conflicts; another request cannot alter a verified receipt', async () => {
  const { db, approve } = fixture();
  await approve();
  await assert.rejects(approve({ receivedCentavos: 99999 }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(approve({ requestId: 'request_000000002', verifiedReference: 'different' }), { code: 'PAYMENT_CONFLICT' });
  assert.equal(db.count('receipts'), 1);
});

test('request identifier is scoped to actor; both admins still share economic/payment deduplication', async () => {
  const { db, approve } = fixture();
  const first = await approve();
  const second = await approve({}, 'admin2');
  assert.equal(second.receiptId, first.receiptId);
  assert.equal(second.duplicate, true);
  assert.equal(db.count('operationKeys'), 2);
});

test('role removal during commit forces a retry and blocks posting', async () => {
  const { db, approve } = fixture();
  db.beforeCommit = () => db.put('users/admin', { role: 'staff' });
  await assert.rejects(approve(), { code: 'FORBIDDEN' });
  assert.equal(db.count('ledgerEntries'), 0);
  assert.equal(db.read('bookings/booking1').netCreditCentavos, 500000);
});

test('failed commit leaves no partial money or audit; retry succeeds once', async () => {
  const { db, approve } = fixture();
  db.failNextCommit = true;
  await assert.rejects(approve(), /Simulated commit failure/);
  for (const collection of ['ledgerEntries', 'receipts', 'auditLogs', 'economicPayments']) assert.equal(db.count(collection), 0);
  assert.equal(db.read('payments/payment1').status, 'pending_verification');
  await approve();
  assert.equal(db.count('receipts'), 1);
});

test('another submission for the same receiving account and transfer cannot credit twice', async () => {
  const { db, approve } = fixture();
  const pending = db.read('payments/payment1');
  await approve();
  db.put('payments/payment2', { ...pending, bookingVersion: 2, proofId: 'proof2' });
  db.put('paymentProofs/proof2', { ...db.read('paymentProofs/proof1'), paymentId: 'payment2' });
  await assert.rejects(approve({ paymentId: 'payment2', requestId: 'request_000000002' }), { code: 'DUPLICATE_PAYMENT' });
  assert.equal(db.count('ledgerEntries'), 1);
});

test('stale contract quotes, stale payment versions and wrong proof linkage fail without writes', async () => {
  for (const change of [
    (db) => db.put('bookings/booking1', { ...db.read('bookings/booking1'), version: 2 }),
    (db) => db.put('payments/payment1', { ...db.read('payments/payment1'), version: 2 }),
    (db) => db.put('paymentProofs/proof1', { ...db.read('paymentProofs/proof1'), bookingId: 'another' }),
    (db) => db.put('paymentProofs/proof1', { ...db.read('paymentProofs/proof1'), revisionId: 'old' })
  ]) {
    const { db, approve } = fixture();
    change(db);
    await assert.rejects(approve());
    assert.equal(db.count('receipts'), 0);
  }
});

test('unapproved policy and disabled/new/cancelled bookings cannot enter the foundation', async () => {
  for (const patch of [{ policyStatus: 'open' }, { postingEnabled: false }, { status: 'cancelled' },
    { status: 'reserved_unfunded' }, { currency: 'USD' }]) {
    const { db, approve } = fixture();
    db.put('bookings/booking1', { ...db.read('bookings/booking1'), ...patch });
    await assert.rejects(approve(), { code: 'POLICY_NOT_READY' });
    assert.equal(db.count('ledgerEntries'), 0);
  }
});

test('unknown fields, malformed money, future dates and amount mismatches are not accepted', async () => {
  for (const patch of [{ role: 'admin' }, { customerId: 'other' }, { receivedCentavos: '100000' },
    { receivedCentavos: 100000.5 }, { receivedCentavos: 99999 }, { receivedCentavos: -1 },
    { receivedAt: NOW + 1 }, { verifiedReference: '' }, { paymentId: '../other' },
    { expectedVersion: Number.MAX_SAFE_INTEGER }]) {
    const { db, approve } = fixture();
    await assert.rejects(approve(patch));
    assert.equal(db.count('ledgerEntries'), 0);
  }
});

test('cash, PayMongo, deposits, final settlement and excess require their later workflow', async () => {
  for (const patch of [{ channel: 'cash' }, { channel: 'paymongo' }, { purpose: 'deposit' }]) {
    const { db, approve } = fixture();
    db.put('payments/payment1', { ...db.read('payments/payment1'), ...patch });
    await assert.rejects(approve(), { code: 'WORKFLOW_NOT_READY' });
  }
  for (const amount of [2250000, 2250001]) {
    const { db, approve } = fixture();
    db.put('payments/payment1', { ...db.read('payments/payment1'), expectedAmountCentavos: amount });
    await assert.rejects(approve({ receivedCentavos: amount }), { code: 'SETTLEMENT_REQUIRES_REVIEW' });
  }
});

test('history uses current customer ownership, returns safe fields, and denies other buyers/staff', async () => {
  const { db, approve, service } = fixture();
  await approve();
  const result = await service.paymentHistory({ idToken: 'buyer', bookingId: 'booking1' });
  assert.equal(result.entries.length, 1);
  assert.equal(result.balanceCentavos, 2150000);
  assert.equal(result.entries[0].verifiedReference, undefined);
  assert.equal(result.entries[0].proofId, undefined);
  for (const uid of ['other-buyer', 'staff']) await assert.rejects(service.paymentHistory({
    idToken: uid, bookingId: 'booking1'
  }), { code: 'FORBIDDEN' });
  db.put('customers/customer1', { authUid: 'new-owner' });
  await assert.rejects(service.paymentHistory({ idToken: 'buyer', bookingId: 'booking1' }), { code: 'FORBIDDEN' });
});

test('history pages through timestamp ties and rejects a cursor from another booking', async () => {
  const { db, approve, service } = fixture();
  const posted = await approve();
  const row = db.read(`ledgerEntries/${posted.receiptId}`);
  for (const receiptId of ['PAY-a', 'PAY-b', 'PAY-c']) db.put(`ledgerEntries/${receiptId}`, { ...row, receiptId });
  const ids = [];
  let cursor = null;
  do {
    const page = await service.paymentHistory({ idToken: 'buyer', bookingId: 'booking1', pageSize: 2, afterReceiptId: cursor });
    ids.push(...page.entries.map((entry) => entry.receiptId));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4);
  db.put('ledgerEntries/other', { ...row, receiptId: 'other', bookingId: 'booking2' });
  await assert.rejects(service.paymentHistory({ idToken: 'buyer', bookingId: 'booking1', afterReceiptId: 'other' }),
    { code: 'INVALID_CURSOR' });
});
