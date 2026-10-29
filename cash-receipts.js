/* Cash Receipts tab (admin). Talks only to /api/cash-receipt; all rules are enforced on the server.
   Flow: 1 Record (saved as pending) -> 2 Print -> 3 Photo of the printed copy -> 4 Confirm cash received & approve. */
(function () {
  const h = React.createElement;
  const { useState, useEffect, useCallback, useRef } = React;
  const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PURPOSES = [['installment', 'Monthly installment'], ['down_payment', 'Down payment'], ['full_payment', 'Full payment (spot cash)'], ['balance', 'Balance payment'], ['reservation', 'Reservation fee'], ['other', 'Other']];
  const STATUS = { pending_verification: ['Pending Verification', 'badge-contacted'], paid_verified: ['Paid / Verified', 'badge-new'], voided: ['Voided', 'badge-closed'] };
  const newRequestId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 24) : Math.random().toString(36).slice(2) + Date.now().toString(36));

  async function api(action, extra) {
    const user = window.auth && window.auth.currentUser;
    if (!user) throw new Error('Please log in again.');
    const idToken = await user.getIdToken();
    let r;
    try {
      r = await fetch('/api/cash-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken, action, ...extra }) });
    } catch (e) { throw new Error('No connection. Nothing was lost. Please check the internet and try again.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j;
  }

  // Shrinks a phone photo to a JPEG of about 1400px so it fits comfortably in the database.
  function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Please choose a photo (image file).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read. Please try another one.')); };
      img.src = url;
    });
  }

  // The receipt as it appears on paper. Used for the on-screen preview and (through a portal) for printing.
  function Paper({ r, reprint, printedBy }) {
    const row = (k, v) => h('tr', null, h('td', { className: 'cr-k' }, k), h('td', { className: 'cr-v' }, v));
    return h('div', { className: 'cr-sheet' },
      reprint && h('div', { className: 'cr-reprint' }, 'REPRINT'),
      h('div', { className: 'cr-head' },
        h('img', { src: '/logo-header.png', alt: '', className: 'cr-logo', onError: (e) => { e.target.style.display = 'none'; } }),
        h('div', null, h('div', { className: 'cr-co' }, 'Golden Harmonic Memorial Park'), h('div', { className: 'cr-sub' }, 'Taytay, Palawan'))),
      h('div', { className: 'cr-title' }, 'CASH PAYMENT RECEIPT'),
      h('div', { className: 'cr-no' }, r.receiptNo),
      h('table', { className: 'cr-tbl' }, h('tbody', null,
        row('Client', r.clientName), row('Plot / Account', r.accountRef), row('Payment for', r.purpose),
        row('Payment method', 'Cash'), row('Date & time', r.createdAtText),
        row('Received by', r.createdBy))),
      h('div', { className: 'cr-amount' }, h('span', null, 'AMOUNT RECEIVED'), h('strong', null, peso(r.amount))),
      h('div', { className: 'cr-foot' },
        h('div', { className: 'cr-qr' }, r.qrSvg && h('div', { dangerouslySetInnerHTML: { __html: r.qrSvg } }), h('div', null, 'Scan to verify this receipt')),
        h('div', { className: 'cr-note' }, 'This receipt is valid once marked Paid / Verified. Keep it for your records.', r.status === 'voided' && h('b', { style: { display: 'block', color: '#b00' } }, 'VOIDED'))));
  }

  function Steps({ r }) {
    const done = r.status !== 'pending_verification';
    const st = (ok, t) => h('span', { className: 'cr-step' + (ok ? ' ok' : '') }, (ok ? '✓ ' : '○ ') + t);
    return h('div', { className: 'cr-steps' }, st(true, 'Saved'), st(r.printCount >= 1, 'Printed'), st(r.hasPhoto, 'Photo uploaded'), st(r.status === 'paid_verified', 'Approved'), done && r.status === 'voided' && h('span', { className: 'cr-step bad' }, '✕ Voided'));
  }

  function ReceiptModal({ no, isAdmin, onClose, onChanged, toast }) {
    const [r, setR] = useState(null);
    const [audit, setAudit] = useState(null);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState('');
    const [reprint, setReprint] = useState(false);
    const [photoUrl, setPhotoUrl] = useState('');
    const [fresh, setFresh] = useState(null); // compressed photo waiting to be uploaded
    const [confirm, setConfirm] = useState(false);
    const [ck, setCk] = useState([false, false]);
    const [voiding, setVoiding] = useState(false);
    const [reason, setReason] = useState('');
    const load = useCallback(async () => {
      try {
        const j = await api('get', { receiptNo: no });
        setR(j.receipt); setAudit(j.audit || null); setReprint(j.receipt.printCount >= 1);
        if (j.receipt.hasPhoto) api('getPhoto', { receiptNo: no }).then((p) => setPhotoUrl(p.photo)).catch(() => {});
      } catch (e) { setErr(e.message); }
    }, [no]);
    useEffect(() => { load(); }, [load]);
    const run = async (label, fn) => {
      if (busy) return; // ignore double clicks
      setBusy(label); setErr('');
      try { await fn(); } catch (e) { setErr(e.message); }
      setBusy('');
    };
    if (!r) return h('div', { className: 'modal-bg' }, h('div', { className: 'modal' }, err ? h('div', { className: 'cr-err' }, err) : h('div', { className: 'loading' }, h('div', { className: 'spinner' })), h('div', { className: 'modal-actions' }, h('button', { className: 'btn btn-outline', onClick: onClose }, 'Close'))));
    const pending = r.status === 'pending_verification';
    const doPrint = () => run('print', async () => {
      const j = await api('print', { receiptNo: no });
      setR(j.receipt); setReprint(j.reprint); onChanged();
      await new Promise((res) => setTimeout(res, 150)); // let the REPRINT label render before the print dialog opens
      window.print();
    });
    const pick = async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      setErr('');
      try { setFresh(await compressImage(f, 1400, 0.75)); } catch (ex) { setErr(ex.message); }
    };
    const upload = () => run('photo', async () => {
      await api('photo', { receiptNo: no, photo: fresh });
      setPhotoUrl(fresh); setFresh(null); toast('Photo saved.'); await load(); onChanged();
    });
    const approve = () => run('approve', async () => {
      const j = await api('approve', { receiptNo: no, confirmed: true });
      setConfirm(false); setCk([false, false]); setR(j.receipt);
      toast(j.already ? 'This payment was already approved.' : 'Payment approved. New balance: ' + peso(j.balanceAfter)); onChanged(); await load();
    });
    const doVoid = () => run('void', async () => {
      await api('void', { receiptNo: no, reason });
      setVoiding(false); setReason(''); toast('Receipt voided and recorded in the audit trail.'); onChanged(); await load();
    });
    const shown = photoUrl || fresh;
    return h('div', { className: 'modal-bg' },
      h('div', { className: 'modal wide cr-modal' },
        h('div', { className: 'cr-mh' }, h('div', null, h('h3', { style: { margin: 0 } }, r.receiptNo), h('span', { className: 'badge ' + STATUS[r.status][1] }, STATUS[r.status][0])), h('button', { className: 'btn btn-outline btn-sm', onClick: onClose }, 'Close')),
        h(Steps, { r }),
        err && h('div', { className: 'cr-err' }, err),
        h('div', { className: 'cr-cols' },
          h('div', null, h(Paper, { r, reprint }),
            h('div', { className: 'cr-actions' },
              r.status !== 'voided' && h('button', { className: 'btn btn-primary', disabled: !!busy, onClick: doPrint }, busy === 'print' ? 'Preparing…' : r.printCount >= 1 ? '🖨 Reprint Receipt' : '🖨 Print Receipt'),
              h('div', { className: 'cr-hint' }, 'Printing does not approve the payment or change the balance.' + (r.printCount ? ' Printed ' + r.printCount + '×.' : '')))),
          h('div', null,
            h('div', { className: 'cr-box' }, h('b', null, 'Step 2 · Photo of the printed receipt'),
              shown ? h('img', { src: shown, alt: 'Receipt photo', className: 'cr-photo' }) : h('div', { className: 'cr-hint' }, r.printCount >= 1 ? 'Take a photo of the printed copy before you hand it to the client.' : 'Print the receipt first.'),
              pending && h('div', { className: 'cr-actions' },
                h('label', { className: 'btn btn-outline btn-sm' + (r.printCount >= 1 ? '' : ' cr-off') }, r.hasPhoto ? 'Retake / choose photo' : '📷 Take / choose photo', h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, disabled: r.printCount < 1, onChange: pick })),
                fresh && h('button', { className: 'btn btn-primary btn-sm', disabled: !!busy, onClick: upload }, busy === 'photo' ? 'Uploading…' : 'Upload photo'))),
            h('div', { className: 'cr-box' }, h('b', null, 'Step 3 · Confirm'),
              pending ? h(React.Fragment, null,
                h('div', { className: 'cr-hint' }, r.printCount < 1 ? 'Print the receipt first.' : !r.hasPhoto ? 'Upload the receipt photo to unlock approval.' : 'Ready. Approving adds ' + peso(r.amount) + ' to the client’s account.'),
                h('button', { className: 'btn btn-gold', style: { marginTop: 8 }, disabled: !(r.printCount >= 1 && r.hasPhoto) || !!busy, onClick: () => setConfirm(true) }, 'Confirm Cash Received & Approve'))
                : r.status === 'paid_verified' ? h('div', { className: 'cr-hint' }, 'Approved by ', h('b', null, r.approvedBy), ' on ', r.approvedAtText, '. The client can see this receipt in their account.')
                  : h('div', { className: 'cr-hint' }, 'Voided by ', h('b', null, r.voidedBy), ' on ', r.voidedAtText, '. Reason: ', r.voidReason)),
            r.status !== 'voided' && isAdmin && h('div', { className: 'cr-box' }, h('b', null, 'Void / reverse'),
              h('div', { className: 'cr-hint' }, pending ? 'Cancels this pending receipt. Its number is never reused.' : 'Adds a recorded reversal to the account. The original payment stays in the history.'),
              h('button', { className: 'btn btn-danger btn-sm', style: { marginTop: 8 }, onClick: () => setVoiding(true) }, 'Void this receipt')),
            audit && h('div', { className: 'cr-box' }, h('b', null, 'Audit trail'),
              h('ul', { className: 'cr-audit' }, audit.map((a, i) => h('li', { key: i }, h('b', null, a.action), ' · ', a.by && a.by.name, ' · ', a.atText)))))),
        confirm && h('div', { className: 'modal-bg', style: { zIndex: 120 } }, h('div', { className: 'modal' },
          h('h3', null, 'Confirm cash received'),
          h('p', { className: 'cr-hint' }, r.clientName, ' · ', r.purpose, h('br'), h('b', null, peso(r.amount))),
          ['I received this exact amount in cash.', 'The client, account and payment details are correct.'].map((t, i) => h('label', { key: i, className: 'cr-ck' }, h('input', { type: 'checkbox', checked: ck[i], onChange: (e) => setCk(ck.map((v, j) => (j === i ? e.target.checked : v))) }), ' ', t)),
          err && h('div', { className: 'cr-err' }, err),
          h('div', { className: 'modal-actions' }, h('button', { className: 'btn btn-outline', onClick: () => setConfirm(false) }, 'Not yet'), h('button', { className: 'btn btn-gold', disabled: !(ck[0] && ck[1]) || !!busy, onClick: approve }, busy === 'approve' ? 'Approving…' : 'Approve payment')))),
        voiding && h('div', { className: 'modal-bg', style: { zIndex: 120 } }, h('div', { className: 'modal' },
          h('h3', null, 'Void ' + r.receiptNo),
          h('p', { className: 'cr-hint' }, pending ? 'This pending receipt will be cancelled.' : 'A negative reversal of ' + peso(r.amount) + ' will be added to the account.'),
          h('div', { className: 'field' }, h('label', null, 'Reason (required)'), h('input', { value: reason, onChange: (e) => setReason(e.target.value), maxLength: 200 })),
          err && h('div', { className: 'cr-err' }, err),
          h('div', { className: 'modal-actions' }, h('button', { className: 'btn btn-outline', onClick: () => setVoiding(false) }, 'Cancel'), h('button', { className: 'btn btn-danger', disabled: reason.trim().length < 5 || !!busy, onClick: doVoid }, 'Void receipt'))))),
      // print copy: lives on <body>, hidden on screen, the only thing shown when printing
      ReactDOM.createPortal(h('div', { className: 'cr-print-root' }, h(Paper, { r, reprint, printedBy: '' })), document.body));
  }

  function Recorder({ onSaved, toast }) {
    const [q, setQ] = useState('');
    const [list, setList] = useState([]);
    const [sel, setSel] = useState(null);
    const [amount, setAmount] = useState('');
    const [type, setType] = useState('installment');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const rid = useRef(newRequestId()); // reused on retry/double-click until the save succeeds
    useEffect(() => {
      const t = setTimeout(() => { api('clients', { q }).then((j) => setList(j.clients)).catch((e) => setErr(e.message)); }, 250);
      return () => clearTimeout(t);
    }, [q]);
    const choose = (c) => { setSel(c); setErr(''); setAmount(String(c.plan === 'cash' ? c.balance : Math.min(c.balance, c.monthly || c.balance))); setType(c.plan === 'cash' ? 'full_payment' : 'installment'); rid.current = newRequestId(); };
    const save = async () => {
      if (busy) return;
      setBusy(true); setErr('');
      try {
        const j = await api('create', { kind: sel.kind, targetId: sel.id, amount: Number(amount), purposeType: type, note, requestId: rid.current });
        toast(j.duplicate ? 'Already saved as ' + j.receipt.receiptNo : 'Saved as ' + j.receipt.receiptNo + ' (pending). Now print it.');
        rid.current = newRequestId(); setSel(null); setAmount(''); setNote('');
        onSaved(j.receipt.receiptNo);
      } catch (e) { setErr(e.message); }
      setBusy(false);
    };
    return h('div', { className: 'table-card', style: { padding: 18, marginBottom: 18 } },
      h('h3', { style: { marginBottom: 10 } }, 'Record a cash payment'),
      !sel ? h(React.Fragment, null,
        h('div', { className: 'field' }, h('label', null, 'Find the client (name, reference PS-0001, phone)'), h('input', { value: q, onChange: (e) => setQ(e.target.value), placeholder: 'Start typing…' })),
        h('div', { className: 'cr-results' }, list.length === 0 ? h('div', { className: 'empty' }, 'No client found.') : list.map((c) => h('button', { key: c.kind + c.id, className: 'cr-res', disabled: c.hasPlan === false, onClick: () => choose(c) },
          h('b', null, c.name), h('span', null, c.accountRef), h('span', null, 'Balance ', peso(c.balance), c.hasPlan === false ? ' · no plan yet' : ''), h('em', null, c.kind === 'presale' ? 'Presale' : 'Customer')))))
        : h(React.Fragment, null,
          h('div', { className: 'cr-sel' }, h('div', null, h('b', null, sel.name), h('div', { className: 'cr-hint' }, sel.accountRef, ' · ', sel.planText)), h('div', { className: 'cr-hint' }, 'Total ', peso(sel.total), ' · Paid ', peso(sel.paid), ' · ', h('b', null, 'Balance ', peso(sel.balance))), h('button', { className: 'btn btn-outline btn-sm', onClick: () => setSel(null) }, 'Change client')),
          h('div', { className: 'cr-form' },
            h('div', { className: 'field' }, h('label', null, 'Amount received (₱)'), h('input', { value: amount, inputMode: 'decimal', onChange: (e) => setAmount(e.target.value.replace(/[^0-9.]/g, '')) })),
            h('div', { className: 'field' }, h('label', null, 'Payment for'), h('select', { value: type, onChange: (e) => setType(e.target.value) }, PURPOSES.map(([k, l]) => h('option', { key: k, value: k }, l + (k === 'installment' && sel.months ? ' (next: #' + sel.nextInstallmentNo + ' of ' + sel.months + ')' : ''))))),
            h('div', { className: 'field' }, h('label', null, type === 'other' ? 'Describe the payment (required)' : 'Note (optional)'), h('input', { value: note, maxLength: 120, onChange: (e) => setNote(e.target.value) }))),
          err && h('div', { className: 'cr-err' }, err),
          h('button', { className: 'btn btn-primary', disabled: busy || !(Number(amount) > 0), onClick: save }, busy ? 'Saving…' : 'Save payment & preview receipt'),
          h('div', { className: 'cr-hint', style: { marginTop: 6 } }, 'Saved as Pending Verification. The balance changes only after you approve.')),
      !sel && err && h('div', { className: 'cr-err' }, err));
  }

  function CashReceipts({ isAdmin }) {
    const [rows, setRows] = useState(null);
    const [filter, setFilter] = useState('pending_verification');
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);
    const [toast, setToast] = useState('');
    const [err, setErr] = useState('');
    const reload = useCallback(() => api('list', { status: 'all' }).then((j) => { setRows(j.receipts); setErr(''); }).catch((e) => setErr(e.message)), []);
    useEffect(() => { reload(); }, [reload]);
    useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);
    const shown = (rows || []).filter((r) => (filter === 'all' || r.status === filter) && (!q || [r.receiptNo, r.clientName, r.accountRef, r.purpose].join(' ').toLowerCase().includes(q.toLowerCase())));
    const nPending = (rows || []).filter((r) => r.status === 'pending_verification').length;
    return h('div', null,
      h(Recorder, { toast: setToast, onSaved: (no) => { reload(); setOpen(no); } }),
      h('div', { className: 'table-card' },
        h('div', { className: 'cr-bar' },
          [['pending_verification', 'Pending Verification' + (rows ? ' (' + nPending + ')' : '')], ['paid_verified', 'Paid / Verified'], ['voided', 'Voided'], ['all', 'All']].map(([k, l]) => h('button', { key: k, className: 'btn btn-sm ' + (filter === k ? 'btn-primary' : 'btn-outline'), onClick: () => setFilter(k) }, l)),
          h('input', { className: 'cr-search', placeholder: 'Search receipt no., client…', value: q, onChange: (e) => setQ(e.target.value) })),
        err ? h('div', { className: 'cr-err', style: { margin: 16 } }, err, ' ', h('button', { className: 'btn btn-outline btn-sm', onClick: reload }, 'Retry'))
          : !rows ? h('div', { className: 'loading' }, h('div', { className: 'spinner' }))
            : shown.length === 0 ? h('div', { className: 'empty' }, filter === 'pending_verification' ? 'No payments waiting for verification.' : 'Nothing here yet.')
              : h('div', { style: { overflowX: 'auto' } }, h('table', { className: 'gh-table gh-table-dense' },
                h('thead', null, h('tr', null, ['Receipt', 'Client', 'For', 'Amount', 'Recorded', 'By', 'Status', ''].map((t) => h('th', { key: t }, t)))),
                h('tbody', null, shown.map((r) => h('tr', { key: r.receiptNo },
                  h('td', null, h('b', null, r.receiptNo)), h('td', null, r.clientName, h('div', { className: 'cr-hint' }, r.accountRef)), h('td', null, r.purpose), h('td', null, peso(r.amount)),
                  h('td', null, r.createdAtText), h('td', null, r.createdBy), h('td', null, h('span', { className: 'badge ' + STATUS[r.status][1] }, STATUS[r.status][0]), r.status === 'pending_verification' && h('div', { className: 'cr-hint' }, (r.printCount ? 'printed' : 'not printed') + ' · ' + (r.hasPhoto ? 'photo ✓' : 'no photo'))),
                  h('td', null, h('button', { className: 'btn btn-outline btn-sm', onClick: () => setOpen(r.receiptNo) }, r.status === 'pending_verification' ? 'Continue' : 'View'))))))),
        ),
      open && h(ReceiptModal, { no: open, isAdmin, onClose: () => setOpen(null), onChanged: reload, toast: setToast }),
      toast && h('div', { className: 'toast' }, toast));
  }
  window.CashReceipts = CashReceipts;
})();
