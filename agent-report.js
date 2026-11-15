// Golden Harmonic Memorial Park - Agent Monthly Sales Performance Report (admin).
// Figures come from presale sales saved on each agent (presaleApplications.agentId).
// Counts a sale in the month it was made (createdAt, Manila time); cancelled sales are left out.
// Targets, position and unit/team are saved on the agent record (agents/{id}).
(function () {
  var h = React.createElement, useState = React.useState, useEffect = React.useEffect;
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var peso = function (n) { return '₱' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); };
  var num = function (t) { var n = Number(String(t == null ? '' : t).replace(/[^0-9.]/g, '')); return n > 0 ? n : 0; };
  var monthNow = function () { var d = new Date(Date.now() + 8 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); };
  var range = function (m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7); return [Date.UTC(y, mo - 1, 1) - 8 * 3600e3, Date.UTC(y, mo, 1) - 8 * 3600e3]; };
  var monthLabel = function (m) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 15)).toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

  // The numbers for one agent and month.
  function figures(agent, apps, month) {
    var r = range(month), plots = 0, revenue = 0, sales = 0;
    apps.forEach(function (a) {
      var t = Number(a.createdAt && a.createdAt.toDate ? a.createdAt.toDate().getTime() : a.createdAt) || 0;
      if (a.agentId !== agent._id || a.status === 'cancelled' || t < r[0] || t >= r[1]) return;
      sales += 1; plots += Array.isArray(a.plots) && a.plots.length ? a.plots.length : 1; revenue += Number(a.totalPrice) || 0;
    });
    var tp = Number(agent.targetPlots) || 0, tr = Number(agent.targetRevenue) || 0;
    var hasTarget = tp > 0 || tr > 0;
    var quota = hasTarget && (tp <= 0 || plots >= tp) && (tr <= 0 || revenue >= tr);
    return { plots: plots, revenue: revenue, sales: sales, tp: tp, tr: tr, hasTarget: hasTarget, quota: quota };
  }

  function sheet(agent, f, month, o) {
    var row = function (item, target, actual, status) { return '<tr><td>' + item + '</td><td>' + target + '</td><td>' + actual + '</td><td>' + status + '</td></tr>'; };
    var yn = function (v) { return v === 'Yes' ? 'Eligible' : 'Not eligible'; };
    var blank = function (v) { return v ? '<u>&nbsp;' + esc(v) + '&nbsp;</u>' : '<span class="bl"></span>'; };
    return '<div class="pg"><div class="c"><b>GOLDEN HARMONIC MEMORIAL PARK</b></div><div class="c t">MONTHLY SALES PERFORMANCE REPORT</div>' +
      '<p><b>Name:</b> ' + blank(agent.name) + '<br><b>Position:</b> ' + blank(agent.position) + '<br><b>Unit / Team:</b> ' + blank(agent.team) + '<br><b>Month:</b> ' + blank(monthLabel(month)) + '</p>' +
      '<table><tr><th>Item</th><th>Target</th><th>Actual</th><th>Status</th></tr>' +
      row('Plots Sold', f.tp ? f.tp : '—', f.plots, f.tp ? (f.plots >= f.tp ? 'Target met' : 'Below target') : '—') +
      row('Revenue Generated', f.tr ? peso(f.tr) : '—', peso(f.revenue), f.tr ? (f.revenue >= f.tr ? 'Target met' : 'Below target') : '—') +
      row('Quota Met', 'Yes / No', f.hasTarget ? (f.quota ? 'Yes' : 'No') : 'No target set', f.hasTarget ? (f.quota ? 'Quota met' : 'Quota not met') : '—') +
      row('Bonus Eligible', 'Yes / No', esc(o.bonus), yn(o.bonus)) +
      row('Team Incentive Eligible', 'Yes / No', esc(o.team), yn(o.team)) + '</table>' +
      '<p><b>Remarks</b></p><div class="rm">' + esc(o.remarks) + '</div>' +
      '<p class="sg"><b>Prepared By:</b> ' + blank(o.preparedBy) + '</p><p class="sg"><b>Reviewed By:</b> ' + blank(o.reviewedBy) + '</p></div>';
  }
  function printSheets(parts) {
    var w = window.open('', '_blank');
    if (!w) return false;
    w.document.write('<html><head><title>Monthly Sales Performance Report</title><style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;font-size:13pt;line-height:1.5;color:#000}.c{text-align:center}.t{font-size:17pt;font-weight:bold;margin:6px 0 16px}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #000;padding:9px;text-align:left}th{background:#eee}.bl{display:inline-block;border-bottom:1px solid #000;width:260px;height:1em}u{text-decoration:none;border-bottom:1px solid #000}.rm{border:1px solid #000;min-height:90px;padding:8px;white-space:pre-wrap}.sg{margin-top:26px}.pg{page-break-after:always}.pg:last-child{page-break-after:auto}</style></head><body>' + parts.join('') + '</body></html>');
    w.document.close(); w.focus(); w.print();
    return true;
  }

  function AgentReportPanel(props) {
    var agents = props.agents || [], setToast = props.setToast || function () {}, user = props.currentUser;
    var _a = useState([]), apps = _a[0], setApps = _a[1];
    var _b = useState(monthNow()), month = _b[0], setMonth = _b[1];
    var _c = useState(''), agentId = _c[0], setAgentId = _c[1];
    var _d = useState({ position: '', team: '', targetPlots: '', targetRevenue: '' }), info = _d[0], setInfo = _d[1];
    var _e = useState({ bonus: 'No', team: 'No', remarks: '', preparedBy: (user && user.email) || '', reviewedBy: '' }), o = _e[0], setO = _e[1];
    var _f = useState(false), busy = _f[0], setBusy = _f[1];
    useEffect(function () { return window.db.collection('presaleApplications').onSnapshot(function (s) { setApps(s.docs.map(function (d) { return Object.assign({ _id: d.id }, d.data()); })); }, function () {}); }, []);
    var agent = agents.find(function (x) { return x._id === agentId; });
    useEffect(function () { if (agent) setInfo({ position: agent.position || '', team: agent.team || '', targetPlots: agent.targetPlots || '', targetRevenue: agent.targetRevenue || '' }); }, [agentId]);
    var inp = { padding: 8, width: '100%', boxSizing: 'border-box' }, lbl = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 2 };
    var field = function (label, node) { return h('label', { style: lbl }, label, node); };
    var cur = agent ? Object.assign({}, agent, { position: info.position, team: info.team, targetPlots: num(info.targetPlots), targetRevenue: num(info.targetRevenue) }) : null;
    var f = cur ? figures(cur, apps, month) : null;
    var save = function () {
      setBusy(true);
      window.db.collection('agents').doc(agent._id).update({ position: info.position.trim(), team: info.team.trim(), targetPlots: num(info.targetPlots), targetRevenue: num(info.targetRevenue) })
        .then(function () { setToast('Agent details saved'); }).catch(function (e) { setToast(e.message || 'Could not save'); }).then(function () { setBusy(false); });
    };
    var printOne = function () { if (!printSheets([sheet(cur, f, month, o)])) setToast('Please allow pop-ups to print.'); };
    var printAll = function () {
      var parts = agents.filter(function (x) { return x.active !== false; }).map(function (x) { return sheet(x, figures(x, apps, month), month, { bonus: 'No', team: 'No', remarks: '', preparedBy: o.preparedBy, reviewedBy: o.reviewedBy }); });
      if (!parts.length) { setToast('No agents yet.'); return; }
      if (!printSheets(parts)) setToast('Please allow pop-ups to print.');
    };
    var email = function () {
      if (!agent.email) { setToast('This agent has no email address. Add it on the agent record.'); return; }
      if (!window.confirm('Email the ' + monthLabel(month) + ' report to ' + agent.name + ' (' + agent.email + ')?')) return;
      setBusy(true);
      var u = window.auth && window.auth.currentUser;
      (u ? u.getIdToken() : Promise.reject(new Error('Please log in again.'))).then(function (idToken) {
        return fetch('/api/send-ar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'agentReport', idToken: idToken, agentId: agent._id, month: month, bonus: o.bonus, team: o.team, remarks: o.remarks, preparedBy: o.preparedBy, reviewedBy: o.reviewedBy }) });
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not send the email.'); setToast('Report emailed to ' + j.to); }); })
        .catch(function (e) { setToast(e.message || 'Could not send the email.'); }).then(function () { setBusy(false); });
    };
    var yn = function (k) { return h('select', { value: o[k], onChange: function (e) { var v = e.target.value; setO(function (x) { var n = Object.assign({}, x); n[k] = v; return n; }); }, style: inp }, h('option', null, 'No'), h('option', null, 'Yes')); };
    var setI = function (k) { return function (e) { var v = e.target.value; setInfo(function (x) { var n = Object.assign({}, x); n[k] = v; return n; }); }; };
    var setOv = function (k) { return function (e) { var v = e.target.value; setO(function (x) { var n = Object.assign({}, x); n[k] = v; return n; }); }; };
    return h('div', { className: 'table-card', style: { padding: 16, marginBottom: 16 } },
      h('h3', { style: { marginTop: 0 } }, 'Monthly sales performance report'),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 } },
        field('Month', h('input', { type: 'month', value: month, onChange: function (e) { setMonth(e.target.value || monthNow()); }, style: inp })),
        field('Agent', h('select', { value: agentId, onChange: function (e) { setAgentId(e.target.value); }, style: inp }, h('option', { value: '' }, 'Choose the agent'), agents.map(function (x) { return h('option', { key: x._id, value: x._id }, x.name); })))),
      agent && h('div', { style: { marginTop: 12 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 } },
          field('Position', h('input', { value: info.position, onChange: setI('position'), style: inp })),
          field('Unit / Team', h('input', { value: info.team, onChange: setI('team'), style: inp })),
          field('Monthly target: plots', h('input', { inputMode: 'numeric', value: info.targetPlots, onChange: setI('targetPlots'), style: inp })),
          field('Monthly target: revenue (₱)', h('input', { inputMode: 'numeric', value: info.targetRevenue, onChange: setI('targetRevenue'), style: inp }))),
        h('div', { style: { marginTop: 8 } }, h('button', { className: 'btn btn-outline btn-sm', disabled: busy, onClick: save }, 'Save position, team and targets')),
        h('div', { style: { margin: '14px 0', padding: 12, background: '#f6f1e8', borderRadius: 8, lineHeight: 1.7 } },
          h('div', null, 'Plots sold in ', monthLabel(month), ': ', h('b', null, f.plots), f.tp ? ' of ' + f.tp : ''),
          h('div', null, 'Revenue generated: ', h('b', null, peso(f.revenue)), f.tr ? ' of ' + peso(f.tr) : ''),
          h('div', null, 'Quota met: ', h('b', null, f.hasTarget ? (f.quota ? 'Yes' : 'No') : 'No target set yet'))),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 } },
          field('Bonus eligible?', yn('bonus')), field('Team incentive eligible?', yn('team')),
          field('Prepared by', h('input', { value: o.preparedBy, onChange: setOv('preparedBy'), style: inp })),
          field('Reviewed by', h('input', { value: o.reviewedBy, onChange: setOv('reviewedBy'), style: inp }))),
        h('div', { style: { marginTop: 10 } }, field('Remarks', h('textarea', { value: o.remarks, onChange: setOv('remarks'), rows: 3, maxLength: 500, style: inp }))),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 } },
          h('button', { className: 'btn btn-primary', onClick: printOne }, '🖨 Print this report'),
          h('button', { className: 'btn btn-outline', disabled: busy, onClick: email }, '✉ Email to ' + agent.name))),
      h('div', { style: { marginTop: 12 } }, h('button', { className: 'btn btn-outline btn-sm', onClick: printAll }, '🖨 Print every active agent for ' + monthLabel(month) + ' (Bonus and Team Incentive print as No)')));
  }
  window.AgentReportPanel = AgentReportPanel;
})();
