'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { figures, reportHtml, monthRange } = require('../../lib/agent-report-email');

const agent = { _id: 'ag1', name: 'Ana Cruz', email: 'ana@example.com', position: 'Sales Agent', team: 'Team A', targetPlots: 3, targetRevenue: 90000 };
const manila = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) - 8 * 3600e3;
const apps = [
  { agentId: 'ag1', status: 'paid', createdAt: manila(2026, 11, 2), totalPrice: 30000, plots: [{}, {}] },
  { agentId: 'ag1', status: 'new', createdAt: manila(2026, 11, 30, 23), totalPrice: 60000, plots: [{}] },
  { agentId: 'ag1', status: 'cancelled', createdAt: manila(2026, 11, 5), totalPrice: 99999, plots: [{}] },
  { agentId: 'ag1', status: 'new', createdAt: manila(2026, 10, 31, 23), totalPrice: 5000, plots: [{}] },
  { agentId: 'ag1', status: 'new', createdAt: manila(2026, 12, 1, 0), totalPrice: 5000, plots: [{}] },
  { agentId: 'other', status: 'new', createdAt: manila(2026, 11, 3), totalPrice: 7000, plots: [{}] }
];

test('agent report counts only this agent\'s non-cancelled sales made in the month (Manila time)', () => {
  const f = figures(agent, apps, '2026-11');
  assert.equal(f.plots, 3);
  assert.equal(f.revenue, 90000);
  assert.equal(f.sales, 2);
  assert.equal(f.quota, true);
});
test('quota is not met below target, and not decided without a target', () => {
  assert.equal(figures({ ...agent, targetPlots: 4 }, apps, '2026-11').quota, false);
  const none = figures({ _id: 'ag1' }, apps, '2026-11');
  assert.equal(none.hasTarget, false);
  assert.equal(none.quota, false);
});
test('month range is Manila midnight to midnight', () => {
  const [a, b] = monthRange('2026-11');
  assert.equal(a, Date.UTC(2026, 9, 31, 16));
  assert.equal(b, Date.UTC(2026, 10, 30, 16));
});
test('email html escapes staff text and shows the figures', () => {
  const h = reportHtml({ ...agent, name: '<b>Ana</b>' }, figures(agent, apps, '2026-11'), '2026-11', { bonus: 'Yes', team: 'No', remarks: '<script>x</script>', preparedBy: 'Staff', reviewedBy: '' });
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.ok(h.includes('₱90,000'));
  assert.ok(h.includes('Quota met'));
  assert.ok(h.includes('Eligible'));
});
