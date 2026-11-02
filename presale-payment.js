'use strict';

(() => {
  const h = React.createElement;
  function PresalePayment({ reservation }) {
    const [saved,setSaved] = React.useState(null), [accessLost,setAccessLost] = React.useState(false);
    const heading = React.useRef(null);
    React.useEffect(()=>{heading.current?.focus();},[!!saved]);
    return h('section',{className:'ps-payment','aria-label':'Reservation payment'},
      h('div',{className:'pv-card'},h('p',{className:'pv-eyebrow'},'Plots held · payment verification separate'),
        h('h2',{ref:heading,tabIndex:-1},saved?'Payment submitted — pending admin verification':'Your plots are held. Complete your payment step.'),
        h('p',null,`Reservation ${reservation.ref} · ${reservation.plots.map(p=>p.plotCode).join(' · ')}`),
        h('p',null,`Original reservation deadline: ${reservation.deadlineDate} (Philippines).`),
        h('p',null,'The deposit is credited toward your plan. Only admin verification changes your balance.'),
        h('a',{className:'pv-secondary',href:`/my-payments?mode=reservation&ref=${encodeURIComponent(reservation.ref)}`},'Open secure payment access')),
      accessLost ? h('p',{role:'alert',className:'pv-notice'},'Your submission session expired. Your plots remain held. Open secure payment access above to continue; do not reserve or pay again.') :
        h(window.PaymentSubmission,{mode:'reservation',reservationRef:reservation.ref,plots:reservation.plots.map(p=>p.plotCode),qrFirst:true,onAccessLost:()=>setAccessLost(true),onSubmitted:setSaved}),
      h('div',{className:'pv-card'},h('h3',null,'Your deadline and next steps'),
        h('p',null,reservation.plan==='cash'?'Your full spot-cash balance is due by the original reservation deadline.':'Installments begin one month after the received-payment date that completes your verified deposit. Installment amounts still need office confirmation.'),
        h('p',null,'Keep your reference. For later access or corrected proof, request an email verification link using your reservation reference and registered email. Corrections do not extend the deadline or release your plots.'))
    );
  }
  window.PresalePayment = PresalePayment;
})();
