// /api/presale-track.js
//
//   POST /api/presale-track   body: { ref: 'PS-0004', mobile: '0917...' }
//     -> the buyer's payment progress (paid, balance, months paid / left, next due date)
//
// No login for the buyer: the reference number AND the mobile number used on the
// reservation must both match. Firestore rules stay closed; only this function
// reads presaleApplications, and it returns just what the buyer needs to see.
//
// Required env var: FIREBASE_SERVICE_ACCOUNT_B64 (same as /api/presale)

const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not set in environment variables');
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8')))
    });
  }
  return admin.firestore();
}

// Same arithmetic as presaleLedger() in admin-app.js, so staff and buyer see the same numbers.
function ledger(a) {
  const total = a.totalPrice || 0;
  const monthly = a.plan === 'cash' ? total : a.monthly || 0;
  let list = Array.isArray(a.payments) ? a.payments : [];
  if (!list.length && a.status === 'paid') {
    list = [{ amount: a.plan === 'cash' ? total : monthly, date: a.paymentConfirmedAt, ref: a.paymentReference }];
  }
  const paid = list.reduce((n, x) => n + (Number(x.amount) || 0), 0);
  const balance = Math.max(0, total - paid);
  const months = (a.years || 0) * 12;
  const monthsPaid = monthly > 0 ? Math.min(months || 1, Math.floor((paid + 0.5) / monthly)) : 0;
  const monthsLeft = balance <= 0 ? 0 : monthly > 0 ? Math.ceil((balance - 0.5) / monthly) : 0;
  const first = list.length ? list[0].date : null;
  let nextDue = null;
  if (a.plan === 'installment' && first && balance > 0) {
    const d = new Date(first);
    d.setMonth(d.getMonth() + monthsPaid);
    nextDue = d.getTime();
  }
  return { list, paid, balance, monthly, monthsPaid, monthsLeft, nextDue, full: total > 0 && balance <= 0, months };
}

const NOT_FOUND = { error: 'notfound' };

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const ref = String(body.ref || '').trim().toUpperCase().replace(/\s+/g, '');
    const mobileKey = String(body.mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^PS-\d{3,6}$/.test(ref) || mobileKey.length < 10) return res.status(404).json(NOT_FOUND);

    const snap = await getDb().collection('presaleApplications').doc(ref).get();
    // Same answer for "no such reference" and "wrong mobile", so nobody can probe for references.
    if (!snap.exists || snap.data().mobileKey !== mobileKey) return res.status(404).json(NOT_FOUND);

    const a = snap.data();
    if (a.status === 'cancelled') return res.status(200).json({ ok: true, cancelled: true, ref });
    const L = ledger(a);
    const plots = (Array.isArray(a.plots) && a.plots.length ? a.plots : [{ plotCode: a.plotCode, typeId: a.typeId }])
      .map((p) => ({ plotCode: p.plotCode, typeId: p.typeId }));
    return res.status(200).json({
      ok: true,
      ref,
      name: a.name || '',
      status: a.status || 'new',
      plan: a.plan,
      years: a.years || 0,
      plots,
      total: a.totalPrice || 0,
      monthly: L.monthly,
      paid: L.paid,
      balance: L.balance,
      monthsPaid: L.monthsPaid,
      monthsLeft: L.monthsLeft,
      monthsTotal: L.months,
      nextDue: L.nextDue,
      full: L.full,
      payments: L.list.map((x) => ({ date: x.date || null, amount: Number(x.amount) || 0, ref: x.ref || '' }))
    });
  } catch (err) {
    console.error('[presale-track] failed', err);
    return res.status(500).json({ error: 'Something went wrong. Please call us and we will help you.' });
  }
};
