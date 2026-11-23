/* Golden Harmonic Memorial Park — presale flow (the real site plan, 3,696 plots).
   Loaded as its own babel script. Everything is wrapped in a function so it
   shares no top-level names with site.jsx; it exposes window.PresaleFlow and
   window.PresaleContext. Reservations go through /api/presale (a Firestore
   transaction on the server), so two buyers can never get the same plot. */
(function () {
  const { useState, useEffect, useMemo, useRef, useCallback } = React;

  /* ---- Payment details shown to buyers. Fill these in when you have them;
     an empty value simply shows the generic "our staff will call you" line. ---- */
  const PAY_INFO = {
    phone: '0998 324 9859',    // shown on the "Need help? Call us" button
    email: 'goldenharmonicpalawan@gmail.com',
    office: 'Valdez Building, Purok 4, Brgy. Poblacion, Taytay, Palawan',
    hours: '',    // e.g. 'Monday to Saturday, 8:00 AM to 5:00 PM'
    gcash: '',    // e.g. 'Juan Dela Cruz · 09XX XXX XXXX'
    bank: '',     // e.g. 'BPI · Golden Harmonic Memorial Park · 0000-0000-00'
    cheque: ''    // e.g. 'Golden Harmonic Memorial Park'
  };


  /* ---- The official site plan: 3,696 plots (data in /presale-plan.json), all saved under block "P" ---- */
  const BLOCK = 'P';
  /* Pre-selling price: regular price minus this, for SPOT CASH only. Installments use the regular price
     (price list "with 3 to 10 year payment plans"). Same numbers as lib/presale-plan.js. */
  const SPOT_DISCOUNT = { 'regular': 8000, 'premium': 8000, 'corner-premium': 8000, 'garden-regular': 8000, 'garden-premium': 8000, 'garden-corner': 8000, 'mausoleum': 400000, 'valor': 8000, 'premium-valor': 8000, 'corner-premium-valor': 8000 };
  const discOf = (typeId, plan) => (plan === 'cash' ? SPOT_DISCOUNT[typeId] || 0 : 0);
  const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* One letter per plot in presale-plan.json -> plot type. `fallback` is only used when the
     website's product list has no price; types without one are "not open yet". */
  const TYPES = {
    'regular': { letter: 'r', name: 'Regular Plot', short: 'Regular', fallback: 30000, photo: '/regular_plot.jpg', color: '#4d7dc4' },
    'valor': { letter: 'v', name: 'Valor Plot', short: 'Valor', fallback: 40000, photo: '/valor_plot.jpg', color: '#9670c4' },
    'garden-regular': { letter: 'g', name: 'Garden Plot', short: 'Garden', fallback: 37500, photo: '/regular_garden_plot.jpg', color: '#43a670' },
    'family-vault': { letter: 'f', name: 'Family Vault', short: 'Family Vault', fallback: 105000, photo: '/family_vault.jpg', color: '#3d9ca3' },
    'premium': { letter: 'p', name: 'Premium Plot', short: 'Premium', fallback: 42500, photo: '/premium_plot.jpg', color: '#e0b31f' },
    'premium-valor': { letter: 'q', name: 'Premium Valor Plot', short: 'Premium Valor', fallback: 40000, photo: '/premium_valor_plot.jpg', color: '#e0b31f' },
    'garden-premium': { letter: 'h', name: 'Premium Garden Plot', short: 'Premium Garden', fallback: 47500, photo: '/premium_garden_plot.jpg', color: '#e0b31f' },
    'corner-premium': { letter: 'c', name: 'Corner Premium Plot', short: 'Corner Premium', fallback: 47500, photo: '/corner_premium_plot.jpg', color: '#d4591c' },
    'corner-premium-valor': { letter: 'd', name: 'Corner Premium Valor Plot', short: 'Corner Premium Valor', fallback: 40000, photo: '/corner_premium_valor_plot.jpg', color: '#d4591c' },
    'garden-corner': { letter: 'e', name: 'Corner Premium Garden Plot', short: 'Corner Premium Garden', fallback: 57500, photo: '/corner_prime_garden_plot.jpg', color: '#d4591c' },
    'mausoleum': { letter: 'm', name: 'Mausoleum', short: 'Mausoleum', fallback: 2200000, photo: '/mausoleum_serenity.jpg', color: '#efe7d2' }
  };
  const TYPE_IDS = ['regular', 'valor', 'garden-regular', 'family-vault', 'premium', 'premium-valor', 'garden-premium', 'corner-premium', 'corner-premium-valor', 'garden-corner', 'mausoleum'];
  const BY_LETTER = {};
  TYPE_IDS.forEach((id) => { BY_LETTER[TYPES[id].letter] = id; });
  // Priced too high for the standard down payment: arranged with staff until the owners decide the terms.
  const STAFF_ONLY = ['family-vault', 'mausoleum'];
  // The website's old "Reserve" buttons only cover these three; the map covers every type.
  const SITE_TYPE_IDS = ['regular', 'premium', 'corner-premium'];

  // 3 to 10 years: +20% at 3 years, then +5% for every extra year.
  const TERMS = [3, 4, 5, 6, 7, 8, 9, 10].map((y) => ({ years: y, surcharge: Math.round((0.20 + 0.05 * (y - 3)) * 100) / 100, best: y === 10 }));

  const METHODS = [
    { id: 'paymongo', label: 'Pay Online with PayMongo', hint: 'Verify your reservation email, then review available online deposit options.' },
    { id: 'cash', label: 'Cash', hint: 'Pay in person at our office.' },
    { id: 'gcash', label: 'GCash', hint: 'Hold your plots, scan the verified QR, then submit proof for admin review.' },
    { id: 'maya', label: 'Maya', hint: 'Available when a verified Maya receiving QR is configured.' },
    { id: 'bank', label: 'Bank transfer', hint: 'Deposit or transfer to our bank account.' },
    { id: 'cheque', label: 'Cheque', hint: 'Bring or send a cheque to our office.' }
  ];

  // "P-0123" is how the office sees a plot; buyers just see "Plot 123".
  function code(block, lot) { return block === BLOCK ? 'Plot ' + lot : block + '-' + String(lot).padStart(4, '0'); }
  function nicePlot(plotCode) { const m = /^P-0*(\d+)$/.exec(String(plotCode || '')); return m ? 'Plot ' + m[1] : plotCode; }
  function peso(n) { return '₱' + Number(n).toLocaleString('en-PH',{minimumFractionDigits:Number.isInteger(Number(n))?0:2,maximumFractionDigits:2}); }
  /* Mall-style price: red price, old price crossed out, red "-27%" tag. */
  const RED = '#d0342c';
  function offPct(was, now) { return was > now && was > 0 ? Math.round(((was - now) / was) * 100) : 0; }
  function OffTag({ was, now, size }) {
    const p = offPct(was, now);
    if (!p) return null;
    return <span style={{ display: 'inline-block', fontSize: size || 15, fontWeight: 800, color: RED, background: '#fde8e6', border: '1px solid #f3b9b3', borderRadius: 5, padding: '1px 7px', whiteSpace: 'nowrap' }}>-{p}%</span>;
  }
  function Was({ n, size }) { return <span style={{ fontSize: size || 17, color: '#8a8478', textDecoration: 'line-through' }}>{peso(n)}</span>; }

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
    const names = ['Choose your plot', 'Your details'];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        {names.map((n, i) => {
          const k = i + 1, cur = k === (step === 3 ? 2 : 1), done = k < (step === 3 ? 2 : 1);
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
  // Slow, gentle scroll (about 1.4 s) inside the presale screen, so buyers can follow where the page goes.
  function slowScroll(el, offset, ms, toTop) {
    const box = el && el.closest('[role="dialog"]');
    if (!box) { try { el && el.scrollIntoView(); } catch (e) {} return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = box.scrollTop;
    const to = toTop ? 0 : Math.max(0, from + el.getBoundingClientRect().top - box.getBoundingClientRect().top - (offset || 0));
    if (reduce || Math.abs(to - from) < 2) { box.scrollTop = to; return; }
    const t0 = performance.now(), dur = ms || 1400;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      box.scrollTop = from + (to - from) * ease(k);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- the plan map: every plot of the real site plan, tap to choose ---------- */
  function PlanMap({ plan, taken, held, marked, selected, filter, openIds, onPick, onNotice, focusLot }) {
    const wrapRef = useRef(null);
    const cvRef = useRef(null);
    const view = useRef({ s: 0.05, ox: 0, oy: 0, w: 600, h: 700 });
    const [, force] = useState(0);
    const raf = useRef(0);
    const live = useRef({});
    live.current = { taken, held, marked, selected, filter, openIds, onPick, onNotice };

    // Precompute bounding boxes, centres and a coarse grid so a tap finds its plot quickly.
    const idx = useMemo(() => {
      const n = plan.g.length, cx = new Float32Array(n), cy = new Float32Array(n), bw = new Float32Array(n), bh = new Float32Array(n);
      const CELL = 200, grid = new Map();
      for (let i = 0; i < n; i++) {
        const g = plan.g[i];
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let k = 0; k < g.length; k += 2) { x0 = Math.min(x0, g[k]); x1 = Math.max(x1, g[k]); y0 = Math.min(y0, g[k + 1]); y1 = Math.max(y1, g[k + 1]); }
        cx[i] = (x0 + x1) / 2; cy[i] = (y0 + y1) / 2; bw[i] = x1 - x0; bh[i] = y1 - y0;
        for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
          const key = gx * 100000 + gy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
        }
      }
      return { cx, cy, bw, bh, grid, CELL };
    }, [plan]);

    const draw = useCallback(() => {
      raf.current = 0;
      const cv = cvRef.current; if (!cv) return;
      const v = view.current, dpr = window.devicePixelRatio || 1;
      const W = Math.round(v.w * dpr), H = Math.round(v.h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#f3efe4'; c.fillRect(0, 0, v.w, v.h);
      c.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
      const { taken: tk, held: hd, marked: mk, selected: sel, filter: fl, openIds: open } = live.current;
      const x0 = -v.ox / v.s, y0 = -v.oy / v.s, x1 = (v.w - v.ox) / v.s, y1 = (v.h - v.oy) / v.s;
      const px = (u) => u * v.s;
      const detail = px(60) > 5;           // plots are big enough to outline
      c.lineJoin = 'round';
      c.lineWidth = 1 / v.s * 0.8;
      const t = plan.t;
      const later = [];
      for (let i = 0; i < t.length; i++) {
        if (idx.cx[i] + idx.bw[i] < x0 || idx.cx[i] - idx.bw[i] > x1 || idx.cy[i] + idx.bh[i] < y0 || idx.cy[i] - idx.bh[i] > y1) continue;
        const id = BY_LETTER[t[i]], lot = i + 1, g = plan.g[i], isTaken = tk.has(lot), isSel = lot === sel || (mk && mk.has(lot));
        const match = !fl || fl === id;
        let fill = TYPES[id].color, alpha = 1;
        if (isTaken) { fill = '#e9a3a3'; alpha = match ? 1 : 0.35; }
        else if (!open[id] || (hd && hd.has(lot))) alpha = match ? 0.45 : 0.15;
        else if (!match) alpha = 0.18;
        c.beginPath();
        c.moveTo(g[0], g[1]);
        for (let k = 2; k < g.length; k += 2) c.lineTo(g[k], g[k + 1]);
        c.closePath();
        c.globalAlpha = alpha; c.fillStyle = isSel ? '#f5b800' : fill; c.fill();
        if (detail || id === 'mausoleum') { c.globalAlpha = Math.min(1, alpha + 0.3); c.strokeStyle = id === 'mausoleum' ? '#a08a55' : 'rgba(40,40,40,.55)'; c.stroke(); }
        c.globalAlpha = 1;
        if (isSel && !mk) later.push(i);
        if (isTaken && px(Math.min(idx.bw[i], idx.bh[i])) > 7) {
          c.globalAlpha = match ? 1 : 0.35; c.strokeStyle = '#a32222'; c.lineWidth = 1.6 / v.s;
          c.beginPath(); c.moveTo(g[0], g[1]);
          const m = Math.floor(g.length / 4) * 2; c.lineTo(g[m], g[m + 1]);
          c.moveTo(g[2], g[3]); c.lineTo(g[g.length - 2], g[g.length - 1]); c.stroke();
          c.lineWidth = 1 / v.s * 0.8; c.globalAlpha = 1;
        }
      }
      // numbers once plots are large enough to read
      const small = Math.min(px(55), 60);
      if (px(75) > 17) {
        const fs = clampN(px(40), 11, 20) / v.s;
        c.font = '700 ' + fs + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 0; i < t.length; i++) {
          if (idx.cx[i] < x0 || idx.cx[i] > x1 || idx.cy[i] < y0 || idx.cy[i] > y1) continue;
          const id = BY_LETTER[t[i]]; if (fl && fl !== id) continue;
          if (px(Math.min(idx.bw[i], idx.bh[i])) < 11) continue;
          c.fillStyle = id === 'mausoleum' || id === 'premium' || id === 'premium-valor' || id === 'garden-premium' ? '#2b2200' : '#fff';
          if (i + 1 === sel) c.fillStyle = '#2b1d00';
          c.fillText(String(i + 1), idx.cx[i], idx.cy[i]);
        }
      }
      for (const i of later) {                 // selected plot: bold outline on top
        const g = plan.g[i];
        c.beginPath(); c.moveTo(g[0], g[1]); for (let k = 2; k < g.length; k += 2) c.lineTo(g[k], g[k + 1]); c.closePath();
        c.strokeStyle = '#3b2a00'; c.lineWidth = Math.max(2.5 / v.s, 10); c.stroke();
        c.strokeStyle = '#f5b800'; c.lineWidth = Math.max(1 / v.s, 4); c.stroke();
      }
    }, [plan, idx]);
    const redraw = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);
    useEffect(() => { redraw(); }, [taken, held, marked, selected, filter, openIds, redraw]);

    const fit = useCallback(() => {
      const v = view.current;
      v.s = Math.min(v.w / plan.w, v.h / plan.h) * 0.98;
      v.ox = (v.w - plan.w * v.s) / 2; v.oy = (v.h - plan.h * v.s) / 2; redraw();
    }, [plan, redraw]);
    const MIN_S = 0.0, MAX_S = 1.6;
    const zoomAt = useCallback((f, sx, sy) => {
      const v = view.current; const ns = clampN(v.s * f, v.s0 || 0.01, MAX_S);
      const wx = (sx - v.ox) / v.s, wy = (sy - v.oy) / v.s;
      v.s = ns; v.ox = sx - wx * ns; v.oy = sy - wy * ns; redraw();
    }, [redraw]);

    useEffect(() => {
      const el = wrapRef.current; if (!el) return;
      const measure = () => {
        const v = view.current, first = !v.ready;
        v.w = el.clientWidth; v.h = el.clientHeight;
        v.s0 = Math.min(v.w / plan.w, v.h / plan.h) * 0.9;
        if (first) { v.ready = true; fit(); } else redraw();
      };
      measure();
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      if (ro) ro.observe(el); else window.addEventListener('resize', measure);
      return () => { if (ro) ro.disconnect(); else window.removeEventListener('resize', measure); };
    }, [plan, fit, redraw]);

    const hit = (sx, sy) => {
      const v = view.current, wx = (sx - v.ox) / v.s, wy = (sy - v.oy) / v.s, C = idx.CELL;
      const tol = 10 / v.s;                       // a fingertip, in plan units
      let best = -1, bd = 1e18;
      for (let gx = Math.floor((wx - tol) / C); gx <= Math.floor((wx + tol) / C); gx++) for (let gy = Math.floor((wy - tol) / C); gy <= Math.floor((wy + tol) / C); gy++) {
        const list = idx.grid.get(gx * 100000 + gy); if (!list) continue;
        for (const i of list) {
          const dx = Math.max(Math.abs(wx - idx.cx[i]) - idx.bw[i] / 2, 0), dy = Math.max(Math.abs(wy - idx.cy[i]) - idx.bh[i] / 2, 0);
          const d = dx * dx + dy * dy; if (d > tol * tol) continue;
          const cd = (wx - idx.cx[i]) ** 2 + (wy - idx.cy[i]) ** 2;
          const score = d * 1e6 + cd;
          if (score < bd) { bd = score; best = i; }
        }
      }
      return best + 1;
    };

    // pointer handling: drag to move, two fingers to zoom, a quick tap to choose
    const ptrs = useRef(new Map());
    const gest = useRef({ moved: 0, pinch: 0 });
    const onDown = (e) => { e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); gest.current = { moved: 0, pinch: 0 }; };
    const onMove = (e) => {
      const p = ptrs.current.get(e.pointerId); if (!p) return;
      const rect = cvRef.current.getBoundingClientRect(), v = view.current;
      if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const [a2, b2] = [...ptrs.current.values()];
        const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (d0 > 0) zoomAt(d1 / d0, (a2.x + b2.x) / 2 - rect.left, (a2.y + b2.y) / 2 - rect.top);
        gest.current.moved = 99; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      gest.current.moved += Math.abs(dx) + Math.abs(dy);
      if (gest.current.moved > 8) { v.ox += dx; v.oy += dy; redraw(); }
    };
    const onUp = (e) => {
      const wasTap = ptrs.current.size === 1 && gest.current.moved <= 8;
      ptrs.current.delete(e.pointerId);
      if (!wasTap) return;
      const rect = cvRef.current.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top, v = view.current;
      const lot = hit(sx, sy);
      if (!lot) return;
      const i = lot - 1;
      if (Math.min(idx.bw[i], idx.bh[i]) * v.s < 9) { zoomAt(3.2, sx, sy); live.current.onNotice('Come a little closer, then touch your plot.'); return; } // too small to tap safely: zoom in first
      live.current.onPick(lot);
    };
    const onWheel = (e) => { e.preventDefault(); const r = cvRef.current.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); };
    useEffect(() => { const cv = cvRef.current; if (!cv) return; cv.addEventListener('wheel', onWheel, { passive: false }); return () => cv.removeEventListener('wheel', onWheel); }, [zoomAt]);

    // Jump to a plot (typed number or chosen plot): centre it and zoom in.
    useEffect(() => {
      if (!focusLot || !focusLot.lot) return;
      const v = view.current, i = focusLot.lot - 1; if (!idx.cx[i]) return;
      v.s = Math.max(v.s, 0.55); v.ox = v.w / 2 - idx.cx[i] * v.s; v.oy = v.h / 2 - idx.cy[i] * v.s; redraw();
    }, [focusLot, idx, redraw]);

    const btn = { width: 56, height: 56, borderRadius: 12, border: '2px solid #0f2a21', background: '#fff', color: '#0f2a21', fontSize: 30, fontWeight: 800, cursor: 'pointer', lineHeight: 1, boxShadow: '0 2px 6px rgba(0,0,0,.2)' };
    return (
      <div ref={wrapRef} style={{ position: 'relative', width: '100%', height: 'min(78vh, 820px)', minHeight: 420, borderRadius: 14, overflow: 'hidden', border: '2px solid #c9c2ae', background: '#f3efe4' }}>
        <canvas ref={cvRef} role="img" aria-label="Plan of Golden Harmonic Memorial Park. Touch a plot to choose it. Use the plus and minus buttons to zoom."
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => ptrs.current.delete(e.pointerId)}
          style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }} />
        <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" aria-label="Zoom in" style={btn} onClick={() => zoomAt(1.7, view.current.w / 2, view.current.h / 2)}>+</button>
          <button type="button" aria-label="Zoom out" style={btn} onClick={() => zoomAt(1 / 1.7, view.current.w / 2, view.current.h / 2)}>−</button>
        </div>
        <button type="button" onClick={fit} style={{ position: 'absolute', left: 12, top: 12, minHeight: 48, padding: '0 16px', borderRadius: 12, border: '2px solid #0f2a21', background: '#fff', color: '#0f2a21', fontSize: 17, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }}>Show the whole park</button>
      </div>);
  }

  function SitePlan({ plan, planErr, taken, held, lot, setLot, filter, setFilter, priceOf, descOf, openIds, counts, onContinue, phone, wrapStyle }) {
    const [notice, setNotice] = useState('');
    const [find, setFind] = useState('');
    const [focus, setFocus] = useState(null);
    const sel = lot || 0;
    const selId = sel && plan ? BY_LETTER[plan.t[sel - 1]] : '';
    const pick = (n) => {
      const id = BY_LETTER[plan.t[n - 1]];
      if (taken.has(n)) { setNotice('Plot ' + n + ' is already taken. Please touch another plot.'); return; }
      if (held.has(n)) { setNotice(TYPES[id].short + ' plot ' + n + ' is not open for sale yet. Please touch another plot.'); return; }
      if (STAFF_ONLY.includes(id)) { setNotice(TYPES[id].short + ' plots have their own down payment. Please ask our staff for assistance' + (phone ? ': call ' + phone : '') + (PAY_INFO.email ? ' or email ' + PAY_INFO.email : '') + '.'); return; }
      if (!openIds[id]) { setNotice(TYPES[id].short + ' plots are not open for online reservation yet. Please call our office' + (phone ? ' at ' + phone : '') + '.'); return; }
      setNotice(''); setLot(n);
    };
    const goFind = (e) => {
      e.preventDefault();
      const n = parseInt(find, 10);
      if (!plan || !Number.isInteger(n) || n < 1 || n > plan.t.length) { setNotice('Please type a plot number from 1 to ' + (plan ? plan.t.length : 3696) + '.'); return; }
      pick(n); setFocus({ lot: n, k: Date.now() });
    };
    const disc = selId ? discOf(selId, 'cash') : 0;
    return (
      <div style={{ ...(wrapStyle || S.wrap), display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 44, lineHeight: 1.1, fontWeight: 800, color: '#0f2a21' }}>Choose your plot</h1>
            <div style={{ fontSize: 20, lineHeight: 1.5, color: '#2f3f38', maxWidth: 680, marginTop: 8 }}>This is the real plan of the park. Every square is one plot. We will guide you step by step.</div>
          </div>
          {phone ? (
            <a href={'tel:' + phone.replace(/[^0-9+]/g, '')} style={{ display: 'flex', flexDirection: 'column', minHeight: 64, padding: '10px 22px', border: '2px solid #0f2a21', borderRadius: 12, background: '#fff', textDecoration: 'none', color: '#0f2a21' }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Need help? Call us</span>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{phone}</span>
              {PAY_INFO.email ? <span style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{PAY_INFO.email}</span> : null}
            </a>) : null}
          <a href="https://www.google.com/maps?q=10.824991,119.513859" target="_blank" rel="noopener" style={{ display: 'block', fontSize: 17, fontWeight: 700, color: '#1f4a39', marginTop: 8 }}>Visit our office: Valdez Building, Purok 4, Brgy. Poblacion, Taytay, Palawan. Get directions</a>
        </div>

        <Steps step={1} />

        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.35, background: '#fff3c9', border: '2px solid #d9a62e', borderRadius: 12, padding: '16px 20px', color: '#3b2a05' }}>
          Step 1 of 2: Touch your plot on the map. Use the big <b>+</b> button to come closer. Red crossed plots are already taken.
        </div>
        {notice ? <div role="alert" style={{ ...S.note, fontSize: 18 }}>{notice}</div> : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 560px', minWidth: 0 }}>
            {plan ? <PlanMap plan={plan} taken={taken} held={held} selected={sel} filter={filter} openIds={openIds} onPick={pick} onNotice={setNotice} focusLot={focus} />
              : <div style={{ ...S.card, fontSize: 20, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{planErr ? 'We could not load the plan. Please check your internet and refresh this page.' : 'Loading the plan…'}</div>}
          </div>

          <aside style={{ flex: '1 1 340px', minWidth: 0, boxSizing: 'border-box', background: '#fff', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18, border: '2px solid #e3dccb' }}>
            <form onSubmit={goFind} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label htmlFor="ps-find" style={{ fontSize: 20, fontWeight: 800, color: '#0f2a21' }}>Know your plot number?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input id="ps-find" inputMode="numeric" placeholder="Example: 1250" value={find} onChange={(e) => setFind(e.target.value)} style={{ ...S.input, flex: 1, minWidth: 0 }} />
                <button type="submit" style={{ minHeight: 52, padding: '0 18px', borderRadius: 10, border: 'none', background: '#0f2a21', color: '#f6e7b4', fontSize: 18, fontWeight: 800, cursor: 'pointer' }}>Go</button>
              </div>
            </form>

            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f2a21', marginBottom: 6 }}>Plot types</div>
              <div style={{ fontSize: 16, color: '#44534c', marginBottom: 10 }}>Press a type to show only those plots on the map.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TYPE_IDS.map((id) => {
                  const on = filter === id, p = priceOf(id), d = discOf(id, 'cash');
                  return (
                    <button key={id} type="button" aria-pressed={on} onClick={() => setFilter(on ? '' : id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '8px 12px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', border: on ? '3px solid #0f2a21' : '1.5px solid #c9c2ae', background: on ? '#fbf3d6' : '#fbf9f3', color: '#0f2a21' }}>
                      <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: 6, background: TYPES[id].color, border: '2px solid ' + (id === 'mausoleum' ? '#a08a55' : 'rgba(0,0,0,.35)') }}></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{TYPES[id].short}</span>
                        <span style={{ display: 'block', fontSize: 15, color: '#44534c' }}>
                          {p > 0 ? <span>{d > 0 ? <b style={{ color: RED }}>{peso(p - d)}</b> : <b>{peso(p)}</b>}{d > 0 ? <span> <Was n={p} size={14} /></span> : null}</span> : 'Not open yet'}
                          {' · '}{(counts[id] || 0).toLocaleString('en-PH')} free
                        </span>
                      </span>
                    </button>);
                })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 15, marginTop: 12, color: '#2f3f38' }}>
                <span><i style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: '#e9a3a3', border: '1px solid rgba(0,0,0,.35)', verticalAlign: -4 }}></i> Taken</span>
                <span><i style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: '#f5b800', border: '2px solid #3b2a00', verticalAlign: -4 }}></i> Your pick</span>
                <span><i style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: '#4d7dc4', opacity: 0.45, verticalAlign: -4 }}></i> Faded = not open yet</span>
              </div>
            </div>
          </aside>
        </div>

        {/* the chosen plot, always visible at the bottom of the screen */}
        <div style={{ position: 'sticky', bottom: 0, zIndex: 3, margin: '0 -4px', padding: '14px 16px', background: '#fffdf6', border: '3px solid #0f2a21', borderRadius: 14, boxShadow: '0 -4px 14px rgba(0,0,0,.18)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          {sel ? (
            <>
              <img src={TYPES[selId].photo} alt="" style={{ width: 84, height: 62, objectFit: 'cover', objectPosition: 'center 68%', borderRadius: 8 }} />
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f2a21' }}>Plot {sel} · {TYPES[selId].name}</div>
                <div style={{ fontSize: 18, color: '#2f3f38' }}>
                  <b style={{ color: disc > 0 ? RED : '#0f2a21' }}>{peso(priceOf(selId) - disc)}</b> spot cash{disc > 0 ? <span> <Was n={priceOf(selId)} size={15} /> <OffTag was={priceOf(selId)} now={priceOf(selId) - disc} size={13} /></span> : null} · monthly plans available
                </div>
                <div style={{ fontSize: 16, color: '#44534c', marginTop: 2 }}>{descOf(selId)}</div>
              </div>
              <button type="button" onClick={onContinue} style={{ minHeight: 60, padding: '0 28px', borderRadius: 12, border: 'none', background: '#2f5d4c', color: '#fff', fontSize: 21, fontWeight: 800, cursor: 'pointer' }}>This is my plot. Next →</button>
            </>) : (
            <div style={{ fontSize: 21, fontWeight: 700, color: '#3b2a05' }}>No plot chosen yet. Touch a plot on the map.</div>)}
        </div>
      </div>);
  }

  /* ---------- the flow ---------- */
  function PresaleFlow({ tiers, startType, onClose, fullPage }) {
    const WRAP = fullPage ? { ...S.wrap, padding: '22px clamp(20px, 3vw, 56px)' } : S.wrap;
    const priceOf = (id) => {
      const t = (tiers || []).find((x) => x.id === id);
      return t && t.price > 0 ? Math.round(t.price) : TYPES[id].fallback;
    };

    // One plot holds two crypt spaces, but the price covers one crypt only. Family Vault: five spaces, one included.
    const cryptNote = (id) => id === 'mausoleum' ? '' :
      id === 'family-vault' ? 'Contains five (5) crypt spaces. Your purchase includes one (1) crypt; the other four may be separately owned.' :
      'Contains two (2) crypt spaces. Your purchase includes one (1) crypt; the other may be separately owned.';
    const descOf = (id) => {
      if (cryptNote(id)) return cryptNote(id);
      const t = (tiers || []).find((x) => x.id === id);
      const raw = t && t.desc ? t.desc : '';
      return raw.replace(/\s*Priced per crypt\/share\.?\s*$/i, '') || TYPES[id].short + ' plot';
    };

    const [step, setStep] = useState(1); // 1 = the plan map, 3 = details
    const block = BLOCK;
    const [filter, setFilter] = useState(startType && TYPES[startType] ? startType : '');
    const [plan0, setPlan0] = useState(null);   // the plan: { w, h, t, g }
    const [planErr, setPlanErr] = useState(false);
    const [takenList, setTakenList] = useState([]);
    const [heldList, setHeldList] = useState([]);   // Valor plots staff have not switched on for the presale
    const [loadErr, setLoadErr] = useState(false);
    const [lot, setLot] = useState(0);
    const [more, setMore] = useState([]); // plots already added: [{ block, lot, typeId }]
    const typeId = lot && plan0 ? BY_LETTER[plan0.t[lot - 1]] : '';
    const [plan, setPlan] = useState('cash');
    const [years, setYears] = useState(3);
    const [custom, setCustom] = useState(''); // optional: pay more than the monthly installment
    const [method, setMethod] = useState('cash');
    const [form, setForm] = useState(() => {
      const base = { name: '', address: '', mobile: '', email: '', consent: false, website: '' };
      try { return { ...base, ...JSON.parse(sessionStorage.getItem('ghmp-presale-form') || '{}') }; } catch (e) { return base; }
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(() => {
      try { return JSON.parse(sessionStorage.getItem('ghmp-presale-payment') || 'null'); } catch (_) { return null; }
    });
    const [wallets,setWallets] = useState({gcash:false,maya:false});
    const [recovery,setRecovery] = useState(() => {
      try { return JSON.parse(sessionStorage.getItem('ghmp-presale-request') || 'null'); } catch (_) { return null; }
    });
    useEffect(()=>{let active=true;fetch('/api/presale?paymentOptions=1',{cache:'no-store'})
      .then(r=>r.json()).then(v=>{if(active)setWallets({gcash:v.gcash===true,maya:v.maya===true});}).catch(()=>{});
      return ()=>{active=false;};},[]);
    const topRef = useRef(null);
    const detailsRef = useRef(null);
    // Keep what the buyer typed, so an accidental close does not lose it.
    useEffect(() => {
      try {
        if (done) sessionStorage.removeItem('ghmp-presale-form');
        else sessionStorage.setItem('ghmp-presale-form', JSON.stringify({ name: form.name, address: form.address, mobile: form.mobile, email: form.email }));
      } catch (e) {}
    }, [form.name, form.address, form.mobile, form.email, done]);

    const loadTaken = useCallback(() => {
      setLoadErr(false);
      return fetch('/api/presale?block=' + BLOCK, { cache: 'no-store' })
        .then((r) => { if (!r.ok) throw new Error('bad'); return r.json(); })
        .then((d) => { setTakenList(d.taken || []); setHeldList(d.held || []); return d.taken || []; })
        .catch(() => { setLoadErr(true); return null; });
    }, []);
    useEffect(() => {
      fetch('/presale-plan.json').then((r) => { if (!r.ok) throw new Error('bad'); return r.json(); }).then(setPlan0).catch(() => setPlanErr(true));
      loadTaken();
      const t = setInterval(() => { if (!document.hidden) loadTaken(); }, 45000); // see plots other buyers just took
      return () => clearInterval(t);
    }, [loadTaken]);
    useEffect(() => { if (topRef.current) slowScroll(topRef.current, 0, 1200, true); }, [step, done]);

    // Plots the buyer already added count as taken, so the same plot cannot be picked twice.
    const taken = useMemo(() => {
      const t = new Set(takenList);
      more.forEach((m) => t.add(m.lot));
      return t;
    }, [takenList, more]);

    const heldSet = useMemo(() => new Set(heldList), [heldList]);
    const openIds = {};
    TYPE_IDS.forEach((id) => { openIds[id] = priceOf(id) > 0 && !STAFF_ONLY.includes(id); });
    const counts = useMemo(() => {
      const out = {};
      if (!plan0) return out;
      for (let i = 0; i < plan0.t.length; i++) { if (!taken.has(i + 1) && !heldSet.has(i + 1)) { const id = BY_LETTER[plan0.t[i]]; out[id] = (out[id] || 0) + 1; } }
      return out;
    }, [plan0, taken, heldSet]);

    const goDetails = () => { if (!lot) return; pushNav(); setStep(3); };

    const MAX_PLOTS = 100; // safety ceiling only; effectively as many as the buyer wants
    const allLots = [...more, ...(step === 3 && lot && typeId && !more.some((m) => m.lot === lot) ? [{ block, lot, typeId }] : [])];
    const spot = allLots.reduce((n, l) => n + priceOf(l.typeId) - discOf(l.typeId, 'cash'), 0);          // spot cash price
    const listSum = allLots.reduce((n, l) => n + priceOf(l.typeId), 0);
    const instBase = allLots.reduce((n, l) => n + priceOf(l.typeId) - discOf(l.typeId, 'installment'), 0); // base for monthly plans
    const addAnother = () => {
      if (!lot || allLots.length >= MAX_PLOTS) return;
      setMore((m) => [...m, { block, lot, typeId }]);
      setLot(0);
      back(); // one step back to the site plan, where the buyer picks the next plot
    };
    const removeMore = (i) => setMore((m) => m.filter((_, k) => k !== i));
    const term = TERMS.find((t) => t.years === years) || TERMS[0];
    const totalFor = (t) => Math.round(instBase * (1 + t.surcharge));
    const listTotalFor = (t) => Math.round(listSum * (1 + t.surcharge));
    const deposit = allLots.length * 3000;
    const monthlyFor = (t) => Math.round(totalFor(t) * 100 / (t.years * 12)) / 100; // total / months, as on the price list
    const total = plan === 'cash' ? spot : totalFor(term);
    const customNum = Math.round(Number(String(custom).replace(/[^0-9.]/g, '')) || 0);
    const customMonths = customNum > 0 ? Math.ceil(Math.max(0,total-deposit) / customNum) : 0;
    const monthly = plan === 'cash' ? 0 : monthlyFor(term);
    const methodInfo = METHODS.find((m) => m.id === method);

    const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async (e) => {
      e.preventDefault();
      setError('');
      if (!recovery && ['gcash','maya'].includes(method) && !wallets[method]) return setError('A verified receiving QR is not available for this method yet. Please contact the office or choose another payment method.');
      if (!recovery) {
      if (form.name.trim().length < 3) return setError('Please write your full name.');
      if (form.address.trim().length < 5) return setError('Please write your complete address.');
      if (form.mobile.replace(/\D/g, '').length < 10) return setError('Please write your mobile number (11 digits).');
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Please write a correct email address.');
      if (!form.consent) return setError('Please tick the box so our staff may contact you.');
      if (plan === 'installment' && customNum > 0 && customNum < monthlyFor(term)) return setError('Your own monthly amount cannot be less than ' + peso(monthlyFor(term)) + '. Please write that amount or more, or leave it empty.');
      }
      setBusy(true);
      try {
        const manual = ['gcash','maya'].includes(method);
        const payload = recovery || {
          lots: allLots.map((l) => ({ block: l.block, lot: l.lot })), plan, years: plan === 'cash' ? 0 : years, method,
          customMonthly: plan === 'installment' && customNum > 0 ? customNum : 0,
          name: form.name, address: form.address, mobile: form.mobile, email: form.email,
          consent: form.consent, website: form.website,
          ...(manual ? {requestId:Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')} : {})
        };
        if (payload.requestId) {
          // Saving must succeed before sending, so refresh can retry the same capability.
          sessionStorage.setItem('ghmp-presale-request',JSON.stringify(payload));
          setRecovery(payload);
        }
        const res = await fetch('/api/presale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          if (data.paymentFlow === 'manual_qr') sessionStorage.setItem('ghmp-presale-payment',JSON.stringify(data));
          sessionStorage.removeItem('ghmp-presale-request');setRecovery(null);
          if (method === 'paymongo') {
            window.location.assign('/my-payments.html?mode=reservation&ref=' + encodeURIComponent(data.ref));
            return;
          }
          setDone(data);
          return;
        }
        if (!res.ok) {
          if (res.status < 500) { sessionStorage.removeItem('ghmp-presale-request');setRecovery(null); }
          if (res.status === 405) {
            setError('The local preview server (Live Server) cannot process API payments. Please run via "vercel dev" or test on the deployed site.');
            return;
          }
          if (res.status === 404) {
            setError('The presale API endpoint (/api/presale) was not found. Please ensure serverless functions are deployed.');
            return;
          }
          if (data.error === 'taken') {
            const tl = data.lot || lot;
            await loadTaken();
            const idx = more.findIndex((m) => m.lot === tl);
            if (idx >= 0) {
              removeMore(idx);
              setError('Sorry, someone just took ' + code(BLOCK, tl) + '. We removed it from your list. You may add another plot, then press Send again.');
            } else {
              setLot(0);
              setError('Sorry, someone just took ' + code(BLOCK, tl) + '. Please press Back and choose another plot on the map.');
            }
          } else if (data.error === 'dup') {
            setError('This mobile number already has a presale reservation. Please call us if you want to add more plots to it.');
          } else {
            setError(data.error || ('Server error (' + res.status + '). Please try again or call us.'));
          }
          return;
        }
      } catch (err) {
        setError('We could not reach our server. Please check your internet and try again.');
      } finally {
        setBusy(false);
      }
    };

    /* ---- Browser / phone Back button: step back inside the presale instead of leaving it ---- */
    const closing = useRef(false);
    const skipNext = useRef(false);
    const depth = useRef(0);          // history entries this flow has added
    const live = useRef({});          // latest state for the popstate handler
    live.current = { step, block, done, onClose };
    const pushNav = () => { try { window.history.pushState({ presale: depth.current + 1 }, ''); depth.current += 1; } catch (e) {} };

    useEffect(() => {
      pushNav(); // entry for the first screen, so the first Back press stays inside the presale
      const onPop = (e) => {
        if (closing.current) return;
        if (skipNext.current) { skipNext.current = false; return; }
        // Forward button: not supported inside the flow, so step straight back to where we were.
        const idx = e && e.state && e.state.presale ? e.state.presale : 0;
        if (idx > depth.current) { skipNext.current = true; try { window.history.back(); } catch (err) {} return; }
        depth.current = Math.max(0, depth.current - 1);
        const c = live.current;
        if (c.done) { closing.current = true; const n = depth.current; depth.current = 0; c.onClose(); if (n > 0) { try { window.history.go(-n); } catch (e) {} } }
        else if (c.step === 3) { setStep(1); }
        else { c.onClose(); }
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }, []);

    // Each forward move adds a history entry; Back then undoes exactly one move.
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

    if (done?.paymentFlow === 'manual_qr') {
      body = <window.PresalePayment reservation={done} />;
    } else if (recovery) {
      body = <div style={WRAP}><div style={S.card}>
        <h2 style={S.h2}>Recover your reservation request</h2>
        <p style={S.lead}>Your previous request may already have held the plots. Retry that same request to recover its result. Do not pay or start another reservation.</p>
        {error && <p role="alert" style={S.note}>{error}</p>}
        <button type="button" style={S.big} disabled={busy} onClick={submit}>{busy?'Checking…':'Check / retry saved reservation'}</button>
        <p><a href="/my-payments?mode=reservation">Already have a reference? Open secure payment access</a></p>
      </div></div>;
    } else if (done) {
      const m = METHODS.find((x) => x.id === done.method) || { label: 'PayMongo' };
      const info = { cash: PAY_INFO.office, gcash: PAY_INFO.gcash, bank: PAY_INFO.bank, cheque: PAY_INFO.cheque, paymongo: 'PayMongo Gateway (GCash, Maya, Cards)' }[done.method];
      body = (
        <div style={WRAP}>
          <div style={{ ...S.card, borderColor: '#2f5d4c', borderWidth: 2 }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <h2 style={S.h2}>{done.plots && done.plots.length > 1 ? 'Your ' + done.plots.length + ' plots are reserved' : 'Your plot is reserved'}</h2>
            <p style={S.lead}>Thank you. Please keep this reference number: <b style={{ fontSize: 22, color: '#2f5d4c' }}>{done.ref}</b></p>
            <div style={{ display: 'grid', gap: 8, fontSize: 18 }}>
              {(done.plots && done.plots.length ? done.plots : [{ plotCode: done.plotCode, typeId: done.typeId }]).map((x) => <div key={x.plotCode}><b>Plot:</b> {nicePlot(x.plotCode)} · {(TYPES[x.typeId] || { name: x.typeId }).name}</div>)}
              <div><b>Plan:</b> {done.plan === 'cash' ? 'Spot cash · ' + peso(done.total) : done.years + ' years · ' + peso(done.monthly) + ' a month · total ' + peso(done.total)}</div>
              <div><b>You will pay by:</b> {m.label}</div>
              {info ? <div><b>Where:</b> {info}</div> : null}
              {PAY_INFO.hours && done.method === 'cash' ? <div><b>Office hours:</b> {PAY_INFO.hours}</div> : null}
            </div>
            <div style={{ ...S.note, marginTop: 16, background: '#fff6dc', border: '2px solid #b08544' }}>
              <b>Pay first:</b> a {peso(3000)} down payment for every plot{done.plots && done.plots.length > 1 ? ' (' + peso(3000 * done.plots.length) + ' in all)' : ''} must be paid before your {done.plan === 'cash' ? 'full payment' : 'monthly installments'} can continue.
            </div>
            <div style={{ ...S.note, marginTop: 12 }}>
              <b>What happens next:</b> our staff will call you to check your name and address. Your plot stays reserved while we do this. Your reservation is final once we receive your payment.
            </div>
            <div style={{ ...S.note, marginTop: 12 }}>
              <b>Track your payments anytime:</b> open <a href={'/my-payments?ref=' + encodeURIComponent(done.ref)} target="_blank" rel="noopener" style={{ color: '#2f5d4c', fontWeight: 700 }}>Check my payments</a> and type your reference number and mobile number. You can see how many months are left.
            </div>
            <button type="button" style={{ ...S.big, marginTop: 18 }} onClick={closeAll}>Close</button>
          </div>
        </div>);
    } else if (step !== 3) {
      body = <SitePlan plan={plan0} planErr={planErr} taken={taken} held={heldSet} lot={lot} setLot={setLot} filter={filter} setFilter={setFilter} priceOf={priceOf} descOf={descOf} openIds={openIds} counts={counts} onContinue={goDetails} phone={PAY_INFO.phone} wrapStyle={WRAP} />;
    } else {
      const t = TYPES[typeId] || TYPES.regular;
      body = (
        <form onSubmit={submit} style={{ ...WRAP, maxWidth: fullPage ? 1240 : 980, margin: '0 auto' }}>
          <Steps step={3} />
          <h2 style={S.h2}>Your plot and your details</h2>
          <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
            <img src={t.photo} alt={t.name} style={{ width: 96, aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: 'center 68%', borderRadius: 8 }} />
            <div>
              <div style={{ fontSize: 14, color: '#4a564f' }}>You are buying</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{lot ? code(block, lot) : '...'}</div>
              <div style={{ fontSize: 16 }}>{t.name}</div>
              <button type="button" onClick={back} style={{ marginTop: 6, minHeight: 44, padding: '0 14px', borderRadius: 10, border: '2px solid #2f5d4c', background: '#fff', color: '#1f4a39', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Change my plot</button>
            </div>
          </div>

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Your plots ({allLots.length})</div>
            {allLots.map((l, i) => (
              <div key={l.lot} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid #e3dccb' : 'none', fontSize: 18 }}>
                <div style={{ flex: 1 }}><b>{code(l.block, l.lot)}</b> · {TYPES[l.typeId].name}</div>
                <div style={{ textAlign: 'right' }}><b style={{ color: discOf(l.typeId, 'cash') > 0 ? RED : 'inherit' }}>{peso(priceOf(l.typeId) - discOf(l.typeId, 'cash'))}</b>{discOf(l.typeId, 'cash') > 0 ? <div><Was n={priceOf(l.typeId)} size={14} /> <OffTag was={priceOf(l.typeId)} now={priceOf(l.typeId) - discOf(l.typeId, 'cash')} size={13} /></div> : null}</div>
                {i < more.length ? <button type="button" onClick={() => removeMore(i)} style={{ border: '1.5px solid #a33', color: '#a33', background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 15, cursor: 'pointer' }}>Remove</button> : <span style={{ fontSize: 14, color: '#4a564f' }}>(choosing now)</span>}
              </div>))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, padding: '10px 0 4px', borderTop: '2px solid #2f5d4c' }}><b>Total (spot cash)</b><span style={{ textAlign: 'right' }}><b style={{ color: listSum > spot ? RED : 'inherit' }}>{peso(spot)}</b>{listSum > spot ? <div><Was n={listSum} size={14} /> <OffTag was={listSum} now={spot} size={13} /></div> : null}</span></div>
            <button type="button" onClick={addAnother} disabled={allLots.length >= MAX_PLOTS} style={{ marginTop: 8, width: '100%', minHeight: 56, fontSize: 19, fontWeight: 700, borderRadius: 12, border: '2px solid #2f5d4c', background: '#fff', color: '#1f4a39', cursor: allLots.length >= MAX_PLOTS ? 'default' : 'pointer', opacity: allLots.length >= MAX_PLOTS ? 0.5 : 1 }}>＋ Add another plot{allLots.length >= MAX_PLOTS ? ' (limit reached)' : ''}</button>
            <div style={{ fontSize: 15, color: '#4a564f', marginTop: 6 }}>You may reserve as many plots as you need. One payment plan covers all of them.</div>
          </div>

          <div style={{ ...S.card, marginBottom: 16, border: '2px solid #b08544', background: '#fff6dc' }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.06em', color: '#7a5a1f' }}>STEP 1 OF PAYING</div>
            <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 6px' }}>Pay {peso(deposit)} first</div>
            <div style={{ fontSize: 17, lineHeight: 1.45 }}>
              Every plot needs a <b>{peso(3000)} down payment</b> ({allLots.length} {allLots.length === 1 ? 'plot' : 'plots'} = <b>{peso(deposit)}</b>). You must pay this first, whether you choose spot cash or monthly installment. Your {plan === 'cash' ? 'full payment' : 'monthly payments'} can only continue after our staff verify it. The {peso(deposit)} is part of your total, not extra. <a href="/company.html" target="_blank" rel="noopener" style={{ color: '#1f4a39', fontWeight: 700 }}>See our company documents</a>.
            </div>
          </div>

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Then, how will you pay the rest?</div>
            {[{ id: 'cash', title: 'Spot cash', sub: listSum > spot ? <span><b style={{ color: RED }}>{peso(spot)}</b> <Was n={listSum} size={15} /> <OffTag was={listSum} now={spot} size={13} /> paid in full</span> : peso(spot) + ' paid in full' }, { id: 'installment', title: 'Monthly installment', sub: 'Pay a little every month' }].map((o) => (
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
                      <br /><span style={{ fontSize: 15, color: '#4a564f' }}>Total <b style={{ color: listSum > instBase ? RED : 'inherit' }}>{peso(totalFor(tm))}</b> (+{Math.round(tm.surcharge * 100)}%){listSum > instBase ? <span> <Was n={listTotalFor(tm)} size={14} /> <OffTag was={listTotalFor(tm)} now={totalFor(tm)} size={13} /></span> : null}</span>
                    </span>
                  </label>))}
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px dashed #b08544', background: '#fffdf6' }}>
                  <label htmlFor="ps-custom" style={{ display: 'block', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Want to pay more each month? (optional)</label>
                  <div style={{ fontSize: 15, color: '#4a564f', marginBottom: 8 }}>You may pay more than {peso(monthlyFor(term))} a month. It cannot be less. Paying more finishes your payments sooner.</div>
                  <input id="ps-custom" inputMode="numeric" placeholder={'At least ' + peso(monthlyFor(term))} value={custom} onChange={(e) => setCustom(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 20, padding: '12px 14px', borderRadius: 10, border: '1.5px solid #c9bd9f' }} />
                  {customNum > 0 && customNum < monthlyFor(term) ? <div style={{ marginTop: 8, color: '#a33', fontSize: 16, fontWeight: 600 }}>Please write {peso(monthlyFor(term))} or more.</div> : null}
                  {customNum >= monthlyFor(term) ? <div style={{ marginTop: 8, fontSize: 16, color: '#1f4a39', fontWeight: 600 }}>At {peso(customNum)} a month you finish in about {customMonths} {customMonths === 1 ? 'month' : 'months'} instead of {term.years * 12}.</div> : null}
                </div>
              </div>) : null}

            <div style={{ fontSize: 16, fontWeight: 600, margin: '14px 0 8px' }}>{plan === 'cash' ? 'How will you pay the full amount?' : 'How will you pay each month?'}</div>
            {METHODS.map((m) => (
              <label key={m.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 10px', borderRadius: 10, border: method === m.id ? '2px solid #2f5d4c' : '1px solid #c9bd9f', background: method === m.id ? '#eaf2ec' : '#fff', marginBottom: 8, cursor: 'pointer', fontSize: 18 }}>
                <input type="radio" name="method" checked={method === m.id} disabled={m.id==='maya' && !wallets.maya} onChange={() => setMethod(m.id)} style={{ width: 24, height: 24 }} />
                <span><b>{m.label}</b><br /><span style={{ fontSize: 15, color: '#4a564f' }}>{['gcash','maya'].includes(m.id) && !wallets[m.id] ? 'Unavailable — awaiting a verified receiving QR. Do not send money.' : m.hint}</span></span>
              </label>))}
            <div style={{ ...S.note, marginTop: 8 }}>
              {typeId && cryptNote(typeId) ? <p><b>What you are buying:</b> {cryptNote(typeId)}</p> : null}
              <p><b>First payment (down payment):</b> {peso(deposit)}, credited toward your plan.{['gcash','maya'].includes(method) ? ' Your plots are held before the QR is shown. Upload proof after paying; an admin must verify it.' : ' Our staff will verify it before your plan continues.'}</p>
              {plan === 'cash' ? <div><b>You pay:</b> {peso(deposit)} down payment first, then the remaining {peso(Math.max(0, total - deposit))} (total {peso(total)}) by {methodInfo.label}. The down payment is part of this total.</div> :
                <div><b>You pay:</b> {peso(deposit)} down payment first, then {peso(monthly)} every month by {methodInfo.label} (the price list amount for {years} {years === 1 ? 'year' : 'years'}). Total {peso(total)}. The down payment is credited to your total, so your last payment is smaller and you finish a few months early. Monthly payments only start after the down payment is verified.</div>}
              <div style={{ marginTop: 4, fontSize: 15 }}>Our staff will tell you exactly how and where to pay when they call you.</div>
            </div>
          </div>

          <div ref={detailsRef} style={{ ...S.card, marginBottom: 16 }}>
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
      <div style={fullPage ? { ...S.overlay, background: 'var(--bg, #f6f1e8)' } : S.overlay} role="dialog" aria-modal="true" aria-label="Presale plot reservation">
        <div style={fullPage ? { ...S.sheet, maxWidth: 'none', padding: '0 0 40px' } : S.sheet}>
          <div ref={topRef} style={S.bar}>
            {done ? null : <button type="button" onClick={back} style={{ background: 'transparent', border: '1.5px solid #fffaf0', color: '#fffaf0', borderRadius: 8, fontSize: 16, padding: '8px 14px', cursor: 'pointer' }}>← Back</button>}
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Presale · Choose your plot</div>
            <button type="button" onClick={closeAll} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#fffaf0', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          {body}
        </div>
      </div>);
  }

  window.PresaleFlow = PresaleFlow;
  window.PresalePlanMap = PlanMap;
  window.PRESALE_PLAN_TYPES = { TYPES, BY_LETTER };
  window.PresaleContext = React.createContext({ openPresale: () => {} });
  window.PRESALE_TYPE_IDS = SITE_TYPE_IDS;
})();
