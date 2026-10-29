// /api/my-receipts   POST { idToken }   (portal customer)
// Returns the verified cash receipts of the logged-in customer's own account(s).
const { getDb, uidFromToken, parseBody } = require('./_fb');
const { makeCore, publicShape } = require('./_cash-core');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const uid = await uidFromToken(parseBody(req).idToken);
    const db = getDb();
    const core = makeCore({ db });
    const cs = await db.collection('customers').where('authUid', '==', uid).get();
    const out = [];
    for (const d of cs.docs) {
      for (const r of await core.receiptsForTarget('customer', d.id)) {
        const p = publicShape(r);
        out.push({ receiptNo: p.receiptNo, purpose: p.purpose, amount: p.amount, method: p.method, approvedAtText: p.approvedAtText, approvedAt: p.approvedAt, accountRef: p.accountRef, clientName: p.clientName, verifyToken: p.verifyToken });
      }
    }
    out.sort((a, b) => b.approvedAt - a.approvedAt);
    return res.status(200).json({ ok: true, receipts: out });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[my-receipts] failed', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
};
