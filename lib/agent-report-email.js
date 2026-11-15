// Emails an agent their Monthly Sales Performance Report.
// Called from api/send-ar.js when the request has kind: 'agentReport' (kept inside that file so the
// project stays within Vercel's 12-function limit on the Hobby plan).
//
//   POST /api/send-ar  { kind:'agentReport', idToken, agentId, month:'2026-11', bonus, team, remarks, preparedBy, reviewedBy }
//
// Staff only. The plot count and revenue are recomputed here from Firestore (never taken from the browser).
// A sale counts in the month it was made (createdAt, Manila time); cancelled sales are left out.

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function monthRange(month) {
  const y = +month.slice(0, 4), m = +month.slice(5, 7);
  return [Date.UTC(y, m - 1, 1) - 8 * 3600e3, Date.UTC(y, m, 1) - 8 * 3600e3];
}
function monthLabel(month) {
  return new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 15)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
const ms = (t) => Number(t && t.toDate ? t.toDate().getTime() : t) || 0;

function figures(agent, apps, month) {
  const [from, to] = monthRange(month);
  let plots = 0, revenue = 0, sales = 0;
  apps.forEach((a) => {
    const t = ms(a.createdAt);
    if (a.agentId !== agent._id || a.status === 'cancelled' || t < from || t >= to) return;
    sales += 1;
    plots += Array.isArray(a.plots) && a.plots.length ? a.plots.length : 1;
    revenue += Number(a.totalPrice) || 0;
  });
  const tp = Number(agent.targetPlots) || 0, tr = Number(agent.targetRevenue) || 0;
  const hasTarget = tp > 0 || tr > 0;
  const quota = hasTarget && (tp <= 0 || plots >= tp) && (tr <= 0 || revenue >= tr);
  return { plots, revenue, sales, tp, tr, hasTarget, quota };
}

function reportHtml(agent, f, month, o) {
  const row = (item, target, actual, status) => `<tr><td style="padding:9px;border:1px solid #ddd">${item}</td><td style="padding:9px;border:1px solid #ddd">${target}</td><td style="padding:9px;border:1px solid #ddd"><b>${actual}</b></td><td style="padding:9px;border:1px solid #ddd">${status}</td></tr>`;
  const yn = (v) => (v === 'Yes' ? 'Eligible' : 'Not eligible');
  const line = (k, v) => `<div style="margin:3px 0"><b>${k}:</b> ${esc(v || '—')}</div>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f6f1e8;font-family:Arial,sans-serif;color:#222">
<div style="max-width:600px;margin:0 auto;padding:24px">
<div style="background:#2f5d4c;color:#fffaf0;padding:16px 22px;border-radius:12px 12px 0 0"><div style="font-size:18px;font-weight:bold">Golden Harmonic Memorial Park</div><div style="font-size:13px;opacity:.9">Monthly Sales Performance Report</div></div>
<div style="background:#fff;padding:22px;border-radius:0 0 12px 12px;line-height:1.5;font-size:15px">
<p style="margin:0 0 12px">Hello ${esc(agent.name)}, here is your sales performance for <b>${esc(monthLabel(month))}</b>.</p>
${line('Name', agent.name)}${line('Position', agent.position)}${line('Unit / Team', agent.team)}${line('Month', monthLabel(month))}
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">
<tr style="background:#f1ede2"><th align="left" style="padding:9px;border:1px solid #ddd">Item</th><th align="left" style="padding:9px;border:1px solid #ddd">Target</th><th align="left" style="padding:9px;border:1px solid #ddd">Actual</th><th align="left" style="padding:9px;border:1px solid #ddd">Status</th></tr>
${row('Plots Sold', f.tp || '—', f.plots, f.tp ? (f.plots >= f.tp ? 'Target met' : 'Below target') : '—')}
${row('Revenue Generated', f.tr ? peso(f.tr) : '—', peso(f.revenue), f.tr ? (f.revenue >= f.tr ? 'Target met' : 'Below target') : '—')}
${row('Quota Met', 'Yes / No', f.hasTarget ? (f.quota ? 'Yes' : 'No') : 'No target set', f.hasTarget ? (f.quota ? 'Quota met' : 'Quota not met') : '—')}
${row('Bonus Eligible', 'Yes / No', esc(o.bonus), yn(o.bonus))}
${row('Team Incentive Eligible', 'Yes / No', esc(o.team), yn(o.team))}
</table>
<div style="margin:12px 0"><b>Remarks</b><div style="border:1px solid #ddd;border-radius:6px;padding:10px;min-height:40px;margin-top:4px">${esc(o.remarks) || '—'}</div></div>
${line('Prepared by', o.preparedBy)}${line('Reviewed by', o.reviewedBy)}
<p style="font-size:12px;color:#666;margin:16px 0 0">Plots and revenue count the sales made in the month (cancelled sales are not counted). If anything looks wrong, please contact our office.</p>
</div></div></body></html>`;
}

async function handle(req, res, body, admin) {
  const idToken = String(body.idToken || '');
  const agentId = String(body.agentId || '');
  const month = String(body.month || '');
  if (!idToken) return res.status(401).json({ error: 'Please log in again.' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^[A-Za-z0-9_-]{6,64}$/.test(agentId)) return res.status(400).json({ error: 'Bad request.' });

  let uid;
  try { uid = (await admin.auth().verifyIdToken(idToken)).uid; }
  catch (e) { return res.status(401).json({ error: 'Please log in again.' }); }
  const db = admin.firestore();
  const u = await db.collection('users').doc(uid).get();
  if (!u.exists || !['staff', 'admin', 'superadmin'].includes(u.data().role)) return res.status(403).json({ error: 'Staff only.' });

  const ag = await db.collection('agents').doc(agentId).get();
  if (!ag.exists) return res.status(404).json({ error: 'Agent not found.' });
  const agent = { _id: ag.id, ...ag.data() };
  if (!agent.email) return res.status(400).json({ error: 'This agent has no email address.' });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Email service not configured (BREVO_API_KEY).' });
  const snap = await db.collection('presaleApplications').where('agentId', '==', agentId).get();
  const f = figures(agent, snap.docs.map((d) => ({ _id: d.id, ...d.data() })), month);
  const o = {
    bonus: body.bonus === 'Yes' ? 'Yes' : 'No',
    team: body.team === 'Yes' ? 'Yes' : 'No',
    remarks: clean(body.remarks, 500),
    preparedBy: clean(body.preparedBy, 80),
    reviewedBy: clean(body.reviewedBy, 80)
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  let r;
  try {
    r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: process.env.SENDER_NAME || 'Golden Harmonic Memorial Park', email: process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com' },
        to: [{ email: agent.email, name: agent.name }],
        subject: `Monthly Sales Performance Report, ${monthLabel(month)} — Golden Harmonic Memorial Park`,
        htmlContent: reportHtml(agent, f, month, o)
      }),
      signal: ctl.signal
    });
  } finally { clearTimeout(timer); }
  if (!r.ok) {
    console.error('[agent-report] Brevo', r.status, await r.text());
    return res.status(502).json({ error: 'The email service refused the message. Check the sender in Brevo.' });
  }
  return res.status(200).json({ ok: true, to: agent.email });
}

module.exports = { handle, figures, reportHtml, monthRange };
