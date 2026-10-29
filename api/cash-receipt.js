// /api/cash-receipt  (staff only)   POST { idToken, action, ... }
// actions: clients, create, get, print, photo, getPhoto, approve, void, list
// All the rules live in _cash-core.js. This file only checks who is calling.
const { getDb, staffFromToken, parseBody } = require('./_fb');
const { makeCore, HttpError, publicShape, phDateTime } = require('./_cash-core');
const { qrSvg } = require('./_qr');

function baseUrl(req) {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, '');
  const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  return host ? 'https://' + host : '';
}
const verifyUrl = (req, r) => baseUrl(req) + '/receipt?no=' + encodeURIComponent(r.receiptNo) + '&t=' + r.verifyToken;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const body = parseBody(req);
    const db = getDb();
    const user = await staffFromToken(body.idToken, db);
    const core = makeCore({ db });
    const no = String(body.receiptNo || '').trim().toUpperCase();
    const needNo = () => { if (!/^CR-\d{6,}$/.test(no)) throw new HttpError(400, 'Bad receipt number.'); };
    const withQr = (r) => ({ ...publicShape(r), verifyUrl: verifyUrl(req, r), qrSvg: qrSvg(verifyUrl(req, r), { size: 132 }) });

    switch (body.action) {
      case 'clients':
        return res.status(200).json({ ok: true, clients: await core.searchClients(body.q) });
      case 'create': {
        const out = await core.createReceipt(user, body);
        return res.status(200).json({ ok: true, duplicate: out.duplicate, receipt: withQr(out.receipt) });
      }
      case 'get': {
        needNo();
        const r = await core.getReceipt(no);
        const audit = user.role === 'staff' ? undefined : (await core.auditOf(no)).map((a) => ({ ...a, atText: phDateTime(a.at) }));
        return res.status(200).json({ ok: true, receipt: withQr(r), audit });
      }
      case 'print': {
        needNo();
        const p = await core.recordPrint(user, no);
        const r = await core.getReceipt(no);
        return res.status(200).json({ ok: true, ...p, receipt: withQr(r), printedBy: user.name });
      }
      case 'photo': {
        needNo();
        const out = await core.uploadPhoto(user, no, body.photo);
        return res.status(200).json({ ok: true, ...out });
      }
      case 'getPhoto':
        needNo();
        return res.status(200).json({ ok: true, photo: await core.getPhoto(no) });
      case 'approve': {
        needNo();
        const out = await core.approve(user, no, body.confirmed === true);
        return res.status(200).json({ ok: true, already: out.already, balanceAfter: out.balanceAfter, receipt: withQr(out.receipt) });
      }
      case 'void': {
        needNo();
        if (!['admin', 'superadmin'].includes(user.role)) throw new HttpError(403, 'Only an admin can void a receipt.');
        const out = await core.voidReceipt(user, no, body.reason);
        return res.status(200).json({ ok: true, already: out.already, receipt: withQr(out.receipt) });
      }
      case 'list': {
        const rows = await core.listReceipts({ status: body.status, q: body.q });
        return res.status(200).json({ ok: true, receipts: rows.map(publicShape) });
      }
      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[cash-receipt] failed', err);
    return res.status(500).json({ error: 'Something went wrong. Nothing was changed. Please try again.' });
  }
};
