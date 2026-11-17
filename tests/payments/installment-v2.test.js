'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { v2Schedule, monthlyCentavos } = require('../../lib/payments/installment-math');
const { newInstallment } = require('../../lib/payments/new-installment');

test('monthly is the plan total over the months, as printed on the price list', () => {
  assert.equal(monthlyCentavos(3600000, 36), 100000);       // Regular, 3 years: 36,000 -> 1,000.00
  assert.equal(monthlyCentavos(6187500 + 0, 120) / 100, 515.63); // sanity: rounding to centavos
  assert.equal(monthlyCentavos(26400000, 36) / 100, 7333.33 * 1);
});
test('deposit shortens the schedule and the last payment is the remainder', () => {
  const s = v2Schedule(3600000, 300000, 36);
  assert.equal(s.monthly, 100000);
  assert.equal(s.count, 33);
  assert.equal(s.last, 100000);
  const odd = v2Schedule(3750000, 300000, 48); // 37,500 over 4 years
  assert.equal(odd.monthly, 78125);
  assert.equal(odd.monthly * (odd.count - 1) + odd.last, 3450000);
});
test('customer view for a v2 plan: 3-year Regular, deposit paid, two months paid', () => {
  const a = { plan: 'installment', installmentCalculation: 'total_over_term_v2', years: 3, totalPrice: 36000, plots: [{}], depositPerPlotCentavos: 300000,
    payments: [{ amount: 3000, date: Date.parse('2026-01-05') }, { amount: 1000, date: Date.parse('2026-02-05') }, { amount: 1000, date: Date.parse('2026-03-05') }] };
  const r = newInstallment(a);
  assert.equal(r.monthly, 1000);
  assert.equal(r.monthsPaid, 2);
  assert.equal(r.monthsLeft, 31);
  assert.equal(r.balance, 31000);
});
