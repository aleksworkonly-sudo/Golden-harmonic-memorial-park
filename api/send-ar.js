// /api/send-ar.js
//
//   POST /api/send-ar   body: { idToken, ref: 'PS-0004', index: 0 }
//     -> emails the buyer an ACKNOWLEDGEMENT RECEIPT for payment number `index` of that sale.
//
// Staff only: the caller must send a Firebase ID token, and users/{uid}.role must be
// staff, admin or superadmin. The amounts, date and balance are read from Firestore here,
// never taken from the browser, so the email always matches what was recorded.
//
// This is NOT the BIR official receipt; the email says so.
//
// Env: FIREBASE_SERVICE_ACCOUNT_B64, BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME

const admin = require('firebase-admin');

function init() {
  if (!admin.apps.length) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not set in environment variables');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  }
}

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHOD_LABEL = { cash: 'Cash', gcash: 'GCash', bank: 'Bank transfer', cheque: 'Cheque', paymongo: 'Online (PayMongo)' };
const TYPE_LABEL = { regular: 'Regular', premium: 'Premium', 'corner-premium': 'Corner Premium' };
const fmtDate = (ms) => new Date(ms || Date.now()).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    init();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const idToken = String(body.idToken || '');
    const ref = String(body.ref || '').trim().toUpperCase();
    const index = parseInt(body.index, 10);
    if (!idToken) return res.status(401).json({ error: 'Please log in again.' });
    if (!/^PS-\d{3,6}$/.test(ref) || !(index >= 0)) return res.status(400).json({ error: 'Bad request.' });

    let uid;
    try { uid = (await admin.auth().verifyIdToken(idToken)).uid; }
    catch (e) { return res.status(401).json({ error: 'Please log in again.' }); }
    const db = admin.firestore();
    const u = await db.collection('users').doc(uid).get();
    if (!u.exists || !['staff', 'admin', 'superadmin'].includes(u.data().role)) return res.status(403).json({ error: 'Staff only.' });

    const snap = await db.collection('presaleApplications').doc(ref).get();
    if (!snap.exists) return res.status(404).json({ error: 'Reservation not found.' });
    const a = snap.data();
    const payments = Array.isArray(a.payments) ? a.payments : [];
    const p = payments[index];
    if (!p) return res.status(404).json({ error: 'Payment not found.' });
    if (!a.email) return res.status(400).json({ error: 'This buyer has no email address.' });

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Email service not configured (BREVO_API_KEY).' });
    const senderEmail = process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com';
    const senderName = process.env.SENDER_NAME || 'Golden Harmonic Memorial Park';

    const total = a.totalPrice || 0;
    const paidSoFar = payments.slice(0, index + 1).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    const balance = Math.max(0, total - paidSoFar);
    const monthly = a.plan === 'cash' ? total : a.monthly || 0;
    let nextDue = null;
    if (a.plan === 'installment' && balance > 0 && payments[0] && payments[0].date) {
      const monthsPaid = monthly > 0 ? Math.min((a.years || 0) * 12 || 1, Math.floor((paidSoFar + 0.5) / monthly)) : 0;
      const d = new Date(payments[0].date);
      d.setMonth(d.getMonth() + monthsPaid);
      nextDue = d.getTime();
    }
    const arNo = `AR-${ref}-${index + 1}`;
    const plots = (Array.isArray(a.plots) && a.plots.length ? a.plots : [{ plotCode: a.plotCode, typeId: a.typeId }])
      .map((x) => `${esc(x.plotCode)} (${esc(TYPE_LABEL[x.typeId] || x.typeId)})`).join(', ');
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${host}`;
    const trackUrl = `${baseUrl}/my-payments?ref=${encodeURIComponent(ref)}`;

    const row = (k, v) => `<tr><td style="padding:8px 0;color:#4a564f;width:42%;border-top:1px solid #eee">${k}</td><td style="padding:8px 0;border-top:1px solid #eee"><b>${v}</b></td></tr>`;
    const html = `<!doctype html><html><body style="margin:0;background:#f6f1e8;font-family:Arial,Helvetica,sans-serif;color:#1f2a26">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#2f5d4c;color:#fffaf0;padding:18px 22px;border-radius:12px 12px 0 0"><div style="font-size:18px;font-weight:bold">Golden Harmonic Memorial Park</div><div style="font-size:13px;opacity:.9">Taytay, Palawan</div></div>
<div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px;line-height:1.5;font-size:16px">
<div style="font-size:22px;font-weight:bold;letter-spacing:.04em">ACKNOWLEDGEMENT RECEIPT</div>
<div style="color:#4a564f;margin-bottom:12px">No. ${esc(arNo)}</div>
<p style="margin:0 0 8px">We acknowledge that we received the following payment from <b>${esc(a.name)}</b>. Thank you.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">
${row('Date and time', esc(fmtDate(p.date)))}
${row('Amount received', esc(peso(p.amount)))}
${row('Paid by', esc(METHOD_LABEL[p.method || a.method] || p.method || a.method || ''))}
${p.ref ? row('Receipt / reference no.', esc(p.ref)) : ''}
${row('Reservation no.', esc(ref))}
${row('Plot(s)', plots)}
${row('Total contract price', esc(peso(total)))}
${row('Total paid so far', esc(peso(paidSoFar)))}
${row('Balance', esc(peso(balance)))}
${nextDue ? row('Next payment due', esc(fmtDay(nextDue))) : (balance <= 0 ? row('Status', 'Fully paid') : '')}
</table>
<p style="font-size:13px;color:#4a564f;margin:16px 0 0">This is an acknowledgement of payment received. It is not an official receipt. Our office will issue your official receipt.</p>
<p style="margin:18px 0 0"><a href="${esc(trackUrl)}" style="display:inline-block;background:#2f5d4c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Check my payments</a></p>
</div></div></body></html>`;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let r;
    try {
      r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: a.email, name: a.name }],
          subject: `Acknowledgement Receipt ${arNo} — Golden Harmonic Memorial Park`,
          htmlContent: html
        }),
        signal: ctl.signal
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) {
      console.error('[send-ar] Brevo', r.status, await r.text());
      return res.status(502).json({ error: 'The email service refused the message. Check the sender in Brevo.' });
    }
    return res.status(200).json({ ok: true, to: a.email, arNo });
  } catch (err) {
    console.error('[send-ar] failed', err);
    return res.status(500).json({ error: 'Could not send the email.' });
  }
};
