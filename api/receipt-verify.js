// /api/receipt-verify   GET ?no=CR-000001&t=<token>   (public, from the QR code)
// Needs BOTH the receipt number and its secret token. Shows only: receipt no., status,
// amount, date, method, purpose and a masked name. No address, phone, e-mail or plot.
const { getDb } = require('./_fb');
const { makeCore, verifyShape, sameToken } = require('./_cash-core');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const no = String((req.query && req.query.no) || '').trim().toUpperCase();
  const t = String((req.query && req.query.t) || '');
  const NOPE = () => res.status(404).json({ error: 'notfound' });
  if (!/^CR-\d{6,}$/.test(no) || !t) return NOPE();
  try {
    const r = await makeCore({ db: getDb() }).getReceipt(no).catch(() => null);
    if (!r || !sameToken(r.verifyToken, t)) return NOPE();
    return res.status(200).json({ ok: true, receipt: verifyShape(r) });
  } catch (err) {
    console.error('[receipt-verify] failed', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
};
