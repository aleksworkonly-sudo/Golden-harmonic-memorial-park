/* Golden Harmonic Memorial Park — Blocks A, B, C, D presale flow.
   Loaded as its own babel script. Everything is wrapped in a function so it
   shares no top-level names with site.jsx; it exposes window.PresaleFlow and
   window.PresaleContext. Reservations go through /api/presale (a Firestore
   transaction on the server), so two buyers can never get the same plot. */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;

  /* ---- Payment details shown to buyers. Fill these in when you have them;
     an empty value simply shows the generic "our staff will call you" line. ---- */
  const PAY_INFO = {
    phone: '',    // e.g. '0917 123 4567'  (shown on the "Need help? Call us" button)
    office: '',   // e.g. 'Golden Harmonic office, Poblacion, Taytay, Palawan'
    hours: '',    // e.g. 'Monday to Saturday, 8:00 AM to 5:00 PM'
    gcash: '',    // e.g. 'Juan Dela Cruz · 09XX XXX XXXX'
    bank: '',     // e.g. 'BPI · Golden Harmonic Memorial Park · 0000-0000-00'
    cheque: ''    // e.g. 'Golden Harmonic Memorial Park'
  };


  /* ---- Site plan: where the blocks sit on the aerial picture (percent of the picture) ---- */
  const MAP_SRC = '/site_plan.jpg';
  const DIM = [
    'left:26.38%;top:30.22%;width:20.08%;height:10.60%;clip-path:polygon(4.5% 0%,100% 0%,97% 100%,0% 100%)',
    'left:5.70%;top:28.63%;width:20.98%;height:10.07%;clip-path:polygon(0% 0%,100% 0%,82.9% 100%,1.4% 86.3%)',
    'left:14.09%;top:21.21%;width:18.29%;height:6.57%;clip-path:polygon(0% 0%,100% 0%,82% 100%,0% 100%)',
    'left:19.78%;top:16.12%;width:15.59%;height:4.56%;clip-path:polygon(5.8% 0%,100% 0%,88.5% 100%,0% 100%)'
  ];
  const GEO = {
    A: 'left:70.74%;top:18.88%;width:13.19%;height:5.73%;clip-path:polygon(0% 0%,97.7% 0%,100% 100%,0% 100%)',
    B: 'left:66.85%;top:25.66%;width:23.38%;height:7.21%;clip-path:polygon(0% 0%,85.9% 0%,100% 100%,2.6% 100%)',
    C: 'left:68.94%;top:33.51%;width:23.08%;height:10.50%;clip-path:polygon(0% 0%,96.1% 0%,100% 100%,2.6% 100%)',
    D: 'left:71.34%;top:44.75%;width:20.08%;height:15.69%;clip-path:polygon(0% 0%,100% 5.4%,92.5% 79.7%,62.7% 100%,17.9% 93.2%)'
  };
  const TAGPOS = { A: 'left:71.3%;top:19%', B: 'left:67.5%;top:25.8%', C: 'left:69.6%;top:33.7%', D: 'left:72%;top:44.9%' };
  const ZOOM = { A: { cx: 77.3, cy: 21.7, s: 3.2 }, B: { cx: 78.5, cy: 29.3, s: 2.6 }, C: { cx: 80.5, cy: 38.8, s: 2.4 }, D: { cx: 81.4, cy: 52.6, s: 2.1 } };
  const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function cssObj(str) {
    const o = {};
    str.split(';').forEach((p) => {
      const i = p.indexOf(':');
      if (i < 1) return;
      const k = p.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      o[k] = p.slice(i + 1).trim();
    });
    return o;
  }

  const BLOCKS = ['A', 'B', 'C', 'D'];
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
    sheet: { maxWidth: 1280, margin: '0 auto', minHeight: '100%', background: 'var(--bg, #f6f1e8)', padding: '0 0 40px' },
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        {names.map((n, i) => {
          const k = i + 1, cur = k === step, done = k < step;
          return (
            <div key={n} style={{
              display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 18px 0 8px', borderRadius: 24, fontSize: 19, fontWeight: 700,
              background: cur ? '#0f2a21' : done ? '#e2efdf' : '#fff', color: cur ? '#f6e7b4' : done ? '#174d2f' : '#44534c',
              border: '2px solid ' + (cur ? '#0f2a21' : done ? '#2f7d4f' : '#c9c2ae')
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 16, fontSize: 18, fontWeight: 800,
                background: cur ? '#f6e7b4' : done ? '#2f7d4f' : '#e9e4d4', color: cur ? '#0f2a21' : done ? '#fff' : '#44534c' }}>{k}</span>
              <span>{n}</span>
            </div>);
        })}
      </div>);
  }

  /* ---------- steps 1 and 2: the aerial site plan, with zoom ---------- */
  function SitePlan({ block, setBlock, freeCounts, priceOf, descOf, onChooseType, phone }) {
    const isBlock = !!block;
    let sc = 1, tx = 0, ty = 0;
    if (isBlock) {
      const c = ZOOM[block];
      sc = c.s;
      tx = clampN(50 - sc * c.cx, 100 * (1 - sc), 0);
      ty = clampN(50 - sc * c.cy, 100 * (1 - sc), 0);
    }
    const fc = isBlock ? freeCounts(block) : { 'regular': TYPE_TOTALS['regular'], 'premium': TYPE_TOTALS['premium'], 'corner-premium': TYPE_TOTALS['corner-premium'] };
    return (
      <div style={{ ...S.wrap, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1, fontWeight: 800, color: '#0f2a21' }}>Choose your plot</h1>
            <div style={{ fontSize: 20, lineHeight: 1.5, color: '#2f3f38', maxWidth: 640, marginTop: 8 }}>Blocks A, B, C and D are now open for sale. We will guide you step by step.</div>
          </div>
          {phone ? (
            <a href={'tel:' + phone.replace(/[^0-9+]/g, '')} style={{ display: 'flex', flexDirection: 'column', minHeight: 64, padding: '10px 22px', border: '2px solid #0f2a21', borderRadius: 12, background: '#fff', textDecoration: 'none', color: '#0f2a21' }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Need help? Call us</span>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{phone}</span>
            </a>) : null}
        </div>

        <Steps step={isBlock ? 2 : 1} />

        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.35, background: '#fff3c9', border: '2px solid #d9a62e', borderRadius: 12, padding: '16px 20px', color: '#3b2a05' }}>
          {isBlock ? 'Step 2 of 3: Choose the type of plot you want, below the map.' : 'Step 1 of 3: Touch a gold block on the map, or a button on the right.'}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#0f2a21' }}>
              <div style={{ position: 'relative', transformOrigin: '0 0', transform: 'translate(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%) scale(' + sc + ')', transition: 'transform 0.7s ease' }}>
                <img src={MAP_SRC} alt="Aerial site development plan of Golden Harmonic Memorial Park" style={{ display: 'block', width: '100%', height: 'auto' }} />
                {DIM.map((d, i) => <div key={i} style={{ position: 'absolute', background: 'rgba(12,26,21,0.62)', ...cssObj(d) }}></div>)}
                {BLOCKS.map((id) => (
                  <button key={id} type="button" aria-label={'Block ' + id + ', open for sale'} aria-pressed={id === block} onClick={() => setBlock(id)}
                    style={{ position: 'absolute', border: 0, padding: 0, margin: 0, cursor: 'pointer', background: 'rgba(232,184,56,' + (id === block ? '0.30' : '0.40') + ')', ...cssObj(GEO[id]) }}></button>))}
                {BLOCKS.map((id) => (
                  <div key={'t' + id} style={{ position: 'absolute', pointerEvents: 'none', transformOrigin: '0 0', transform: 'scale(' + (1 / sc).toFixed(3) + ')', transition: 'transform 0.7s ease', fontSize: 17, fontWeight: 800, color: '#0f2a21', background: '#f4cf6a', padding: '4px 10px', borderRadius: 5, ...cssObj(TAGPOS[id]) }}>Block {id}</div>))}
              </div>
            </div>
            {!isBlock ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 18, color: '#2f3f38' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 5, background: '#d9a62e' }}></span>Open for sale now</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 5, background: '#2f3b36' }}></span>Coming soon</div>
              </div>) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
              <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.2, fontWeight: 800, color: '#0f2a21' }}>{isBlock ? 'Block ' + block + ': choose your plot type' : 'Plot types in every block'}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
                {TYPE_IDS.map((id) => (
                  <div key={id} style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, padding: 18, borderRadius: 12, border: isBlock ? '2px solid #0f2a21' : '2px solid #c9c2ae', background: isBlock ? '#fbf9f3' : '#fff' }}>
                    <img src={TYPES[id].photo} alt={'Photo of a ' + TYPES[id].short + ' plot'} style={{ width: '100%', aspectRatio: '2.1 / 1', objectFit: 'cover', borderRadius: 8 }} />
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#0f2a21' }}>{TYPES[id].short}</div>
                    <div style={{ fontSize: 19, lineHeight: 1.45, color: '#2f3f38' }}>{descOf(id)}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#0f2a21' }}>{peso(priceOf(id))}</span>
                      <span style={{ fontSize: 17, color: '#44534c' }}>Spot cash price. Monthly plans available.</span>
                      <span style={{ fontSize: 18, color: '#44534c' }}>{isBlock ? fc[id].toLocaleString('en-PH') + ' plots available in Block ' + block : fc[id].toLocaleString('en-PH') + ' plots in each block'}</span>
                    </div>
                    {isBlock ? (
                      <button type="button" disabled={fc[id] < 1} onClick={() => onChooseType(id)}
                        style={{ boxSizing: 'border-box', minHeight: 64, marginTop: 'auto', borderRadius: 12, border: 'none', background: '#0f2a21', color: '#f6e7b4', fontSize: 22, fontWeight: 800, cursor: 'pointer', opacity: fc[id] < 1 ? 0.5 : 1 }}>
                        {fc[id] < 1 ? 'Sold out' : 'Choose ' + TYPES[id].short}
                      </button>) : null}
                  </div>))}
              </div>
              {!isBlock ? <div style={{ fontSize: 19, lineHeight: 1.5, color: '#16251f', background: '#f6f0dc', borderRadius: 12, padding: '14px 18px' }}>Every block has all three plot types. Touch a block on the map first, then choose your plot type here.</div> : null}
            </div>
          </div>

          <aside style={{ flex: '1 1 360px', minWidth: 0, boxSizing: 'border-box', background: '#fff', borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 22, border: '2px solid #e3dccb' }}>
            {!isBlock ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <h2 style={{ margin: 0, fontSize: 34, lineHeight: 1.15, fontWeight: 800, color: '#0f2a21' }}>Which block would you like?</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {BLOCKS.map((id) => (
                    <button key={id} type="button" onClick={() => setBlock(id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minHeight: 84, padding: '14px 20px', borderRadius: 12, border: '2px solid #0f2a21', background: '#fbf9f3', textAlign: 'left', cursor: 'pointer', color: '#0f2a21' }}>
                      <span style={{ fontSize: 30, fontWeight: 800 }}>Block {id}</span>
                      <span style={{ fontSize: 18, color: '#2f3f38' }}>3 plot types to choose from</span>
                    </button>))}
                </div>
              </div>) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <button type="button" onClick={() => setBlock('')} style={{ minHeight: 56, padding: '0 20px', borderRadius: 12, border: '2px solid #0f2a21', background: '#fff', color: '#0f2a21', fontSize: 20, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>← Go back to the full map</button>
                <h2 style={{ margin: 0, fontSize: 34, lineHeight: 1.15, fontWeight: 800, color: '#0f2a21' }}>Block {block}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2f3f38' }}>Where this is in the park</div>
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#0f2a21' }}>
                    <img src={MAP_SRC} alt="Park map with the chosen block marked" style={{ display: 'block', width: '100%', height: 'auto' }} />
                    <div style={{ position: 'absolute', boxSizing: 'border-box', left: (-tx / sc).toFixed(2) + '%', top: (-ty / sc).toFixed(2) + '%', width: (100 / sc).toFixed(2) + '%', height: (100 / sc).toFixed(2) + '%', border: '3px solid #f4cf6a', background: 'rgba(244,207,106,0.22)', borderRadius: 3 }}></div>
                  </div>
                </div>
                <div style={{ fontSize: 19, lineHeight: 1.5, color: '#16251f', background: '#f6f0dc', borderRadius: 12, padding: '16px 18px' }}>You will choose your exact plot on the next screen. We serve buyers in the order they apply.</div>
              </div>)}
          </aside>
        </div>
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

    const descOf = (id) => {
      const t = (tiers || []).find((x) => x.id === id);
      const raw = t && t.desc ? t.desc : '';
      return raw.replace(/\s*Priced per crypt\/share\.?\s*$/i, '') || TYPES[id].short + ' plot';
    };

    const [step, setStep] = useState(1); // 1 = site plan (block and type), 3 = details
    const [block, setBlock] = useState('');
    const [typeId, setTypeId] = useState(startType && TYPES[startType] ? startType : '');
    const [takenByBlock, setTakenByBlock] = useState({});
    const [loadErr, setLoadErr] = useState(false);
    const [lot, setLot] = useState(0);
    const [notice, setNotice] = useState('');
    const [plan, setPlan] = useState('cash');
    const [years, setYears] = useState(3);
    const [method, setMethod] = useState('cash');
    const [form, setForm] = useState(() => {
      const base = { name: '', address: '', mobile: '', email: '', consent: false, website: '' };
      try { return { ...base, ...JSON.parse(sessionStorage.getItem('ghmp-presale-form') || '{}') }; } catch (e) { return base; }
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(null);
    const topRef = useRef(null);
    // Keep what the buyer typed, so an accidental close does not lose it.
    useEffect(() => {
      try {
        if (done) sessionStorage.removeItem('ghmp-presale-form');
        else sessionStorage.setItem('ghmp-presale-form', JSON.stringify({ name: form.name, address: form.address, mobile: form.mobile, email: form.email }));
      } catch (e) {}
    }, [form.name, form.address, form.mobile, form.email, done]);

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

    const chooseType = (id) => {
      setTypeId(id);
      const first = nearestFree(START_POINT[id], id, taken);
      setLot(first);
      setNotice('');
      pushNav();
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

    /* ---- Browser / phone Back button: step back inside the presale instead of leaving it ---- */
    const closing = useRef(false);
    const depth = useRef(0);          // history entries this flow has added
    const live = useRef({});          // latest state for the popstate handler
    live.current = { step, block, done, onClose };
    const pushNav = () => { try { window.history.pushState({ presale: depth.current + 1 }, ''); depth.current += 1; } catch (e) {} };

    useEffect(() => {
      pushNav(); // entry for the first screen, so the first Back press stays inside the presale
      const onPop = () => {
        if (closing.current) return;
        depth.current = Math.max(0, depth.current - 1);
        const c = live.current;
        if (c.done) { closing.current = true; const n = depth.current; depth.current = 0; c.onClose(); if (n > 0) { try { window.history.go(-n); } catch (e) {} } }
        else if (c.step === 3) { setStep(1); }
        else if (c.block) { setBlock(''); }
        else { c.onClose(); }
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Each forward move adds a history entry; Back then undoes exactly one move.
    const goBlock = (id) => { if (id && !block) pushNav(); setBlock(id); };
    const back = () => { try { window.history.back(); } catch (e) { onClose(); } };
    const closeAll = () => {
      const n = depth.current;
      depth.current = 0;
      closing.current = true; // ignore the popstate our own history.go() fires
      onClose();
      if (n > 0) { try { window.history.go(-n); } catch (e) {} }
    };

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
            <button type="button" style={{ ...S.big, marginTop: 18 }} onClick={closeAll}>Close</button>
          </div>
        </div>);
    } else if (step !== 3) {
      body = <SitePlan block={block} setBlock={(id) => (id ? goBlock(id) : back())} freeCounts={freeCounts} priceOf={priceOf} descOf={descOf} onChooseType={chooseType} phone={PAY_INFO.phone} />;
    } else {
      const t = TYPES[typeId];
      body = (
        <form onSubmit={submit} style={{ ...S.wrap, maxWidth: 980, margin: '0 auto' }}>
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
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Presale · Blocks A, B, C, D</div>
            <button type="button" onClick={closeAll} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#fffaf0', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          {body}
        </div>
      </div>);
  }

  window.PresaleFlow = PresaleFlow;
  window.PresaleContext = React.createContext({ openPresale: () => {} });
  window.PRESALE_TYPE_IDS = TYPE_IDS;
})();
