'use strict';

(() => {
  if (!window.React) return;
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const peso = (value) => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(value / 100);
  const labels = { deposit:'Reservation deposit', installment:'Installment', advance:'Advance payment', settlement:'Remaining balance' };

  async function prepareImage(file) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      throw new Error('Choose a JPG, PNG or WEBP image no larger than 5 MB.');
    }
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be opened. Choose another receipt image.'); });
    try {
      if (bitmap.width * bitmap.height > 16000000 || Math.min(bitmap.width,bitmap.height) < 64) throw new Error('Use a clear image between 64 pixels and 16 megapixels.');
      const ratio = Math.min(1,1600 / Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [0.85,0.75,0.65]) {
        const url = canvas.toDataURL('image/jpeg',quality);
        if (url.length <= 430000) return url;
      }
      throw new Error('Crop to the receipt and try again. Keep the reference, amount, recipient and date readable.');
    } finally { bitmap.close(); }
  }

  function PaymentSubmission({ mode, customerId, plots, onAccessLost }) {
    const [enabled,setEnabled] = useState(null), [options,setOptions] = useState(null), [rows,setRows] = useState([]);
    const [cursor,setCursor] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
    const [form,setForm] = useState(null), [review,setReview] = useState(false), [uncertain,setUncertain] = useState(false);
    const [shownProof,setShownProof] = useState(null);
    const ticket = useRef(0), alert = useRef(null), heading = useRef(null), mounted = useRef(true), request = useRef(null);
    async function api(action, fields = {}) {
      const headers = { 'Content-Type':'application/json' };
      if (mode === 'account') {
        if (!window.auth?.currentUser) { onAccessLost(); throw new Error('Please sign in again.'); }
        headers.Authorization = `Bearer ${await window.auth.currentUser.getIdToken()}`;
      }
      let response;
      try { response = await fetch('/api/payment-submission', { method:'POST', credentials:'same-origin', headers,
        body:JSON.stringify({ action, mode, ...(mode === 'account' ? { customerId } : {}), ...fields }) }); }
      catch (_) { throw Object.assign(new Error('Connection interrupted. Retry with these same details. If you leave, check your submissions before starting again.'), { uncertain:true }); }
      const result = await response.json().catch(() => ({}));
      if (['SESSION_REQUIRED','UNAUTHENTICATED','FORBIDDEN'].includes(result.code)) onAccessLost();
      if (!response.ok) throw Object.assign(new Error(result.error || 'Could not finish this request. Try again.'), { uncertain:response.status >= 500 });
      return result;
    }
    async function run(work, apply) {
      const current = ++ticket.current; setBusy(true); setError(''); setMessage('');
      try { const result = await work(); if (mounted.current && current === ticket.current) apply(result); }
      catch (ex) { if (mounted.current && current === ticket.current) setError(ex.message); }
      finally { if (mounted.current && current === ticket.current) setBusy(false); }
    }
    async function reload() {
      const [nextOptions,list] = await Promise.all([api('context'),api('list')]);
      return { nextOptions,list };
    }
    const applyReload = ({ nextOptions,list }) => { setOptions(nextOptions); setRows(list.cases); setCursor(list.nextCursor); };
    useEffect(() => {
      mounted.current = true;
      run(async () => {
        const config = await fetch('/api/payment-submission', { cache:'no-store' }).then((res) => res.json());
        return config.enabled ? { enabled:true, ...await reload() } : { enabled:false };
      }, (result) => { setEnabled(result.enabled); if (result.enabled) applyReload(result); });
      return () => { mounted.current = false; ticket.current++; request.current = null; };
    }, []);
    useEffect(() => { if (error) alert.current?.focus(); }, [error]);
    useEffect(() => { if (form) heading.current?.focus(); }, [review,!!form]);
    const update = (key,value) => { request.current = null; setForm((valueNow) => ({ ...valueNow,[key]:value })); };
    const start = (row) => {
      setError(''); setMessage(''); setReview(false); setUncertain(false); setShownProof(null); request.current = null;
      setForm({ offerId:row?.quote.id || options.offers[0]?.id || '', amount:row ? String(row.claimedCentavos / 100) : '',
        reference:row?.reference || '', transferDate:row?.transferDate || '', image:'', existing:row || null });
    };
    const offer = options?.offers.find((item) => item.id === form?.offerId);
    const reviewForm = (event) => {
      event.preventDefault(); setError('');
      if (!offer || !form.image) return setError('Choose a payment option and attach a readable proof image.');
      const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(form.amount);
      const amount = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2,'0')) : NaN;
      if (!Number.isSafeInteger(amount) || amount <= 0) return setError('Enter a positive peso amount with at most two decimal places.');
      request.current = { requestId:crypto.randomUUID(), offerId:offer.id, scopeVersion:options.scopeVersion,
        claimedCentavos:amount, transferDate:form.transferDate, reference:form.reference, image:form.image.split(',')[1],
        ...(form.existing ? { paymentId:form.existing.paymentId, expectedVersion:form.existing.version } : {}) };
      setReview(true);
    };
    const confirm = () => run(async () => {
      try { return await api('submit', { command:request.current }); }
      catch (ex) { if (mounted.current && ex.uncertain) setUncertain(true); throw ex; }
    }, (saved) => {
      setForm(null); setReview(false); setUncertain(false); request.current = null;
      setMessage(`Submission ${saved.paymentId} saved. Awaiting verification — your balance has not changed.`);
      // Keep the durable acknowledgement visible even when a subsequent refresh fails.
      reload().then((result) => { if (mounted.current) applyReload(result); }).catch(() => {});
    });
    const field = (id,label,type,key,extra = {}) => h('div', { className:'pv-field' }, h('label', { htmlFor:id },label),
      h('input', { id,type,value:form[key],required:true,disabled:busy,onChange:(e) => update(key,e.target.value),...extra }));
    const preview = (url,caption) => h('figure', { className:'ps-proof' }, h('img', { src:url,alt:caption }),
      h('figcaption', null,caption), h('details', null,h('summary', null,'Inspect full-size image'),h('div', { className:'ps-zoom',tabIndex:0,role:'region','aria-label':'Full-size receipt image' },h('img', { src:url,alt:'Full-size payment evidence' }))));

    return h('section', { className:'pv-card', 'aria-label':'Manual payment evidence' },
      h('p', { className:'pv-eyebrow' }, 'GCash & bank transfer'), h('h2', null,'Submit payment proof'),
      h('p', { className:'pv-muted' }, 'Already transferred? Send your receipt for an admin to check. Uploading proof does not confirm payment or extend a deadline.'),
      error && h('div', { ref:alert,tabIndex:-1,role:'alert',className:'pv-notice pv-error' },error,
        !form && h('button', { className:'pv-secondary',disabled:busy,onClick:() => run(reload,(result) => { setEnabled(true); applyReload(result); }) },'Retry loading submissions')),
      message && h('p', { role:'status',className:'pv-notice' },message),
      busy && h('p', { role:'status' },'Please wait…'),
      enabled === false ? h('p', { className:'pv-notice' },'Online proof submission is not available yet. Please contact the office.') :
        options && h(React.Fragment, null,
          !options.offers.length && h('p', { className:'pv-notice' },'The office must confirm your payment amount and receiving instructions before you submit online.'),
          !form && options.offers.length > 0 && h('button', { className:'pv-primary',disabled:busy,onClick:() => start(null) },'Add payment proof'),
          form && h('div', { className:'ps-form' },
            h('h3', { ref:heading,tabIndex:-1 },review ? 'Review before submitting' : form.existing ? 'Correct your submission' : 'Payment details'),
            review ? h(React.Fragment, null,
              h('p', null,plots.join(' · ') || 'Your selected account'),
              h('dl', { className:'ps-review' },[
                ['Purpose',labels[offer.purpose]],['Expected amount',peso(offer.expectedAmountCentavos)],['Your claimed amount',peso(request.current.claimedCentavos)],
                ['Recipient',`${offer.label} · ${offer.accountName} · ${offer.accountNumber}`],['Transfer date',form.transferDate],['Reference',form.reference]
              ].map(([label,value]) => h('div', { key:label },h('dt', null,label),h('dd', null,value)))),
              request.current.claimedCentavos !== offer.expectedAmountCentavos && h('p', { className:'pv-notice pv-warning' },'Your amount differs from the expected amount. The admin will review it; the expected amount will stay unchanged.'),
              preview(form.image,'Check that all transfer details are readable.'),
              h('p', { className:'pv-notice' },'This is a claim for review, not a receipt confirming that the park received money.'),
              uncertain && h('p', { className:'pv-notice pv-warning' },'The previous response was uncertain. Retry these same details to recover the saved result without duplicating it.'),
              h('div', { className:'pv-actions' }, h('button', { className:'pv-primary',disabled:busy,onClick:confirm },uncertain ? 'Check / retry submission' : 'Confirm and submit proof'),
                !uncertain && h('button', { className:'pv-secondary',disabled:busy,onClick:() => setReview(false) },'Back to edit')))
              : h('form', { onSubmit:reviewForm },
                h('div', { className:'pv-field' },h('label', { htmlFor:'proof-option' },'Payment option'),
                  h('select', { id:'proof-option',required:true,value:form.offerId,disabled:busy || !!form.existing,onChange:(e) => update('offerId',e.target.value) },
                    options.offers.map((item) => h('option', { key:item.id,value:item.id },`${labels[item.purpose]} · ${item.label} · ${peso(item.expectedAmountCentavos)}`)))),
                offer && h('div', { className:'ps-instructions' },h('div', null,h('h4', null,offer.label),h('p', null,offer.accountName),h('p', { className:'ps-number' },offer.accountNumber),h('p', null,offer.instructions),
                  h('button', { type:'button',className:'pv-secondary',onClick:() => run(() => navigator.clipboard.writeText(offer.accountNumber),() => setMessage('Receiving account number copied.')) },'Copy account number')),
                  h('figure', { className:'ps-demo' },h('img', { src:'/payment-demo-qr.png',alt:'Decorative demo QR image — not for payment',width:180,height:180 }),h('figcaption', null,'Demo QR — not for payment'))),
                field('proof-amount','Amount you transferred (₱)','text','amount',{ inputMode:'decimal',maxLength:16 }),
                field('proof-reference','Transfer reference','text','reference',{ maxLength:100 }),
                field('proof-date','Transfer date (Philippines)','date','transferDate'),
                h('div', { className:'pv-field' },h('label', { htmlFor:'proof-file' },'Receipt image'),
                  h('input', { id:'proof-file',type:'file',accept:'image/jpeg,image/png,image/webp',disabled:busy,'aria-describedby':'proof-file-help',onChange:(event) => {
                    const file = event.target.files[0]; update('image','');
                    if (file) run(() => prepareImage(file),(url) => update('image',url));
                  } }),h('small', { id:'proof-file-help' },'JPG, PNG or WEBP up to 5 MB. We compress the image; inspect the preview before confirming. No automatic text extraction is used.')),
                form.image && preview(form.image,'Your selected receipt image'),
                h('div', { className:'pv-actions' },h('button', { type:'submit',className:'pv-primary',disabled:busy || !form.image },'Review submission'),
                  h('button', { type:'button',className:'pv-secondary',disabled:busy,onClick:() => setForm(null) },'Cancel')))),
          !form && h(React.Fragment, null,h('div', { className:'pv-actions' },h('h3', null,'Your proof submissions'),h('button', { className:'pv-secondary',disabled:busy,onClick:() => run(reload,applyReload) },'Refresh submissions')),
            !rows.length && h('p', { className:'pv-muted' },'No online proof submissions yet.'),
            rows.map((row) => h('article', { key:row.paymentId,className:'ps-case' },h('h4', null,`${labels[row.quote.purpose]} · ${peso(row.claimedCentavos)}`),
              h('p', { className:'ps-id' },row.paymentId),h('p', { className:'pv-status' },row.status.replaceAll('_',' ')),
              h('p', null,`${row.reference} · ${row.transferDate} · Revision ${row.version}`),
              h('div', { className:'pv-actions' },h('button', { className:'pv-secondary',disabled:busy,onClick:() => run(() => api('proof',{paymentId:row.paymentId,revisionId:row.revisionId}),
                (result) => setShownProof({id:row.paymentId,url:`data:image/jpeg;base64,${result.base64}`})) },'View proof'),
                ['pending_verification','resubmit_requested'].includes(row.status) && options.offers.some((item) => item.id === row.quote.id) && h('button', { className:'pv-secondary',disabled:busy,onClick:() => start(row) },'Correct submission')),
              row.version > 1 && h('details', { className:'ps-proof' },h('summary', null,'Earlier proof revisions'),
                h('div', { className:'pv-actions' },Array.from({length:Math.min(row.version - 1,9)},(_,index) => h('button', {
                  key:index,className:'pv-secondary',disabled:busy,onClick:() => run(() => api('proof',{paymentId:row.paymentId,revisionId:`r${index+1}`}),
                    (result) => setShownProof({id:row.paymentId,url:`data:image/jpeg;base64,${result.base64}`}))
                },`View revision ${index+1}`)))),
              shownProof?.id === row.paymentId && h('div', null,preview(shownProof.url,'Saved private proof'),h('button', { className:'pv-secondary',onClick:() => setShownProof(null) },'Hide proof')))),
            cursor && h('button', { className:'pv-secondary',disabled:busy,onClick:() => run(() => api('list',{cursor}),(result) => { setRows((current) => [...current,...result.cases]); setCursor(result.nextCursor); }) },'Load earlier submissions'))));
  }
  window.PaymentSubmission = PaymentSubmission;
})();
