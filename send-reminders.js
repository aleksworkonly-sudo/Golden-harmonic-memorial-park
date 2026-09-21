// /api/send-reminders.js
//
// Vercel serverless function, triggered once a day by Vercel Cron (see
// vercel.json). For every customer with an active installment plan, works
// out when their next monthly payment is due and emails them:
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
  const message = kind === 'overdue'
    ? `Your payment of ${peso(amount_due)} for ${plan_name} was due on ${due_date}. Please settle it soon to avoid late fees.`
    : `Just a reminder: your next payment of ${peso(amount_due)} for ${plan_name} is due on ${due_date}.`;

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_REMINDER_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY, // required for server-side (non-browser) sends
      template_params: {
        to_email,
        first_name: first_name || 'there',
        plan_name,
        amount_due: peso(amount_due),
        due_date,
        reminder_type: kind, // 'upcoming' | 'overdue' — for the template to use if it wants a heading
        message // full sentence, ready to drop straight into the template body
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS ${res.status}: ${text}`);
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
