// Payment reminders for presale installment buyers (presaleApplications).
// Called once a day by api/send-reminders.js (the Vercel cron). Emails the buyer
//   - 3 days before the next monthly payment is due, and
//   - 1 day before it is due.
// Each reminder is sent once per due date: the kinds already sent are kept in
// reminders.sent on the reservation, so running the cron twice never double-sends.
// Files that start with "_" in /api are helpers, not public endpoints.

const REMIND_DAYS = [3, 1];
const TZ = 'Asia/Manila';

// Same arithmetic as presaleLedger() in admin-app.js and api/presale-track.js.
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
  return { paid, balance, monthly, monthsPaid, monthsLeft, nextDue };
}

// Calendar day (YYYY-MM-DD) of a timestamp in the Philippines.
function phDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function dayDiff(fromDay, toDay) {
  return Math.round((Date.parse(toDay + 'T00:00:00Z') - Date.parse(fromDay + 'T00:00:00Z')) / 86400000);
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const peso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');
const prettyDay = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });

function buildEmail({ a, ref, L, dueDay, daysLeft, baseUrl }) {
  const when = daysLeft === 1 ? 'tomorrow' : 'in ' + daysLeft + ' days';
  const amount = Math.min(L.monthly, L.balance);
  const plots = (Array.isArray(a.plots) && a.plots.length ? a.plots : [{ plotCode: a.plotCode }]).map((p) => p.plotCode).filter(Boolean).join(', ');
  const trackUrl = baseUrl + '/my-payments?ref=' + encodeURIComponent(ref);
  const row = (k, v) => '<tr><td style="padding:6px 0;color:#4a564f;width:42%;border-top:1px solid #e3dccb">' + k + '</td><td style="padding:6px 0;border-top:1px solid #e3dccb"><b>' + v + '</b></td></tr>';
  const html = '<!doctype html><html><body style="margin:0;background:#f6f1e8;font-family:Arial,Helvetica,sans-serif;color:#1f2a26"><div style="max-width:560px;margin:0 auto;padding:24px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2f5d4c;border-radius:12px 12px 0 0"><tr>'
    + '<td style="padding:14px 0 14px 22px;width:64px" valign="middle"><img src="' + esc(baseUrl) + '/logo-192.png" width="56" height="56" alt="Golden Harmonic Memorial Park" style="display:block;border-radius:50%;background:#fff"></td>'
    + '<td style="padding:14px 22px 14px 14px;color:#fffaf0;font-size:18px;font-weight:bold" valign="middle">Golden Harmonic Memorial Park</td></tr></table>'
    + '<div style="background:#fff;padding:24px 22px;border-radius:0 0 12px 12px;line-height:1.55;font-size:16px">'
    + '<p style="margin-top:0">Hello ' + esc(a.name) + ',</p>'
    + '<p>This is a friendly reminder that your monthly payment is due <b>' + when + '</b>, on <b>' + esc(prettyDay(dueDay)) + '</b>.</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 14px">'
    + row('Amount due', esc(peso(amount))) + row('Due date', esc(prettyDay(dueDay))) + row('Reservation no.', esc(ref)) + (plots ? row('Plot', esc(plots)) : '')
    + row('Paid so far', esc(peso(L.paid))) + row('Balance', esc(peso(L.balance))) + row('Months left', String(L.monthsLeft)) + '</table>'
    + '<p>Please pay at our office, or contact us to ask how to pay by GCash, bank transfer or cheque.</p>'
    + '<p><a href="' + esc(trackUrl) + '" style="display:inline-block;background:#2f5d4c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">Check my payments</a></p>'
    + '<p style="font-size:14px;color:#4a564f">If you have already paid, please ignore this message. Thank you.</p>'
    + '</div></div></body></html>';
  return { subject: daysLeft === 1 ? 'Payment due tomorrow — ' + ref + ' | Golden Harmonic Memorial Park' : 'Payment due in ' + daysLeft + ' days — ' + ref + ' | Golden Harmonic Memorial Park', html };
}

async function sendBrevo({ to, name, subject, html }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      sender: { name: process.env.SENDER_NAME || 'Golden Harmonic Memorial Park', email: process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com' },
      to: [{ email: to, name: name || to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) throw new Error('Brevo ' + res.status + ': ' + (await res.text()).slice(0, 300));
}

// admin: the firebase-admin module (for FieldValue); db: Firestore; now: ms; send: injectable for tests.
async function runPresaleReminders({ admin, db, now = Date.now(), send = sendBrevo, baseUrl }) {
  const out = { checked: 0, sent3: 0, sent1: 0, skipped: 0, errors: [] };
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://golden-harmonic-memorial-park-phi.vercel.app';
  const today = phDay(now);
  const snap = await db.collection('presaleApplications').where('plan', '==', 'installment').get();
  for (const doc of snap.docs) {
    const a = doc.data();
    out.checked++;
    if (a.status === 'cancelled' || !a.email) { out.skipped++; continue; }
    const L = ledger(a);
    if (!L.nextDue || L.balance <= 0) { out.skipped++; continue; }
    const dueDay = phDay(L.nextDue);
    const daysLeft = dayDiff(today, dueDay);
    if (!REMIND_DAYS.includes(daysLeft)) continue;
    const key = 'd' + daysLeft + ':' + dueDay;
    if (a.reminders && Array.isArray(a.reminders.sent) && a.reminders.sent.includes(key)) continue;
    try {
      const { subject, html } = buildEmail({ a, ref: doc.id, L, dueDay, daysLeft, baseUrl: base });
      await send({ to: a.email, name: a.name, subject, html });
      await doc.ref.update({ 'reminders.sent': admin.firestore.FieldValue.arrayUnion(key) });
      out['sent' + daysLeft]++;
    } catch (err) {
      out.errors.push({ ref: doc.id, error: err.message });
    }
  }
  return out;
}

module.exports = { runPresaleReminders, buildEmail, ledger, phDay, dayDiff };
