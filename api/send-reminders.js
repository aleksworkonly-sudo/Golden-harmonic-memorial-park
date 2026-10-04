// /api/send-reminders.js
//
// Vercel serverless function, triggered once a day by Vercel Cron (see
// vercel.json). For every customer with an active installment plan, works
// out when their next monthly payment is due and emails them via Brevo:
//   - 3 days BEFORE the due date ("upcoming" reminder)
//   - 3 days AFTER the due date, if still unpaid ("missed it" follow-up)
//
// Spot-cash plans have no recurring due date and are skipped. A plan that's
// already fully paid off is skipped too.
//
// Idempotency: each customer doc gets a `reminders.lastSentForDueDate` field
// (e.g. "before:2026-10-04") so re-running the same day (or a slow/retried
// cron tick) never double-sends for the same due date.
//
// Auth: only Vercel's own scheduler can trigger this — it sends
// `Authorization: Bearer <CRON_SECRET>` automatically once CRON_SECRET is
// set as an env var. Anyone else hitting this URL gets a 401.
//
// Required env vars: BREVO_API_KEY, FIREBASE_SERVICE_ACCOUNT_B64, CRON_SECRET
// Optional env vars: SENDER_EMAIL, SENDER_NAME


const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
    )
  });
}
const db = admin.firestore();

const REMINDER_DAYS_BEFORE = 3; // email sent this many days before the due date
const FOLLOWUP_DAYS_AFTER = 3;  // email sent this many days after, if still unpaid

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

// Whole-day difference between two dates, ignoring time-of-day.
// Positive = `to` is in the future relative to `from`.
function daysBetween(from, to) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

async function sendReminderEmail({ to_email, first_name, plan_name, amount_due, due_date, kind }) {
  const isOverdue = kind === 'overdue';
  const message = isOverdue
    ? `Your payment of ${peso(amount_due)} for ${plan_name} was due on ${due_date}. Please settle it soon to avoid late fees.`
    : `Just a reminder: your next payment of ${peso(amount_due)} for ${plan_name} is due on ${due_date}.`;

  const subject = isOverdue
    ? `Payment Overdue — ${plan_name} | Golden Harmonic Memorial Park`
    : `Payment Reminder — ${plan_name} | Golden Harmonic Memorial Park`;

  const senderEmail = process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com';
  const senderName  = process.env.SENDER_NAME  || 'Golden Harmonic Memorial Park';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f1e8;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,${isOverdue ? '#8b3a3a' : '#2f5d4c'} 0%,${isOverdue ? '#5c2020' : '#1a3d30'} 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#f6f1e8;font-size:22px;font-weight:600;">
            ${isOverdue ? '⚠️ Payment Overdue' : '📋 Payment Reminder'}
          </h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#1f2a26;font-size:16px;line-height:1.6;">
            Hi <strong>${first_name || 'there'}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">${message}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border-radius:8px;margin:24px 0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#4a564f;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Payment Details</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Plan:</strong> ${plan_name}</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Amount Due:</strong> ${peso(amount_due)}</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Due Date:</strong> ${due_date}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">
            If you've already made this payment, please disregard this message. For questions, feel free to contact us.
          </p>
          <p style="margin:24px 0 0;color:#4a564f;font-size:14px;">
            Warm regards,<br><strong style="color:#2f5d4c;">Golden Harmonic Memorial Park</strong>
          </p>
        </td></tr>
        <tr><td style="background:#f9f7f2;padding:20px 40px;text-align:center;border-top:1px solid #e8e0d0;">
          <p style="margin:0;color:#8a7f6f;font-size:12px;">
            &copy; ${new Date().getFullYear()} Golden Harmonic Memorial Park &bull; Palawan, Philippines
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to_email, name: first_name || to_email }],
      subject,
      htmlContent
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text}`);
  }
}

function peso(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH');
}

module.exports = async (req, res) => {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date();
  const results = { checked: 0, remindersSent: 0, followupsSent: 0, skipped: 0, errors: [] };

  const snap = await db.collection('customers').get();

  for (const doc of snap.docs) {
    const c = doc.data();
    results.checked++;

    const plan = c.plan;
    if (!plan || !plan.startDate || !plan.monthlyAmount || !plan.termMonths || plan.termKey === 'cash') {
      results.skipped++;
      continue;
    }
    if (!c.email) { results.skipped++; continue; }

    const paid = (c.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const paymentsMade = Math.min(plan.termMonths, Math.floor(paid / plan.monthlyAmount));
    if (paymentsMade >= plan.termMonths) { results.skipped++; continue; } // fully paid off

    const nextDue = addMonths(plan.startDate, paymentsMade + 1);
    const diff = daysBetween(today, nextDue); // >0 = due date hasn't arrived yet
    const dueDateKey = nextDue.toISOString().slice(0, 10);
    const lastSentFor = (c.reminders && c.reminders.lastSentForDueDate) || '';

    try {
      if (diff === REMINDER_DAYS_BEFORE && lastSentFor !== `before:${dueDateKey}`) {
        await sendReminderEmail({
          to_email: c.email, first_name: c.firstName || c.fullName,
          plan_name: plan.tierName, amount_due: plan.monthlyAmount, due_date: dueDateKey, kind: 'upcoming'
        });
        await doc.ref.update({ 'reminders.lastSentForDueDate': `before:${dueDateKey}` });
        results.remindersSent++;
      } else if (diff === -FOLLOWUP_DAYS_AFTER && lastSentFor !== `after:${dueDateKey}`) {
        await sendReminderEmail({
          to_email: c.email, first_name: c.firstName || c.fullName,
          plan_name: plan.tierName, amount_due: plan.monthlyAmount, due_date: dueDateKey, kind: 'overdue'
        });
        await doc.ref.update({ 'reminders.lastSentForDueDate': `after:${dueDateKey}` });
        results.followupsSent++;
      }
    } catch (err) {
      results.errors.push({ customer: doc.id, error: err.message });
    }
  }

  return res.status(200).json(results);
};
