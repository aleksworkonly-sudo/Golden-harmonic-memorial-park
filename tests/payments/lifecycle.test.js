'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { lifecycleFixture } = require('./lifecycle-fixture');
const { deriveLifecycle, presentLifecycle } = require('../../lib/payments/lifecycle-model');
const { createAccessService } = require('../../lib/payments/access');
const { cashFixture } = require('./cash-fixture');
const { createLifecycleService } = require('../../lib/payments/lifecycle');

function modelFixture(plan = 'installment') {
  const f = lifecycleFixture(), b = f.db.read('bookings/booking-c1'); b.lifecycleTerms.plan = plan;
  const entries = [f.db.read(`ledgerEntries/${b.openingBalanceId}`)];
  const add = (id, amount, date, item = 'item1') => {
    entries.push({ kind:'receipt', receiptId:id, bookingTermsVersion:1, contractCreditCentavos:amount, receivedAt:Date.parse(date), allocations:[{ itemId:item, centavos:amount }] });
    b.items.find((i) => i.itemId === item).creditCentavos += amount; b.netCreditCentavos += amount; b.balanceCentavos -= amount;
  };
  return { f, b, entries, add };
}
test('several verified receipts complete N-plot deposit by actual received date, independent of approval order', () => {
  const { b, entries, add } = modelFixture();
  add('later', 600000, '2026-08-31T04:00:00Z'); add('earlier', 400000, '2026-07-31T04:00:00Z');
  const m = deriveLifecycle(b, entries, Date.parse('2026-11-01T04:00:00Z'));
  assert.equal(m.depositRequiredCentavos, 1000000); assert.equal(m.depositCompletionReceiptId, 'later');
  assert.equal(m.firstInstallmentDate, '2026-09-30'); assert.equal(m.calendar[1].dueDate, '2026-10-31');
  assert.ok(m.calendar.every((r) => r.amountCentavos === null)); assert.equal(m.scheduleStatus, 'awaiting_accountant');
  assert.equal(m.penaltyStatus, 'awaiting_accountant'); assert.equal(m.deadlineDate, '2026-09-30');
});
test('Manila end-of-date cutoff and late verification retain timely evidenced deposit', () => {
  const { b, entries, add } = modelFixture(); add('timely', 1000000, '2026-09-30T15:59:59Z');
  const m = deriveLifecycle(b, entries, Date.parse('2026-10-31T04:00:00Z'));
  assert.equal(m.fulfilledAfterDeadline, false); assert.equal(presentLifecycle(m, Date.parse('2026-10-31T04:00:00Z')).reviewRequired, false);
  const empty = modelFixture(); const initial = deriveLifecycle(empty.b, empty.entries, Date.parse('2026-09-30T15:59:59Z'));
  assert.equal(presentLifecycle(initial, Date.parse('2026-09-30T15:59:59Z')).reviewRequired, false);
  assert.equal(presentLifecycle(initial, Date.parse('2026-09-30T16:00:00Z')).reviewRequired, true);
});
test('partial deposit has no installment anchor; spot cash must settle principal by original deadline', () => {
  const { b, entries, add } = modelFixture('spot_cash'); add('deposit', 1000000, '2026-07-31T04:00:00Z');
  let m = presentLifecycle(deriveLifecycle(b, entries, Date.parse('2026-10-31T04:00:00Z')), Date.parse('2026-10-31T04:00:00Z'));
  assert.equal(m.state, 'deposit_funded'); assert.equal(m.reviewRequired, true); assert.equal(m.firstInstallmentDate, null); assert.deepEqual(m.calendar, []);
  add('settlement', 1500000, '2026-10-01T04:00:00Z', 'item2'); m = deriveLifecycle(b, entries, Date.parse('2026-10-31T04:00:00Z'));
  assert.equal(m.state, 'principal_settled'); assert.equal(m.fulfilledAfterDeadline, true); assert.equal(m.deadlineDate, '2026-09-30');
  const p = modelFixture(); p.add('part', 300000, '2026-07-31T04:00:00Z'); m = deriveLifecycle(p.b, p.entries, p.f.time);
  assert.equal(m.state, 'partial_deposit'); assert.equal(m.depositRemainingCentavos, 700000); assert.equal(m.firstInstallmentDate, null);
});
test('unsupported provenance, future/pre-reservation receipts, duplicate/reversal history fail closed', () => {
  for (const change of [
    ({ b }) => { b.openingCreditCentavos = 1; },
    ({ b }) => { b.lifecycleTerms.bookingTermsVersion = 2; },
    ({ b }) => { b.lifecycleTerms.termMonths = 48; },
    ({ entries }) => { entries.push({ kind:'reversal', receiptId:'R' }); },
    ({ add }) => add('future', 500000, '2027-01-01T00:00:00Z'),
    ({ add }) => add('old', 500000, '2026-01-01T00:00:00Z'),
    ({ add }) => { add('duplicate', 200000, '2026-08-31T04:00:00Z'); add('duplicate', 200000, '2026-08-31T04:00:00Z'); }
  ]) { const f = modelFixture(); change(f); assert.throws(() => deriveLifecycle(f.b, f.entries, f.f.time)); }
});
test('manual approvals update lifecycle atomically; proofs and cash intentions cannot fund a deposit', async () => {
  const f = lifecycleFixture(); const p = await f.submit();
  assert.equal((await f.lifecycle.detail('admin', 'booking-c1')).lifecycle.state, 'awaiting_deposit');
  await f.review.decide('admin', f.decision(p));
  const first = f.db.read('bookings/booking-c1'); assert.equal(first.lifecycle.state, 'partial_deposit'); assert.equal(first.lifecycle.basisVersion, first.version);
  const next = await f.submit({ requestId:'second-proof-request', reference:'BANK-002' });
  await f.review.decide('admin', f.decision(next, { requestId:'second-approval-001', expectedBookingVersion:2, verifiedReference:'BANK-002', receivedAt:f.time }));
  const m = (await f.lifecycle.detail('admin', 'booking-c1')).lifecycle;
  assert.equal(m.state, 'deposit_funded'); assert.equal(m.depositCompletedAt, f.time); assert.equal(m.firstInstallmentDate, '2026-11-30');
  assert.equal(m.calendar[1].dueDate, '2026-12-31'); assert.equal(f.db.read('plots/c1_plot1').status, 'reserved');
});
test('gateway buyer/provider fees never fulfill the deposit; duplicate events never shift its anchor', async () => {
  const f = lifecycleFixture(); await f.create(); f.pay(); await f.deliver();
  const b = f.db.read('bookings/booking-c1'); assert.equal(b.lifecycle.depositCreditCentavos, 500000); assert.equal(b.lifecycle.state, 'partial_deposit');
  await f.deliver(f.event('evt_second', 'payment.paid')); assert.deepEqual(f.db.read('bookings/booking-c1').lifecycle, b.lifecycle);
});
test('lifecycle reconciliation does not discard confirmed money or overwrite accepted monthly fields', async () => {
  const f = lifecycleFixture(), path = 'bookings/booking-c1';
  f.db.put(path, { ...f.db.read(path), lifecycleTerms:{}, monthlyCentavos:12345, nextDueDate:'2026-12-15' });
  const p = await f.submit(); await f.review.decide('admin', f.decision(p));
  const b = f.db.read(path); assert.equal(b.netCreditCentavos, 500000); assert.equal(b.lifecycle.state, 'needs_reconciliation');
  assert.equal(b.monthlyCentavos, 12345); assert.equal(b.nextDueDate, '2026-12-15'); assert.equal(f.db.count('receipts'), 1);
});
test('account/guest summaries share lifecycle with current ownership and no admin notes', async () => {
  const f = lifecycleFixture(); await f.lifecycle.retain('admin', f.retainCommand());
  const access = createAccessService({ db:f.db, auth:f.auth, rateSecret:'local-test-secret-at-least-32-characters', now:() => f.time });
  const summary = await access.accountSummary({ idToken:'buyer', customerId:'c1' });
  assert.equal(summary.lifecycle.reviewRequired, true); assert.equal(JSON.stringify(summary).includes('Awaiting statement'), false);
  assert.equal((await access.guestSummary({ secret:f.guest.secret })).lifecycle.plan, 'spot_cash');
  f.db.put('customers/c1', { ...f.db.read('customers/c1'), authUid:'other' });
  await assert.rejects(access.accountSummary({ idToken:'buyer', customerId:'c1' }), { code:'FORBIDDEN' });
});
test('admin retained-hold review is atomic, idempotent and never clears deadline or changes plots/money', async () => {
  const f = lifecycleFixture(), before = f.db.read('plots/c1_plot1'), cmd = f.retainCommand();
  const results = await Promise.all([f.lifecycle.retain('admin', cmd), f.lifecycle.retain('admin', cmd)]);
  assert.equal(results[0].version, 2); assert.equal(results[1].version, 2); assert.equal(f.db.count('reservationReviews'), 1);
  const b = f.db.read('bookings/booking-c1'); assert.equal(b.lifecycle.reviewRequired, true); assert.equal(b.lifecycle.deadlineDate, '2026-09-30');
  assert.equal(b.netCreditCentavos, 0); assert.deepEqual(f.db.read('plots/c1_plot1'), before); assert.equal(f.db.count('receipts'), 0);
  await assert.rejects(f.lifecycle.retain('admin', { ...cmd, reason:'Changed' }), { code:'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(f.lifecycle.retain('staff', cmd), { code:'FORBIDDEN' });
  f.db.put('users/admin', { role:'staff' }); await assert.rejects(f.lifecycle.retain('admin', cmd), { code:'FORBIDDEN' });
});
test('review rejects stale terms/roles, arbitrary release/extension fields and has atomic failure recovery', async () => {
  const f = lifecycleFixture();
  await assert.rejects(f.lifecycle.retain('admin', { ...f.retainCommand(), release:true }), { code:'INVALID_COMMAND' });
  f.db.failNextCommit = true; await assert.rejects(f.lifecycle.retain('admin', f.retainCommand()), /Simulated/);
  assert.equal(f.db.count('reservationReviews'), 0); assert.equal(f.db.read('bookings/booking-c1').version, 1);
  f.db.beforeCommit = async () => f.db.put('users/admin', { role:'staff' });
  await assert.rejects(f.lifecycle.retain('admin', f.retainCommand()), { code:'FORBIDDEN' });
  f.db.put('users/admin', { role:'admin' }); await f.lifecycle.retain('admin', f.retainCommand());
  await assert.rejects(f.lifecycle.retain('admin', f.retainCommand({ requestId:'stale-second-request' })), { code:'STALE_BOOKING' });
});
test('review list paginates all enabled contracts without a newest-500 omission', async () => {
  const f = lifecycleFixture(), b = f.db.read('bookings/booking-c1');
  delete b.bookingId; // Canonical schema does not require a redundant ID field.
  for (let i = 0; i < 25; i++) { const bookingId = `booking-extra-${String(i).padStart(2, '0')}`; f.db.put(`bookings/${bookingId}`, { ...b }); }
  const first = await f.lifecycle.queue('admin'); assert.equal(first.rows.length, 20); assert.ok(first.nextCursor);
  const second = await f.lifecycle.queue('admin', first.nextCursor); assert.equal(second.rows.length, 7); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.rows, ...second.rows].map((r) => r.bookingId)).size, 27);
  await assert.rejects(f.lifecycle.queue('staff'), { code:'FORBIDDEN' });
});
test('malformed ledger history retains new money and marks lifecycle for reconciliation', async () => {
  for (const patch of [{ allocations:[null] }, { receiptId:42 }, { allocations:[{ itemId:'item1', centavos:'bad' }] }]) {
    const f = lifecycleFixture();
    f.db.put('ledgerEntries/bad', { bookingId:'booking-c1', kind:'receipt', receiptId:'bad', bookingTermsVersion:1,
      receivedAt:f.time, contractCreditCentavos:0, allocations:[], ...patch });
    const p = await f.submit(); await f.review.decide('admin', f.decision(p));
    assert.equal(f.db.count('receipts'), 1); assert.equal(f.db.read('bookings/booking-c1').netCreditCentavos, 500000);
    assert.equal(f.db.read('bookings/booking-c1').lifecycle.state, 'needs_reconciliation');
  }
});
test('oversized history and closed contracts never imply automatic inventory release', async () => {
  const f = modelFixture();
  assert.throws(() => deriveLifecycle(f.b, Array(501).fill(f.entries[0]), f.f.time), { code:'LIFECYCLE_REVIEW' });
  f.b.status = 'released'; const m = presentLifecycle(deriveLifecycle(f.b, f.entries, f.f.time), f.f.time);
  assert.equal(m.reviewRequired, false); assert.match(m.holdMessage, /contract is closed/);
});
test('cash recording and photo are not deposit credit; approved excess stays outside deposit', async () => {
  const f = cashFixture(), enabled = lifecycleFixture().db.read('bookings/booking-c1');
  f.db.put('bookings/booking-c1', enabled);
  const core = createLifecycleService({ db:f.db, auth:f.auth, now:() => f.time });
  const p = await f.ready({ receivedCentavos:3000000 });
  assert.equal((await core.detail('admin', 'booking-c1')).lifecycle.depositCreditCentavos, 0);
  await f.cash.mutate('admin', 'approve', f.approve(p, { allocations:[{ itemId:'item1', centavos:1000000 }, { itemId:'item2', centavos:1500000 }], unappliedCentavos:500000 }));
  const b = f.db.read('bookings/booking-c1'); assert.equal(b.lifecycle.state, 'principal_settled');
  assert.equal(b.lifecycle.depositCompletedAt, f.record().receivedAt); assert.equal(b.lifecycle.depositCreditCentavos, 1000000);
  assert.equal(b.unappliedCentavos, 500000); assert.equal(b.status, 'active');
});
test('payment and lifecycle writes fail together and can retry without partial funding', async () => {
  const f = lifecycleFixture(), p = await f.submit(), command = f.decision(p);
  f.db.failNextCommit = true; await assert.rejects(f.review.decide('admin', command), /Simulated/);
  assert.equal(f.db.count('receipts'), 0); assert.equal(f.db.read('bookings/booking-c1').lifecycle.depositCreditCentavos, 0);
  await f.review.decide('admin', command); assert.equal(f.db.read('bookings/booking-c1').lifecycle.depositCreditCentavos, 500000);
});
