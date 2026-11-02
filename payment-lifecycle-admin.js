'use strict';
(() => {
  if (!window.React || !window.ReactDOM) return;
  const h = React.createElement, { useState, useEffect, useRef } = React;
  async function api(action, fields = {}) {
    if (!window.auth?.currentUser) throw Object.assign(new Error('Please sign in again.'), { code:'UNAUTHENTICATED' });
    let response;
    try {
      response = await fetch('/api/payment-lifecycle', { method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${await window.auth.currentUser.getIdToken()}` },
        body:JSON.stringify({ action, ...fields }) });
    } catch (_) { throw Object.assign(new Error('Connection interrupted. Retry the same review.'), { uncertain:true }); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Review service unavailable.'), { code:result.code, uncertain:response.status >= 500 });
    return result;
  }
  function App() {
    const [enabled, setEnabled] = useState(null), [signed, setSigned] = useState(false);
    const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
    const [error, setError] = useState(''), [message, setMessage] = useState(''), [rows, setRows] = useState([]), [cursor, setCursor] = useState(null);
    const [detail, setDetail] = useState(null), [reason, setReason] = useState(''), [command, setCommand] = useState(null), [uncertain, setUncertain] = useState(false);
    const ticket = useRef(0), uid = useRef(null), alert = useRef(null), heading = useRef(null);
    const clear = () => { ticket.current++; uid.current = null; setSigned(false); setPassword(''); setRows([]); setCursor(null);
      setDetail(null); setReason(''); setCommand(null); setUncertain(false); setError(''); setMessage(''); setBusy(false); };
    const run = async (work, apply) => {
      const t = ++ticket.current; setBusy(true); setError(''); setMessage('');
      try { const result = await work(); if (t === ticket.current) apply(result); }
      catch (e) { if (t === ticket.current) { if (['FORBIDDEN', 'UNAUTHENTICATED'].includes(e.code)) clear(); setError(e.message); } }
      finally { if (t === ticket.current) setBusy(false); }
    };
    const loadQueue = (more = false) => run(() => api('queue', { cursor:more ? cursor : null }), (r) => {
      setRows((old) => more ? [...old, ...r.rows] : r.rows); setCursor(r.nextCursor); setSigned(true);
    });
    useEffect(() => {
      let live = true;
      fetch('/api/payment-lifecycle', { cache:'no-store' }).then((r) => r.json()).then((c) => { if (live) setEnabled(c.enabled); }).catch(() => { if (live) setEnabled(false); });
      const off = window.auth?.onAuthStateChanged((u) => { if (uid.current && uid.current !== u?.uid) clear(); });
      const restore = (e) => { if (e.persisted) clear(); }; window.addEventListener('pageshow', restore);
      return () => { live = false; ticket.current++; off?.(); window.removeEventListener('pageshow', restore); };
    }, []);
    useEffect(() => { if (!signed) return; const timer = setTimeout(clear, 15 * 60 * 1000); return () => clearTimeout(timer); }, [signed]);
    useEffect(() => { if (error) alert.current?.focus(); }, [error]);
    useEffect(() => { heading.current?.focus(); }, [command, detail]);
    const login = (e) => { e.preventDefault(); run(async () => {
      await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const r = await window.auth.signInWithEmailAndPassword(email, password); uid.current = r.user.uid;
      return api('queue');
    }, (r) => { setSigned(true); setPassword(''); setRows(r.rows); setCursor(r.nextCursor); }); };
    const stage = (e) => { e.preventDefault(); setUncertain(false); setCommand({ bookingId:detail.bookingId,
      expectedVersion:detail.version, reason, requestId:crypto.randomUUID() }); };
    const save = () => run(async () => {
      try { return await api('retain', { command }); } catch (e) { if (e.uncertain) setUncertain(true); throw e; }
    }, () => { setCommand(null); setDetail(null); setReason(''); setUncertain(false); setMessage('Review saved. The hold and original deadline are unchanged. Refresh the list for current status.'); });
    const field = (id, label, value, change, props = {}) => h('div', { className:'pv-field' }, h('label', { htmlFor:id }, label),
      h('input', { id, value, onChange:(e) => change(e.target.value), required:true, ...props }));
    return h('main', { id:'lifecycle-main', className:'pv-wrap' },
      h('div', { className:'pv-intro' }, h('p', { className:'pv-eyebrow' }, 'Office · Reservations'), h('h1', null, 'Reservation review'),
        h('p', { className:'pv-muted' }, 'Check verified deposits and deadlines. Passing a deadline never releases a plot automatically.')),
      error && h('p', { ref:alert, tabIndex:-1, role:'alert', className:'pv-notice pv-error' }, error),
      message && h('p', { role:'status', className:'pv-notice' }, message),
      busy && h('p', { role:'status' }, 'Please wait…'),
      enabled === null ? h('p', null, 'Checking availability…') : !enabled ? h('p', { className:'pv-notice' }, 'Reservation review is not enabled yet.') :
        !signed ? h('section', { className:'pv-card' }, h('h2', null, 'Admin sign-in'), h('form', { onSubmit:login },
          field('lifecycle-email', 'Admin email', email, setEmail, { type:'email', autoComplete:'username' }),
          field('lifecycle-password', 'Password', password, setPassword, { type:'password', autoComplete:'current-password' }),
          h('button', { className:'pv-primary', disabled:busy }, 'Sign in for reservation review'))) :
          h(React.Fragment, null,
            h('div', { className:'pv-actions' }, h('button', { className:'pv-secondary', onClick:() => { clear(); window.auth.signOut(); } }, 'Sign out'),
              h('button', { className:'pv-secondary', disabled:busy || !!command, onClick:() => loadQueue() }, 'Refresh reservation list')),
            command ? h('section', { className:'pv-card' }, h('h2', { ref:heading, tabIndex:-1 }, 'Confirm retained hold'),
              h('p', null, command.bookingId), h('p', null, command.reason),
              h('p', null, 'This saves an admin review note. It does not extend a deadline, erase an outstanding review, or release a plot.'),
              h('div', { className:'pv-actions' }, h('button', { className:'pv-primary', disabled:busy, onClick:save }, uncertain ? 'Retry same review' : 'Confirm and retain hold'),
                h('button', { className:'pv-secondary', disabled:busy || uncertain, onClick:() => setCommand(null) }, 'Back'))) :
              h('div', { className:'pr-grid' },
                h('section', { className:'pv-card' }, h('h2', null, 'Reservations'),
                  h('p', { className:'pv-muted' }, 'All enabled contracts are listed. Open a contract for a fresh calculation.'),
                  !rows.length && h('p', null, 'No enabled reservations found.'),
                  h('div', { className:'pr-queue' }, rows.map((row) => h('button', { key:row.bookingId, className:'pv-secondary pv-account', disabled:busy,
                    onClick:() => run(() => api('detail', { bookingId:row.bookingId }), (r) => { setDetail(r); setReason(''); }) },
                  row.sourceId, h('small', null, row.reviewRequired ? 'Review needed' : row.state.replaceAll('_', ' '))))),
                  cursor && h('button', { className:'pv-secondary', disabled:busy, onClick:() => loadQueue(true) }, 'Load more reservations')),
                detail ? h('section', null, h('h2', { ref:heading, tabIndex:-1 }, `Reservation ${detail.sourceId}`),
                  h(window.PaymentLifecycle, { model:detail.lifecycle }),
                  h('section', { className:'pv-card' }, h('h3', null, 'Office checks'),
                    h('p', null, `Plots: ${detail.plotIds.join(', ')}`), h('p', null, `Pending payment cases: ${detail.pendingCases ?? 'Needs reconciliation'}`),
                    h('p', null, `Open provider checkout: ${detail.gatewayActive ? 'Yes — inspect provider reconciliation' : 'None recorded'}`),
                    !detail.ownershipCurrent && h('p', { className:'pv-notice pv-warning' }, 'Plot ownership needs reconciliation.'),
                    detail.lastReview && h('p', null, `Last retained-hold review: ${detail.lastReview.reason}`),
                    h('a', { href:'/payment-review.html' }, 'Manual payment review'), ' · ', h('a', { href:'/payment-gateway-admin.html' }, 'Provider reconciliation'),
                    detail.status === 'active' && h('form', { onSubmit:stage }, field('lifecycle-reason', 'Reason for retaining the hold', reason, setReason, { maxLength:1000 }),
                      h('button', { className:'pv-primary', disabled:busy }, 'Review retained hold')))) : h('p', null, 'Choose a reservation to review.'))));
  }
  ReactDOM.createRoot(document.getElementById('lifecycle-root')).render(h(App));
})();
