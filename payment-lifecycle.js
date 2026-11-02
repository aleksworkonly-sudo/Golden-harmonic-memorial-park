'use strict';
(() => {
  if (!window.React) return;
  const h = React.createElement;
  const peso = (n) => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(n / 100);
  const date = (d) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone:'UTC', year:'numeric', month:'short', day:'numeric' }) : 'Not yet established';
  const labels = { awaiting_deposit:'Awaiting deposit', partial_deposit:'Deposit partly paid', deposit_funded:'Deposit complete', principal_settled:'Principal fully paid' };
  function PaymentLifecycle({ model }) {
    if (!model) return null;
    if (model.state === 'needs_reconciliation') return h('section', { className:'pv-card' },
      h('h2', null, 'Reservation dates need review'), h('p', null, model.message), h('p', null, 'Your recorded payments are retained. Contact the office for confirmed dates.'));
    return h('section', { className:'pv-card', 'aria-label':'Reservation and deposit' },
      h('h2', null, 'Your reservation and deposit'), h('p', { className:'pv-status' }, labels[model.state]),
      h('dl', { className:'pv-dates' },
        h('div', null, h('dt', null, 'Required credited deposit'), h('dd', null, peso(model.depositRequiredCentavos))),
        h('div', null, h('dt', null, 'Verified deposit credit'), h('dd', null, peso(model.depositCreditCentavos))),
        h('div', null, h('dt', null, 'Deposit still needed'), h('dd', null, peso(model.depositRemainingCentavos))),
        h('div', null, h('dt', null, model.plan === 'spot_cash' ? 'Full spot-cash balance deadline' : 'Original deposit deadline'), h('dd', null, date(model.deadlineDate)))),
      model.reviewRequired && h('p', { className:'pv-notice pv-warning' }, 'The reservation deadline has passed with the required payment still outstanding. Office review is needed; your plot is not released automatically.'),
      model.fulfilledAfterDeadline && h('p', { className:'pv-notice' }, 'The required payment was completed after the original deadline. The office can review its timing.'),
      model.plan === 'spot_cash' ? h('p', null, 'A deposit does not move this deadline. Monthly installments do not apply to spot cash.') :
        h(React.Fragment, null, h('p', null, `First installment date: ${date(model.firstInstallmentDate)}.`),
          h('p', { className:'pv-notice' }, 'Monthly amounts and late-penalty calculations await accountant confirmation. The dates below are a timing calendar, not a bill or a settlement quote. Existing accepted obligations still apply.'),
          model.calendar.length > 0 && h('details', null, h('summary', null, 'View installment timing calendar'),
            h('ol', null, model.calendar.map((row) => h('li', { key:row.sequence }, `${date(row.dueDate)} — amount awaiting confirmation`))))),
      model.state === 'principal_settled' && h('p', { className:'pv-notice' }, 'Principal is fully credited. Final clearance of any other agreed obligations requires office review.'),
      h('p', { className:'pv-muted' }, model.holdMessage));
  }
  window.PaymentLifecycle = PaymentLifecycle;
})();
