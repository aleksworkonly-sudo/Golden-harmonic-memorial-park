// /api/presale.js
//
// Vercel serverless function for the Blocks A, B, C and D presale.
//
//   GET  /api/presale?block=B   -> { taken: [lot numbers already reserved/sold] }
//   POST /api/presale           -> reserves ONE plot, first come first served
//
// Why a server function: the reservation must be atomic (two buyers must never
// get the same plot) and the website's Firestore rules stay closed. The
// Firestore transaction below is the "first come, first served" guarantee.
//
// What a successful POST writes:
//   plots/{BLOCK}_{LOT}        status 'reserved' — same shape the admin Plot
//                              Management screen already reads
//   presaleApplications/{ref}  the buyer's details, plan, payment method
//   counters/presale           running number used for the reference (PS-0001)
//
// Required env var: FIREBASE_SERVICE_ACCOUNT_B64 (already used by send-reminders)

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const PRESALE_BLOCKS = ['A', 'B', 'C', 'D'];
const COLS = 40;
const ROWS = 50;
const TOTAL = COLS * ROWS; // 2,000 plots per block
const MAX_PLOTS = 100;     // safety ceiling only (one Firestore transaction must stay small)

// Fallbacks only. The live prices come from the Firestore 'products' docs.
const DEFAULT_PRICES = { regular: 30000, premium: 42500, 'corner-premium': 47500 };
const SURCHARGE = { 1: 0.10, 2: 0.15, 3: 0.20, 5: 0.30 };
const METHODS = ['cash', 'gcash', 'bank', 'cheque'];

// Layer rule: outer 3 rings Corner Premium, next 5 rings Premium, rest Regular.
function typeOfLot(lot) {
  const i = lot - 1;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const layer = Math.min(col, COLS - 1 - col, row, ROWS - 1 - row);
  if (layer < 3) return 'corner-premium';
  if (layer < 8) return 'premium';
  return 'regular';
}

async function priceFor(typeId) {
  try {
    const snap = await db.collection('products').doc(typeId).get();
    const p = snap.exists && Number(snap.data().price);
    if (p > 0) return p;
  } catch (e) { /* fall through to default */ }
  return DEFAULT_PRICES[typeId];
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const block = clean(req.query.block, 2).toUpperCase();
    if (!PRESALE_BLOCKS.includes(block)) return res.status(400).json({ error: 'Unknown block.' });
    const snap = await db.collection('plots').where('blockId', '==', block).get();
    const taken = snap.docs.map((d) => d.data().lotNo).filter((n) => Number.isInteger(n));
    return res.status(200).json({ block, taken });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: bots fill this in

  // New form sends lots: [{block, lot}]. The old single block + lot is still accepted.
  const rawLots = Array.isArray(b.lots) ? b.lots : [{ block: b.block, lot: b.lot }];
  const wanted = rawLots.slice(0, MAX_PLOTS + 1).map((x) => ({ block: clean(x && x.block, 2).toUpperCase(), lot: parseInt(x && x.lot, 10) }));
  const plan = b.plan === 'installment' ? 'installment' : 'cash';
  const years = plan === 'installment' ? parseInt(b.years, 10) : 0;
  const method = clean(b.method, 10);
  const name = clean(b.name, 120);
  const address = clean(b.address, 240);
  const mobile = clean(b.mobile, 30);
  const customMonthly = Math.round(Number(b.customMonthly) || 0);
  const email = clean(b.email, 120);

  if (!wanted.length || wanted.length > MAX_PLOTS) return res.status(400).json({ error: `You may reserve 1 to ${MAX_PLOTS} plots.` });
  for (const w of wanted) {
    if (!PRESALE_BLOCKS.includes(w.block)) return res.status(400).json({ error: 'Please choose Block A, B, C or D.' });
    if (!Number.isInteger(w.lot) || w.lot < 1 || w.lot > TOTAL) return res.status(400).json({ error: 'That plot number is not valid.' });
  }
  if (new Set(wanted.map((w) => `${w.block}_${w.lot}`)).size !== wanted.length) return res.status(400).json({ error: 'The same plot was chosen twice.' });
  if (plan === 'installment' && !SURCHARGE[years]) return res.status(400).json({ error: 'Please choose 1, 2, 3 or 5 years.' });
  if (!METHODS.includes(method)) return res.status(400).json({ error: 'Please choose how you will pay.' });
  if (name.length < 3 || address.length < 5 || mobile.replace(/\D/g, '').length < 10 || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'Please fill in your name, address, mobile number and email.' });
  }
  if (b.consent !== true) return res.status(400).json({ error: 'Please tick the box to let us contact you.' });

  // The server decides type and price of every plot. The browser's numbers are never trusted.
  const priceCache = {};
  const plots = [];
  for (const w of wanted) {
    const typeId = typeOfLot(w.lot);
    if (!(typeId in priceCache)) priceCache[typeId] = await priceFor(typeId);
    plots.push({
      blockId: w.block, lotNo: w.lot, typeId, price: priceCache[typeId],
      plotCode: `${w.block}-${String(w.lot).padStart(4, '0')}`
    });
  }
  const spot = plots.reduce((n, x) => n + x.price, 0);
  const total = plan === 'installment' ? Math.round(spot * (1 + SURCHARGE[years])) : spot;
  const monthly = plan === 'installment' ? Math.round(total / (years * 12)) : 0;

  // Optional: the buyer may promise to pay MORE than the monthly, never less.
  if (plan === 'installment' && customMonthly > 0 && (customMonthly < monthly || customMonthly > total)) {
    return res.status(400).json({ error: 'Your own monthly amount cannot be less than the monthly installment.' });
  }
  const intended = plan === 'installment' && customMonthly >= monthly ? customMonthly : 0;

  const mobileKey = mobile.replace(/\D/g, '').slice(-10);
  const plotRefs = plots.map((x) => db.collection('plots').doc(`${x.blockId}_${x.lotNo}`));
  const counterRef = db.collection('counters').doc('presale');

  try {
    const result = await db.runTransaction(async (tx) => {
      const [plotSnaps, counterSnap, dupSnap] = await Promise.all([
        Promise.all(plotRefs.map((r) => tx.get(r))),
        tx.get(counterRef),
        tx.get(db.collection('presaleApplications').where('mobileKey', '==', mobileKey))
      ]);
      // All or nothing: if any one plot is gone, nothing is reserved.
      const goneAt = plotSnaps.findIndex((sn) => sn.exists);
      if (goneAt >= 0) {
        const e = new Error('taken'); e.code = 'TAKEN'; e.plot = plots[goneAt]; throw e;
      }
      if (dupSnap.docs.some((d) => d.data().status !== 'cancelled')) {
        const e = new Error('dup'); e.code = 'DUP'; throw e;
      }
      const n = (counterSnap.exists ? counterSnap.data().n : 0) + 1;
      const ref = `PS-${String(n).padStart(4, '0')}`;
      const now = Date.now();
      const first = plots[0];

      tx.set(counterRef, { n });
      plots.forEach((x, i) => {
        tx.set(plotRefs[i], {
          blockId: x.blockId,
          lotNo: x.lotNo,
          customerId: '',
          status: 'reserved',
          hold: true,
          note: `Presale ${ref} (${name})`,
          presaleRef: ref,
          createdAt: now,
          createdBy: 'presale-web'
        });
      });
      tx.set(db.collection('presaleApplications').doc(ref), {
        ref, status: 'new', // new -> verified -> paid (or cancelled)
        // first plot kept in the old single-plot fields so older screens still work
        blockId: first.blockId, lotNo: first.lotNo, plotCode: first.plotCode, typeId: first.typeId,
        plots, plotCount: plots.length,
        plan, years, method,
        spotPrice: spot, totalPrice: total, monthly, customMonthly: intended,
        name, address, mobile, mobileKey, email,
        paymentReference: '', paymentConfirmedAt: null,
        createdAt: now
      });
      return { ref, plotCode: first.plotCode, typeId: first.typeId };
    });

    return res.status(200).json({ ok: true, ref: result.ref, plotCode: result.plotCode, typeId: result.typeId, plots: plots.map((x) => ({ plotCode: x.plotCode, typeId: x.typeId, price: x.price })), plan, years, method, total, monthly, spot });
  } catch (err) {
    if (err.code === 'TAKEN') return res.status(409).json({ error: 'taken', block: err.plot.blockId, lot: err.plot.lotNo });
    if (err.code === 'DUP') return res.status(409).json({ error: 'dup' });
    console.error('[presale] failed', err);
    return res.status(500).json({ error: 'Something went wrong. Please call us and we will help you.' });
  }
};
