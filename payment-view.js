'use strict';

(() => {
  if (!window.React || !window.ReactDOM) return;
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;
  const peso = (value) => value === null ? 'For review' : new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP' }).format(value / 100);
  const date = (value) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone:'UTC', year:'numeric', month:'short', day:'numeric' }) : 'Office confirmation needed';

  async function api(action, fields = {}, account = false) {
    const headers = { 'Content-Type':'application/json' };
    if (account) {
      if (!window.auth?.currentUser) throw Object.assign(new Error('Please sign in again.'), { code:'UNAUTHENTICATED' });
      headers.Authorization = `Bearer ${await window.auth.currentUser.getIdToken()}`;
    }
    let response;
    try { response = await fetch('/api/payment-access', { method:'POST', credentials:'same-origin', headers, body:JSON.stringify({ action, ...fields }) }); }
    catch (_) { throw new Error('Connection interrupted. Please try again.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Payment access is temporarily unavailable.'), { code:result.code });
    return result;
  }

  function Field({ id, label, hint, ...props }) {
    return h('div', { className:'pv-field' }, h('label', { htmlFor:id }, label),
      h('input', { ...props, id, 'aria-describedby':hint ? `${id}-hint` : undefined }),
      hint && h('small', { id:`${id}-hint` }, hint));
  }

  function Summary({ data, busy, refresh, loadMore, close, chooseAccount }) {
    return h(React.Fragment, null,
      h('div', { className:'pv-actions' }, h('button', { className:'pv-secondary', onClick:close }, 'Close payment history'),
        chooseAccount && h('button', { className:'pv-secondary', onClick:chooseAccount, disabled:busy }, 'Choose another account'),
        h('button', { className:'pv-secondary', onClick:refresh, disabled:busy }, 'Refresh')),
      h('section', { className:'pv-card', 'aria-label':'Your contract' },
        h('p', { className:'pv-eyebrow' }, data.kind === 'presale' ? `Reservation ${data.id}` : data.label),
        h('h2', null, `Hello${data.name ? `, ${data.name}` : ''}`),
        h('p', { className:'pv-muted' }, data.plots.join(' · ') || 'Plot details are held by the office.'),
        h('span', { className:'pv-status' }, data.cancelled ? 'Reservation cancelled' : data.planLabel),
        data.monthlyCentavos > 0 && h('p', { className:'pv-muted', style:{ marginTop:14 } }, `Recorded monthly amount: ${peso(data.monthlyCentavos)}`)),
      data.warnings.map((warning, index) => h('p', { key:index, className:'pv-notice pv-warning' }, warning)),
      h('dl', { className:'pv-stats' }, [['Contract total',data.totalCentavos],['Recorded payments',data.paidCentavos],['Remaining balance',data.balanceCentavos]].map(([label,value]) =>
        h('div', { className:'pv-stat', key:label }, h('dt', null, label), h('dd', null, peso(value))))),
      h('section', { className:'pv-card' }, h('h2', null, 'Your next obligation'),
        h('p', { className:'pv-muted' }, 'Dates below come from your existing record. If a date is not available, the office will confirm it.'),
        h('dl', { className:'pv-dates' }, h('div', null, h('dt', null, data.planLabel === 'Spot cash' ? 'Spot-cash balance deadline' : 'Deposit deadline'), h('dd', null, date(data.deadlineDate))),
          h('div', null, h('dt', null, 'Next installment due'), h('dd', null, data.planLabel === 'Spot cash' ? 'Not applicable' : date(data.nextDueDate))))),
      data.pendingCount > 0 && h('p', { className:'pv-notice' }, `${data.pendingCount} payment submission${data.pendingCount === 1 ? '' : 's'} awaiting review. Pending amounts do not reduce your balance.`),
      h('section', { className:'pv-card' }, h('h2', null, 'Recorded payment history'),
        !data.entries.length ? h('p', { className:'pv-muted' }, 'No itemized payments are recorded yet. Contact the office if you have already paid.') :
          h('div', { className:'pv-table-wrap', role:'region', 'aria-label':'Payment history table', tabIndex:0 },
            h('table', null, h('caption', { className:'pv-sr' }, 'Recorded receipts and reversals, newest entries first'),
              h('thead', null, h('tr', null, h('th', { scope:'col' }, 'Date'), h('th', { scope:'col' }, 'Reference'), h('th', { scope:'col', className:'pv-amount' }, 'Amount'))),
              h('tbody', null, data.entries.map((entry) => h('tr', { key:entry.id }, h('td', null, date(entry.date)),
                h('td', null, entry.reference || 'Office record', h('div', { className:'pv-muted' }, entry.reversal ? 'Reversal' : entry.method)),
                h('td', { className:'pv-amount' }, peso(entry.amountCentavos))))))),
        data.nextCursor && h('button', { className:'pv-secondary pv-block', disabled:busy, onClick:loadMore }, 'Load earlier payments')),
      h('p', { className:'pv-muted' }, 'This page shows your records. Contact the office for payment assistance or corrections.'));
  }

  function App() {
    const query = new URLSearchParams(location.search);
    const [mode,setMode] = useState(query.get('mode') === 'account' ? 'account' : 'reservation');
    const [enabled,setEnabled] = useState(null);
    const [reference,setReference] = useState((query.get('ref') || '').slice(0,32));
    const [email,setEmail] = useState('');
    const [password,setPassword] = useState('');
    const [message,setMessage] = useState('');
    const [error,setError] = useState('');
    const [busy,setBusy] = useState(false);
    const [accounts,setAccounts] = useState(null);
    const [data,setData] = useState(null);
    const generation = useRef(0);
    const errorBox = useRef(null);
    const accountUid = useRef(null);

    const clear = () => { generation.current++; setData(null); setAccounts(null); setError(''); setMessage(''); setBusy(false); setPassword(''); accountUid.current = null; };
    async function run(work, apply) {
      const ticket = ++generation.current;
      setBusy(true); setError(''); setMessage('');
      try { const result = await work(); if (ticket === generation.current) apply(result); }
      catch (ex) {
        if (ticket === generation.current) {
          if (['SESSION_REQUIRED','UNAUTHENTICATED','FORBIDDEN'].includes(ex.code)) { setData(null); setAccounts(null); }
          setError(ex.message || 'Please try again.');
        }
      } finally { if (ticket === generation.current) setBusy(false); }
    }
    const load = (id, append = false) => run(() => mode === 'account'
      ? api('account_summary', { customerId:id, cursor:append ? data.nextCursor : null }, true)
      : api('guest_summary', { cursor:append ? data.nextCursor : null }), (result) => {
        setData((current) => append && current ? { ...result.summary, entries:[...current.entries,...result.summary.entries] } : result.summary);
      });

    useEffect(() => {
      let live = true;
      fetch('/api/payment-access', { cache:'no-store' }).then((response) => response.json()).then((config) => {
        if (!live) return;
        setEnabled(config.enabled === true);
        if (config.enabled && query.get('mode') === 'reservation') load(null);
      }).catch(() => { if (live) { setEnabled(false); setError('Could not connect. Reload this page to try again.'); } });
      return () => { live = false; generation.current++; };
    }, []);
    useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);
    useEffect(() => {
      const restore = (event) => { if (event.persisted) clear(); };
      window.addEventListener('pageshow', restore);
      const unsubscribe = window.auth?.onAuthStateChanged((user) => {
        if (accountUid.current && accountUid.current !== user?.uid) { clear(); setMessage('Your sign-in changed. Sign in to open your records again.'); }
      });
      return () => { window.removeEventListener('pageshow', restore); if (unsubscribe) unsubscribe(); };
    }, []);
    useEffect(() => {
      if (!data) return;
      const timer = setTimeout(() => { clear(); setMessage('For your privacy, the history view was closed. Verify your access again to continue.'); }, 30 * 60 * 1000);
      return () => clearTimeout(timer);
    }, [data]);

    const submit = (event) => {
      event.preventDefault();
      if (mode === 'reservation') return run(() => api('request_link', { reference, email }), (result) => setMessage(result.message));
      run(async () => {
        if (!window.auth) throw new Error('Sign-in could not load. Reload the page or contact the office.');
        try {
          await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
          const login = await window.auth.signInWithEmailAndPassword(email.trim(),password);
          accountUid.current = login.user.uid;
        } catch (_) { throw new Error('Could not sign in. Check your email and password, or contact the office for help.'); }
        setPassword('');
        return api('account_list', {}, true);
      }, (result) => setAccounts(result.accounts));
    };
    const close = () => {
      const wasAccount = mode === 'account';
      clear();
      run(async () => { if (wasAccount) await window.auth?.signOut(); else await api('logout'); }, () => setMessage('Payment history closed.'));
    };

    return h('main', { id:'payment-main', className:'pv-wrap' },
      h('div', { className:'pv-intro' }, h('p', { className:'pv-eyebrow' }, 'Golden Harmonic · Customer care'),
        h('h1', null, 'Your payments, clearly recorded.'), h('p', { className:'pv-muted' }, 'View your plot account, recorded payments and the dates confirmed by our office.')),
      h('p', { className:'pv-sr', role:'status', 'aria-live':'polite' }, busy ? 'Please wait…' : ''),
      error && h('div', { ref:errorBox, tabIndex:-1, role:'alert', className:'pv-notice pv-error' }, error),
      message && h('p', { role:'status', className:'pv-notice' }, message),
      enabled === null ? h('p', { role:'status' }, 'Checking secure access…') : enabled === false
        ? h('section', { className:'pv-card' }, h('h2', null, 'Please contact the office'), h('p', null, 'Secure online payment history is not available yet. Our office can help you check your records.'),
          h('button', { className:'pv-secondary', onClick:() => location.reload() }, 'Check again'))
        : data ? h(Summary, { data, busy, refresh:() => load(data.id), loadMore:() => load(data.id,true), close,
          chooseAccount: mode === 'account' && accounts?.length > 1 ? () => { generation.current++; setData(null); setError(''); setBusy(false); } : null })
        : accounts ? h('section', { className:'pv-card' }, h('h2', null, 'Choose your account'),
          accounts.length ? accounts.map((account) => h('button', { key:account.id, className:'pv-secondary pv-account', disabled:busy, onClick:() => load(account.id) }, account.label, h('span', null, 'View history →')))
            : h('p', null, 'No plot account is linked to this login. Please contact the office; accounts are not linked automatically by email.'),
          h('button', { className:'pv-secondary', onClick:close }, 'Sign out'))
        : h('div', { className:'pv-access-grid' },
          h('section', { className:'pv-card' }, h('div', { className:'pv-tabs', role:'group', 'aria-label':'Choose how to access your records' },
            [['reservation','Reservation email link'],['account','Account login']].map(([value,label]) => h('button', { key:value, type:'button', className:'pv-tab', 'aria-pressed':mode === value,
              onClick:() => { clear(); setMode(value); } }, label))),
            h('h2', null, mode === 'reservation' ? 'Open your reservation' : 'Sign in to your account'),
            h('p', { className:'pv-muted' }, mode === 'reservation' ? 'We’ll send a private link to the email already registered with your reservation.' : 'Use the account provided by our office.'),
            h('form', { onSubmit:submit },
              mode === 'reservation' && h(Field, { id:'payment-reference', label:'Reservation reference', hint:'Find this in your reservation email, for example PS-0004.', value:reference, required:true, maxLength:32, autoComplete:'off', onChange:(e) => setReference(e.target.value.toUpperCase()) }),
              h(Field, { id:'payment-email', label:mode === 'reservation' ? 'Registered email address' : 'Account email', type:'email', value:email, required:true, maxLength:254, autoComplete:'email', onChange:(e) => setEmail(e.target.value) }),
              mode === 'account' && h(Field, { id:'payment-password', label:'Password', type:'password', value:password, required:true, autoComplete:'current-password', onChange:(e) => setPassword(e.target.value) }),
              h('button', { className:'pv-primary pv-block', type:'submit', disabled:busy }, busy ? 'Please wait…' : mode === 'reservation' ? 'Send verification link' : 'Sign in'))),
          h('aside', { className:'pv-card' }, h('h2', null, mode === 'reservation' ? 'A simple, private check' : 'Your account stays yours'),
            h('ol', { className:'pv-steps' }, h('li', null, 'Verify your access with your registered email or account login.'), h('li', null, 'Review your recorded payments and balance.'), h('li', null, 'Contact the office if a payment or date needs checking.')),
            h('p', { className:'pv-muted' }, 'Using a different email? Ask the office to update your contact details after checking your identity.'))));
  }

  ReactDOM.createRoot(document.getElementById('payment-root')).render(h(App));
})();
