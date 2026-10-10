/* Golden Harmonic Memorial Park — Blocks B, C, D presale flow.
   Loaded as its own babel script. Everything is wrapped in a function so it
   shares no top-level names with site.jsx; it exposes window.PresaleFlow and
   window.PresaleContext. Reservations go through /api/presale (a Firestore
   transaction on the server), so two buyers can never get the same plot. */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;

  /* ---- Payment details shown to buyers. Fill these in when you have them;
     an empty value simply shows the generic "our staff will call you" line. ---- */
  const PAY_INFO = {
    office: '',   // e.g. 'Golden Harmonic office, Poblacion, Taytay, Palawan'
    hours: '',    // e.g. 'Monday to Saturday, 8:00 AM to 5:00 PM'
    gcash: '',    // e.g. 'Juan Dela Cruz · 09XX XXX XXXX'
    bank: '',     // e.g. 'BPI · Golden Harmonic Memorial Park · 0000-0000-00'
    cheque: ''    // e.g. 'Golden Harmonic Memorial Park'
  };

  const BLOCKS = ['B', 'C', 'D'];
  const COLS = 40;
  const ROWS = 50;
  const TOTAL = COLS * ROWS;

  const TYPES = {
    'regular': { name: 'Regular Plot', short: 'Regular', fallback: 30000, photo: '/regular_plot.jpg', tint: '#e8efe9', ink: '#2f5d4c' },
    'premium': { name: 'Premium Plot', short: 'Premium', fallback: 42500, photo: '/premium_plot.jpg', tint: '#f3e6c4', ink: '#8a6428' },
    'corner-premium': { name: 'Corner Premium Plot', short: 'Corner Premium', fallback: 47500, photo: '/corner_premium_plot.jpg', tint: '#e9d3a3', ink: '#6e4d17' }
  };
  const TYPE_IDS = ['regular', 'premium', 'corner-premium'];

  const TERMS = [
    { years: 1, surcharge: 0.10 },
    { years: 2, surcharge: 0.15 },
    { years: 3, surcharge: 0.20 },
    { years: 5, surcharge: 0.30, best: true }
  ];

  const METHODS = [
    { id: 'cash', label: 'Cash', hint: 'Pay in person at our office.' },
    { id: 'gcash', label: 'GCash', hint: 'Send to our GCash account.' },
    { id: 'bank', label: 'Bank transfer', hint: 'Deposit or transfer to our bank account.' },
    { id: 'cheque', label: 'Cheque', hint: 'Bring or send a cheque to our office.' }
  ];

  function typeOfLot(lot) {
    const i = lot - 1;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const layer = Math.min(col, COLS - 1 - col, row, ROWS - 1 - row);
    return layer < 3 ? 'corner-premium' : layer < 8 ? 'premium' : 'regular';
  }
  function colOf(lot) { return (lot - 1) % COLS; }
  function rowOf(lot) { return Math.floor((lot - 1) / COLS); }
  function lotAt(col, row) { return row * COLS + col + 1; }
  function code(block, lot) { return block + '-' + String(lot).padStart(4, '0'); }
  function peso(n) { return '₱' + Math.round(n).toLocaleString('en-PH'); }

  // Precomputed once: which type each lot is, and how many of each exist.
  const LOT_TYPES = [];
  for (let n = 1; n <= TOTAL; n++) LOT_TYPES[n] = typeOfLot(n);
  const TYPE_TOTALS = { 'regular': 0, 'premium': 0, 'corner-premium': 0 };
  for (let n = 1; n <= TOTAL; n++) TYPE_TOTALS[LOT_TYPES[n]]++;

  const START_POINT = { 'regular': lotAt(20, 25), 'premium': lotAt(5, 25), 'corner-premium': lotAt(1, 25) };

  function nearestFree(target, typeId, takenSet) {
    const tc = colOf(target), tr = rowOf(target);
    let best = 0, bestD = Infinity;
    for (let n = 1; n <= TOTAL; n++) {
      if (LOT_TYPES[n] !== typeId || takenSet.has(n)) continue;
      const dc = colOf(n) - tc, dr = rowOf(n) - tr;
      const d = dc * dc + dr * dr;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(20,28,24,.55)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
    sheet: { maxWidth: 980, margin: '0 auto', minHeight: '100%', background: 'var(--bg, #f6f1e8)', padding: '0 0 40px' },
    bar: { position: 'sticky', top: 0, zIndex: 2, background: '#2f5d4c', color: '#fffaf0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 },
    wrap: { padding: '22px 20px' },
    h2: { fontSize: 26, margin: '0 0 6px', lineHeight: 1.2 },
    lead: { fontSize: 17, color: 'var(--ink-2, #4a564f)', margin: '0 0 20px', lineHeight: 1.5 },
    card: { background: 'var(--card, #fbf7ee)', border: '1px solid var(--line, #d9cfbb)', borderRadius: 14, padding: 18 },
    big: { width: '100%', minHeight: 56, fontSize: 18, fontWeight: 700, borderRadius: 12, border: 'none', cursor: 'pointer', background: '#b08544', color: '#1f1607', padding: '14px 20px' },
    input: { width: '100%', boxSizing: 'border-box', fontSize: 18, padding: '13px 14px', borderRadius: 10, border: '1.5px solid #c9bd9f', background: '#fff', color: '#1f2a26', fontFamily: 'inherit' },
    label: { display: 'block', fontSize: 16, fontWeight: 600, margin: '14px 0 6px' },
    note: { background: '#fff6dc', border: '1px solid #e3c978', borderRadius: 10, padding: '10px 14px', fontSize: 16, lineHeight: 1.45 }
  };

  function Steps({ step }) {
    const names = ['Block', 'Plot type', 'Your details'];
    return (
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {names.map((n, i) => (
          <div key={n} style={{
            padding: '7px 14px', borderRadius: 999, fontSize: 15, fontWeight: 700,
            background: step === i + 1 ? '#2f5d4c' : step > i + 1 ? '#d8e6dc' : '#ece4d2',
            color: step === i + 1 ? '#fffaf0' : '#1f2a26'
          }}>{i + 1}. {n}</div>
        ))}
      </div>);
  }

  /* ---------- plot picker: block map with a draggable pin + 5x5 close-up ---------- */
  function PlotPicker({ block, typeId, lot, setLot, taken, notify }) {
    const svgRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const c = colOf(lot), r = rowOf(lot);

    const pickAt = useCallback((clientX, clientY) => {
      const svg = svgRef.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const col = Math.max(0, Math.min(COLS - 1, Math.floor(((clientX - box.left) / box.width) * COLS)));
      const row = Math.max(0, Math.min(ROWS - 1, Math.floor(((clientY - box.top) / box.height) * ROWS)));
      const want = lotAt(col, row);
      const best = nearestFree(want, typeId, taken);
      if (best) {
        setLot(best);
        if (best !== want) notify('We moved your pin to the nearest free ' + TYPES[typeId].short + ' plot.');
        else notify('');
      }
    }, [typeId, taken, setLot, notify]);

    useEffect(() => {
      if (!dragging) return;
      const move = (e) => pickAt(e.clientX, e.clientY);
      const up = () => setDragging(false);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    }, [dragging, pickAt]);

    const takenRects = useMemo(() => {
      const out = [];
      taken.forEach((n) => out.push(<rect key={n} x={colOf(n)} y={rowOf(n)} width="1" height="1" fill="#3b3b3b" opacity="0.55" />));
      return out;
    }, [taken]);

    // 5x5 close-up centred on the chosen plot (clamped so it stays inside the block)
    const gc = Math.max(2, Math.min(COLS - 3, c));
    const gr = Math.max(2, Math.min(ROWS - 3, r));
    const cells = [];
    for (let rr = gr - 2; rr <= gr + 2; rr++) {
      for (let cc = gc - 2; cc <= gc + 2; cc++) cells.push(lotAt(cc, rr));
    }
    const move = (dc, dr) => {
      const nc = Math.max(0, Math.min(COLS - 1, c + dc));
      const nr = Math.max(0, Math.min(ROWS - 1, r + dr));
      const want = lotAt(nc, nr);
      const best = nearestFree(want, typeId, taken);
      if (best) setLot(best);
    };
    const choose = (n) => {
      if (LOT_TYPES[n] !== typeId) { notify('That plot is ' + TYPES[LOT_TYPES[n]].short + '. You chose ' + TYPES[typeId].short + '.'); return; }
      if (taken.has(n)) { notify('That plot is already taken. Please pick another one.'); return; }
      notify('');
      setLot(n);
    };

    const arrow = { minHeight: 48, fontSize: 17, fontWeight: 700, borderRadius: 10, border: '1.5px solid #c9bd9f', background: '#fff', cursor: 'pointer' };

    return (
      <div>
        <p style={{ fontSize: 16, margin: '0 0 10px', lineHeight: 1.45 }}>
          Drag the <b>gold pin</b> on the map to the place you like. You can also press a square below, or use the arrow buttons.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }} className="presale-pick">
          <div>
            <div style={{ position: 'relative', width: '100%', aspectRatio: COLS + ' / ' + ROWS, touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
              onPointerDown={(e) => { e.preventDefault(); setDragging(true); pickAt(e.clientX, e.clientY); }}>
              <svg ref={svgRef} viewBox={'0 0 ' + COLS + ' ' + ROWS} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block', borderRadius: 10, border: '2px solid #2f5d4c' }}>
                <rect x="0" y="0" width={COLS} height={ROWS} fill="#e8efe9" />
                <rect x="3" y="3" width={COLS - 6} height={ROWS - 6} fill="#f3e6c4" />
                <rect x="8" y="8" width={COLS - 16} height={ROWS - 16} fill="#e8efe9" />
                <path d={'M0 0H' + COLS + 'V' + ROWS + 'H0Z M3 3V' + (ROWS - 3) + 'H' + (COLS - 3) + 'V3Z'} fill="#e9d3a3" fillRule="evenodd" />
                {takenRects}
                <rect x={c - 2} y={r - 2} width="5" height="5" fill="none" stroke="#b08544" strokeWidth="0.3" />
                <circle cx={c + 0.5} cy={r + 0.5} r="2.2" fill="#b08544" opacity="0.35" />
                <circle cx={c + 0.5} cy={r + 0.5} r="1.1" fill="#b08544" stroke="#fff" strokeWidth="0.35" />
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 14, marginTop: 8 }}>
              <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#e9d3a3', border: '1px solid #b08544', verticalAlign: -1 }}></i> Corner Premium</span>
              <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#f3e6c4', border: '1px solid #b08544', verticalAlign: -1 }}></i> Premium</span>
              <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#e8efe9', border: '1px solid #2f5d4c', verticalAlign: -1 }}></i> Regular</span>
              <span><i style={{ display: 'inline-block', width: 12, height: 12, background: '#777', verticalAlign: -1 }}></i> Taken</span>
            </div>
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 4 }}>
              {cells.map((n) => {
                const t = LOT_TYPES[n];
                const isTaken = taken.has(n);
                const sel = n === lot;
                const ok = t === typeId && !isTaken;
                return (
                  <button key={n} type="button" onClick={() => choose(n)}
                    aria-label={'Plot ' + n + (isTaken ? ', taken' : '')}
                    style={{
                      minHeight: 46, fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: ok ? 'pointer' : 'not-allowed',
                      border: sel ? '3px solid #b08544' : '1px solid #c9bd9f',
                      background: sel ? '#b08544' : isTaken ? '#9a9a9a' : TYPES[t].tint,
                      color: sel ? '#1f1607' : isTaken ? '#fff' : TYPES[t].ink,
                      opacity: ok || sel ? 1 : 0.55, padding: 0
                    }}>{n}</button>);
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6, marginTop: 8 }}>
              <button type="button" style={arrow} onClick={() => move(0, -1)}>Up</button>
              <button type="button" style={arrow} onClick={() => move(0, 1)}>Down</button>
              <button type="button" style={arrow} onClick={() => move(-1, 0)}>Left</button>
              <button type="button" style={arrow} onClick={() => move(1, 0)}>Right</button>
            </div>
          </div>
        </div>
      </div>);
  }

  /* ---------- the flow ---------- */
  function PresaleFlow({ tiers, startType, onClose }) {
    const priceOf = (id) => {
      const t = (tiers || []).find((x) => x.id === id);
      return t && t.price > 0 ? Math.round(t.price) : TYPES[id].fallback;
    };

    const [step, setStep] = useState(1);
    const [block, setBlock] = useState('');
    const [typeId, setTypeId] = useState(startType && TYPES[startType] ? startType : '');
    const [takenByBlock, setTakenByBlock] = useState({});
    const [loadErr, setLoadErr] = useState(false);
    const [lot, setLot] = useState(0);
    const [notice, setNotice] = useState('');
    const [plan, setPlan] = useState('cash');
    const [years, setYears] = useState(3);
    const [method, setMethod] = useState('cash');
    const [form, setForm] = useState({ name: '', address: '', mobile: '', email: '', consent: false, website: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(null);
    const topRef = useRef(null);

    const loadTaken = useCallback((b) => {
      setLoadErr(false);
      return fetch('/api/presale?block=' + b)
        .then((r) => { if (!r.ok) throw new Error('bad'); return r.json(); })
        .then((d) => { setTakenByBlock((m) => ({ ...m, [b]: d.taken || [] })); return d.taken || []; })
        .catch(() => { setLoadErr(true); return null; });
    }, []);

    useEffect(() => { BLOCKS.forEach((b) => loadTaken(b)); }, [loadTaken]);
    useEffect(() => { if (topRef.current) topRef.current.scrollIntoView(); }, [step, done]);

    const taken = useMemo(() => new Set(takenByBlock[block] || []), [takenByBlock, block]);

    const freeCounts = (b) => {
      const t = new Set(takenByBlock[b] || []);
      const out = { 'regular': TYPE_TOTALS['regular'], 'premium': TYPE_TOTALS['premium'], 'corner-premium': TYPE_TOTALS['corner-premium'] };
      t.forEach((n) => { if (LOT_TYPES[n]) out[LOT_TYPES[n]]--; });
      return out;
    };

    const chooseBlock = (b) => { setBlock(b); setStep(2); };
    const chooseType = (id) => {
      setTypeId(id);
      const first = nearestFree(START_POINT[id], id, taken);
      setLot(first);
      setNotice('');
      setStep(3);
    };

    // If the block data arrives after we picked a type, make sure the pin sits on a free plot.
    useEffect(() => {
      if (step === 3 && typeId && (!lot || taken.has(lot))) {
        const first = nearestFree(START_POINT[typeId], typeId, taken);
        if (first) setLot(first);
      }
    }, [step, typeId, taken]);

    const spot = typeId ? priceOf(typeId) : 0;
    const term = TERMS.find((t) => t.years === years) || TERMS[2];
    const totalFor = (t) => Math.round(spot * (1 + t.surcharge));
    const monthlyFor = (t) => Math.round(totalFor(t) / (t.years * 12));
    const total = plan === 'cash' ? spot : totalFor(term);
    const monthly = plan === 'cash' ? 0 : monthlyFor(term);
    const methodInfo = METHODS.find((m) => m.id === method);

    const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async (e) => {
      e.preventDefault();
      setError('');
      if (form.name.trim().length < 3) return setError('Please write your full name.');
      if (form.address.trim().length < 5) return setError('Please write your complete address.');
      if (form.mobile.replace(/\D/g, '').length < 10) return setError('Please write your mobile number (11 digits).');
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Please write a correct email address.');
      if (!form.consent) return setError('Please tick the box so our staff may contact you.');
      setBusy(true);
      try {
        const res = await fetch('/api/presale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            block, lot, plan, years: plan === 'cash' ? 0 : years, method,
            name: form.name, address: form.address, mobile: form.mobile, email: form.email,
            consent: form.consent, website: form.website
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) { setDone(data); return; }
        if (data.error === 'taken') {
          const fresh = await loadTaken(block);
          const set = new Set(fresh || []);
          const next = nearestFree(lot, typeId, set);
          if (next) setLot(next);
          setError('Sorry, someone just took plot ' + lot + '. We moved your pin to the nearest free plot. Please check it and press Send again.');
        } else if (data.error === 'dup') {
          setError('This mobile number already has a presale reservation. Each buyer can reserve one plot. Please call us if you need help.');
        } else {
          setError(data.error || 'Something went wrong. Please try again or call us.');
        }
      } catch (err) {
        setError('We could not reach our server. Please check your internet and try again.');
      } finally {
        setBusy(false);
      }
    };

    const back = () => { if (step > 1) setStep(step - 1); else onClose(); };

    /* ---------- screens ---------- */
    let body;

    if (done) {
      const m = METHODS.find((x) => x.id === done.method);
      const info = { cash: PAY_INFO.office, gcash: PAY_INFO.gcash, bank: PAY_INFO.bank, cheque: PAY_INFO.cheque }[done.method];
      body = (
        <div style={S.wrap}>
          <div style={{ ...S.card, borderColor: '#2f5d4c', borderWidth: 2 }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <h2 style={S.h2}>Your plot is reserved</h2>
            <p style={S.lead}>Thank you. Please keep this reference number: <b style={{ fontSize: 22, color: '#2f5d4c' }}>{done.ref}</b></p>
            <div style={{ display: 'grid', gap: 8, fontSize: 18 }}>
              <div><b>Plot:</b> {done.plotCode} · {TYPES[done.typeId].name}</div>
              <div><b>Plan:</b> {done.plan === 'cash' ? 'Spot cash · ' + peso(done.total) : done.years + ' years · ' + peso(done.monthly) + ' a month · total ' + peso(done.total)}</div>
              <div><b>You will pay by:</b> {m.label}</div>
              {info ? <div><b>Where:</b> {info}</div> : null}
              {PAY_INFO.hours && done.method === 'cash' ? <div><b>Office hours:</b> {PAY_INFO.hours}</div> : null}
            </div>
            <div style={{ ...S.note, marginTop: 16 }}>
              <b>What happens next:</b> our staff will call you to check your name and address. Your plot stays reserved while we do this. Your reservation is final once we receive your payment.
            </div>
            <button type="button" style={{ ...S.big, marginTop: 18 }} onClick={onClose}>Close</button>
          </div>
        </div>);
    } else if (step === 1) {
      body = (
        <div style={S.wrap}>
          <Steps step={1} />
          <h2 style={S.h2}>Choose your block</h2>
          <p style={S.lead}>Presale is open for Blocks B, C and D. One plot for each buyer, first come, first served.</p>
          {loadErr ? <div style={{ ...S.note, marginBottom: 14 }}>We could not check which plots are free right now. You can still continue; we will check again before you send.</div> : null}
          <div style={{ display: 'grid', gap: 12 }}>
            {BLOCKS.map((b) => {
              const fc = freeCounts(b);
              const free = fc['regular'] + fc['premium'] + fc['corner-premium'];
              return (
                <button key={b} type="button" onClick={() => chooseBlock(b)} style={{ ...S.card, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, minHeight: 80 }}>
                  <span style={{ fontSize: 38, fontWeight: 800, color: '#2f5d4c', width: 56 }}>{b}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 22, fontWeight: 700 }}>Block {b}</span>
                    <span style={{ display: 'block', fontSize: 16, color: '#4a564f' }}>{free.toLocaleString('en-PH')} plots still free</span>
                  </span>
                  <span style={{ fontSize: 28 }}>→</span>
                </button>);
            })}
          </div>
        </div>);
    } else if (step === 2) {
      const fc = freeCounts(block);
      body = (
        <div style={S.wrap}>
          <Steps step={2} />
          <h2 style={S.h2}>Block {block}: choose your plot type</h2>
          <p style={S.lead}>Spot cash prices are shown. Monthly plans come next.</p>
          <div style={{ display: 'grid', gap: 14 }}>
            {TYPE_IDS.map((id) => {
              const left = fc[id];
              return (
                <div key={id} style={{ ...S.card, display: 'grid', gridTemplateColumns: 'minmax(0,150px) minmax(0,1fr)', gap: 16, alignItems: 'center', outline: typeId === id ? '3px solid #b08544' : 'none' }}>
                  <img src={TYPES[id].photo} alt={TYPES[id].name} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10 }} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{TYPES[id].name}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#2f5d4c', margin: '4px 0' }}>{peso(priceOf(id))}</div>
                    <div style={{ fontSize: 15, color: '#4a564f', marginBottom: 10 }}>{left.toLocaleString('en-PH')} plots available in Block {block}</div>
                    <button type="button" disabled={left < 1} style={{ ...S.big, minHeight: 50, fontSize: 17, opacity: left < 1 ? 0.5 : 1 }} onClick={() => chooseType(id)}>
                      {left < 1 ? 'Sold out' : 'Choose ' + TYPES[id].short}
                    </button>
                  </div>
                </div>);
            })}
          </div>
        </div>);
    } else {
      const t = TYPES[typeId];
      body = (
        <form onSubmit={submit} style={S.wrap}>
          <Steps step={3} />
          <h2 style={S.h2}>Your plot and your details</h2>
          <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
            <img src={t.photo} alt={t.name} style={{ width: 96, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 8 }} />
            <div>
              <div style={{ fontSize: 14, color: '#4a564f' }}>You are buying</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Plot {lot ? code(block, lot) : '...'}</div>
              <div style={{ fontSize: 16 }}>{t.name} · Block {block} · Row {lot ? rowOf(lot) + 1 : ''}, Column {lot ? colOf(lot) + 1 : ''}</div>
            </div>
          </div>

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Choose your exact plot</div>
            {notice ? <div style={{ ...S.note, marginBottom: 10 }}>{notice}</div> : null}
            {lot ? <PlotPicker block={block} typeId={typeId} lot={lot} setLot={setLot} taken={taken} notify={setNotice} /> : <div>Loading plots...</div>}
          </div>

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>How will you pay?</div>
            {[{ id: 'cash', title: 'Spot cash', sub: peso(spot) + ' paid in full' }, { id: 'installment', title: 'Monthly installment', sub: 'Pay a little every month' }].map((o) => (
              <label key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 10px', borderRadius: 10, border: plan === o.id ? '2px solid #2f5d4c' : '1px solid #c9bd9f', background: plan === o.id ? '#eaf2ec' : '#fff', marginBottom: 8, cursor: 'pointer', fontSize: 18 }}>
                <input type="radio" name="plan" checked={plan === o.id} onChange={() => setPlan(o.id)} style={{ width: 24, height: 24 }} />
                <span><b>{o.title}</b><br /><span style={{ fontSize: 16, color: '#4a564f' }}>{o.sub}</span></span>
              </label>))}

            {plan === 'installment' ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>For how many years?</div>
                {TERMS.map((tm) => (
                  <label key={tm.years} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 10px', borderRadius: 10, border: years === tm.years ? '2px solid #b08544' : '1px solid #c9bd9f', background: years === tm.years ? '#fff6dc' : '#fff', marginBottom: 8, cursor: 'pointer' }}>
                    <input type="radio" name="years" checked={years === tm.years} onChange={() => setYears(tm.years)} style={{ width: 24, height: 24 }} />
                    <span style={{ flex: 1, fontSize: 18 }}>
                      <b>{tm.years} {tm.years === 1 ? 'year' : 'years'}</b> · <b>{peso(monthlyFor(tm))}</b> a month
                      {tm.best ? <span style={{ marginLeft: 8, fontSize: 13, background: '#2f5d4c', color: '#fff', borderRadius: 999, padding: '2px 10px' }}>Lowest monthly</span> : null}
                      <br /><span style={{ fontSize: 15, color: '#4a564f' }}>Total {peso(totalFor(tm))} (+{Math.round(tm.surcharge * 100)}%)</span>
                    </span>
                  </label>))}
              </div>) : null}

            <div style={{ fontSize: 16, fontWeight: 600, margin: '14px 0 8px' }}>{plan === 'cash' ? 'How will you pay the full amount?' : 'How will you pay each month?'}</div>
            {METHODS.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 10px', borderRadius: 10, border: method === m.id ? '2px solid #2f5d4c' : '1px solid #c9bd9f', background: method === m.id ? '#eaf2ec' : '#fff', marginBottom: 8, cursor: 'pointer', fontSize: 18 }}>
                <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} style={{ width: 24, height: 24 }} />
                <span><b>{m.label}</b><br /><span style={{ fontSize: 15, color: '#4a564f' }}>{m.hint}</span></span>
              </label>))}
            <div style={{ ...S.note, marginTop: 8 }}>
              {plan === 'cash' ? <div><b>You pay:</b> {peso(total)} by {methodInfo.label}</div> :
                <div><b>You pay:</b> {peso(monthly)} every month for {years} {years === 1 ? 'year' : 'years'} by {methodInfo.label}. Total {peso(total)}.</div>}
              <div style={{ marginTop: 4, fontSize: 15 }}>Our staff will tell you exactly how and where to pay when they call you.</div>
            </div>
          </div>

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Your details</div>
            <label style={S.label} htmlFor="ps-name">Full name</label>
            <input id="ps-name" style={S.input} value={form.name} onChange={(e) => setF('name', e.target.value)} autoComplete="name" />
            <label style={S.label} htmlFor="ps-addr">Complete address</label>
            <input id="ps-addr" style={S.input} value={form.address} onChange={(e) => setF('address', e.target.value)} autoComplete="street-address" />
            <label style={S.label} htmlFor="ps-mob">Mobile number</label>
            <input id="ps-mob" style={S.input} value={form.mobile} onChange={(e) => setF('mobile', e.target.value)} inputMode="tel" autoComplete="tel" />
            <label style={S.label} htmlFor="ps-mail">Email address</label>
            <input id="ps-mail" style={S.input} value={form.email} onChange={(e) => setF('email', e.target.value)} inputMode="email" autoComplete="email" />
            {/* honeypot: people never see or fill this */}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={(e) => setF('website', e.target.value)} style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
            <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 16, fontSize: 17, lineHeight: 1.4, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.consent} onChange={(e) => setF('consent', e.target.checked)} style={{ width: 26, height: 26, flexShrink: 0 }} />
              <span>I agree that Golden Harmonic staff may call me to check my name and address.</span>
            </label>
          </div>

          {error ? <div role="alert" style={{ ...S.note, background: '#fde8e6', borderColor: '#e0a39d', marginBottom: 14 }}>{error}</div> : null}
          <button type="submit" disabled={busy || !lot} style={{ ...S.big, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending...' : 'Send my details'}</button>
        </form>);
    }

    return (
      <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Presale plot reservation">
        <div style={S.sheet}>
          <div ref={topRef} style={S.bar}>
            {done ? null : <button type="button" onClick={back} style={{ background: 'transparent', border: '1.5px solid #fffaf0', color: '#fffaf0', borderRadius: 8, fontSize: 16, padding: '8px 14px', cursor: 'pointer' }}>← Back</button>}
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Presale · Blocks B, C, D</div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#fffaf0', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          {body}
        </div>
      </div>);
  }

  window.PresaleFlow = PresaleFlow;
  window.PresaleContext = React.createContext({ openPresale: () => {} });
  window.PRESALE_TYPE_IDS = TYPE_IDS;
})();
