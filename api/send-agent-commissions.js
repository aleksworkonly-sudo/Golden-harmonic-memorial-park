// /api/send-agent-commissions.js
//
// Vercel serverless function, run once a day by Vercel Cron (see vercel.json).
// An agent's commission falls due 12 months after the sale. When 11 months have
// passed (one month before the due date) and the commission is still unpaid, this
// emails the staff and the agent ONE time, then stamps `notifiedAt` on the record.
//
// Data: agentCommissions/{id}  { agentName, agentEmail, buyer, ref, commission,
//        saleDate, notifyDate, dueDate, status: 'pending'|'paid', notifiedAt }
//
// Who is emailed:
//   - the agent, if the agent has an email on file
//   - staff: STAFF_NOTIFY_EMAILS (comma separated) if set, otherwise every login
//     in the `users` collection that has an email
//
// Auth: only Vercel's scheduler can call this (Authorization: Bearer CRON_SECRET).
// Required env vars: BREVO_API_KEY, FIREBASE_SERVICE_ACCOUNT_B64, CRON_SECRET
// Optional env vars: SENDER_EMAIL, SENDER_NAME, STAFF_NOTIFY_EMAILS

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');
const dateText = (ms) => new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' });
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sendMail({ to, subject, heading, lines }) {
  const senderEmail = process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com';
  const senderName = process.env.SENDER_NAME || 'Golden Harmonic Memorial Park';
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f1e8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#2f5d4c;padding:28px 36px;text-align:center;"><h1 style="margin:0;color:#f6f1e8;font-size:20px;">${esc(heading)}</h1></td></tr>
<tr><td style="padding:32px 36px;color:#1f2a26;font-size:15px;line-height:1.6;">${lines.map((l) => `<p style="margin:0 0 12px;">${l}</p>`).join('')}
<p style="margin:24px 0 0;color:#4a564f;font-size:14px;">Golden Harmonic Memorial Park</p></td></tr>
</table></td></tr></table></body></html>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: to.map((email) => ({ email })), subject, htmlContent })
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
}

async function staffEmails() {
  const fixed = (process.env.STAFF_NOTIFY_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  const snap = await db.collection('users').get();
  return [...new Set(snap.docs.map((d) => String(d.data().email || '').trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e)))];
}

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const results = { checked: 0, notified: 0, errors: [] };
  const snap = await db.collection('agentCommissions').where('status', '==', 'pending').get();
  const staff = await staffEmails();

  for (const doc of snap.docs) {
    const c = doc.data();
    results.checked++;
    if (c.notifiedAt || !c.notifyDate || now < c.notifyDate) continue; // not yet 11 months, or already warned

    const overdue = now >= c.dueDate;
    const detail = [
      `<b>Agent:</b> ${esc(c.agentName)}`,
      `<b>Sale:</b> ${esc(c.buyer || '')} ${esc(c.ref || '')}`.trim(),
      `<b>Sale date:</b> ${dateText(c.saleDate)}`,
      `<b>Commission:</b> ${peso(c.commission)}`,
      `<b>Due date (1 year):</b> ${dateText(c.dueDate)}`
    ];
    try {
      if (staff.length) {
        await sendMail({
          to: staff,
          subject: `Agent commission ${overdue ? 'is due' : 'due soon'}: ${c.agentName} (${peso(c.commission)})`,
          heading: overdue ? 'Agent commission is due' : 'Agent commission due in about 1 month',
          lines: ['The 1-year mark of this sale is here. Please prepare the commission.', ...detail]
        });
      }
      if (c.agentEmail) {
        await sendMail({
          to: [c.agentEmail],
          subject: 'Your commission is almost due | Golden Harmonic Memorial Park',
          heading: 'Your commission is almost due',
          lines: [`Hi ${esc(c.agentName)}, your commission for the sale below falls due on ${dateText(c.dueDate)}.`, ...detail]
        });
      }
      await doc.ref.update({ notifiedAt: now });
      results.notified++;
    } catch (err) {
      results.errors.push({ commission: doc.id, error: err.message });
    }
  }
  return res.status(200).json(results);
};
