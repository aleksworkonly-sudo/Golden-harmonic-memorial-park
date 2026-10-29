// Cash payment + receipt workflow: the business rules, kept apart from HTTP so they can be tested.
// Used by api/cash-receipt.js (staff), api/receipt-verify.js (public) and api/my-receipts.js (clients).
//
// Collections (all read and written only through the server, with the Admin SDK):
//   counters/cashReceipt                 { next }           receipt number counter, only ever goes up
//   cashReceipts/{receiptNo}             the receipt        the document ID IS the receipt number, so a number can never repeat
//   cashReceipts/{receiptNo}/audit/{id}  audit trail        every create / print / photo / approve / void
//   cashReceiptPhotos/{receiptNo}        the photo of the printed receipt (compressed JPEG, base64)
//   cashReceiptRequests/{requestId}      remembers a "record payment" click so a double-click or retry returns the same receipt
//
// Status flow:  pending_verification -> paid_verified -> (void) voided
//               pending_verification -> (void) voided
// A verified payment is never edited or deleted. A void adds a NEGATIVE "reversal" entry to the account.

const crypto = require('crypto');
const { ledger } = require('./_presale-reminders');

const TZ = 'Asia/Manila';
const ST = { PENDING: 'pending_verification', PAID: 'paid_verified', VOID: 'voided' };
const PURPOSES = {
  installment: 'Monthly installment',
  down_payment: 'Down payment',
  full_payment: 'Full payment (spot cash)',
  balance: 'Balance payment',
  reservation: 'Reservation fee',
  other: 'Other'
};
const MAX_AMOUNT = 50000000;
const MAX_PHOTO_CHARS = 1100000; // base64 text; a 1280px JPEG at quality 0.75 is far below this
const DEFAULT_RULES = { commissionRate: 0.07, agentFirstShare: 0.5, brokerRate: 0.03 };

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);

const c2 = (n) => Math.round(Number(n) * 100) / 100;
function phDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function phDateTime(ms) {
  if (!ms) return '';
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms)) + ' (PH time)';
}
const pad6 = (n) => String(n).padStart(6, '0');
const receiptNoFor = (n) => 'CR-' + pad6(n);

function actorOf(user) {
  return { uid: user.uid, email: user.email || '', name: user.name || user.email || 'Staff', role: user.role || '' };
}
function maskName(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => w[0] + '***').join(' ') || '—';
}

// ---------- what an account owes ----------
// presale reservation (presaleApplications/{PS-0001})
function presaleView(id, a) {
  const L = ledger(a);
  const plots = (Array.isArray(a.plots) && a.plots.length ? a.plots : [{ plotCode: a.plotCode }]).map((p) => p.plotCode).filter(Boolean);
  const months = (a.years || 0) * 12;
  return {
    kind: 'presale', id, name: a.name || '', contact: a.mobile || '', email: a.email || '',
    accountRef: id + (plots.length ? ' · ' + plots.join(', ') : ''),
    planText: a.plan === 'installment' ? 'Monthly installment, ' + a.years + (a.years === 1 ? ' year' : ' years') + ' (₱' + (L.monthly || 0).toLocaleString('en-PH') + ' a month)' : 'Spot cash',
    plan: a.plan, total: a.totalPrice || 0, paid: c2(L.paid), balance: c2(L.balance), monthly: L.monthly || 0,
    months, nextInstallmentNo: a.plan === 'installment' ? Math.min(months || 1, L.monthsPaid + 1) : 1,
    minAmount: Math.min(L.monthly || L.balance, L.balance),
    cancelled: a.status === 'cancelled'
  };
}
// portal customer (customers/{id}); same arithmetic as customerPlanBalance() in site.jsx
function customerView(id, c) {
  const plan = c.plan || {};
  const paid = (c.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const price = Number(plan.totalPrice != null ? plan.totalPrice : plan.price) || 0;
  const monthly = Number(plan.monthlyAmount) || 0;
  const months = Number(plan.termMonths) || 0;
  const made = monthly ? Math.min(months || Infinity, Math.floor((paid + 0.5) / monthly)) : 0;
  const name = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ');
  const plot = c.blockId && c.lotNo ? c.blockId + '-' + String(c.lotNo).padStart(4, '0') : '';
  return {
    kind: 'customer', id, name, contact: c.phone || '', email: c.email || '',
    accountRef: [plot, plan.tierName].filter(Boolean).join(' · ') || ('Account ' + id.slice(0, 6)),
    planText: plan.tierName ? plan.tierName + (monthly ? ' (₱' + monthly.toLocaleString('en-PH') + ' a month)' : '') : '',
    plan: plan.termKey === 'cash' ? 'cash' : 'installment', total: price, paid: c2(paid), balance: c2(Math.max(0, price - paid)), monthly,
    months, nextInstallmentNo: monthly ? Math.min(months || 9999, made + 1) : 1, minAmount: 0.01,
    hasPlan: !!(plan && (price > 0)), cancelled: false
  };
}
const viewOf = (kind, id, data) => (kind === 'presale' ? presaleView(id, data) : customerView(id, data));
const targetKey = (kind, id) => kind + ':' + id;
const collFor = (kind) => (kind === 'presale' ? 'presaleApplications' : 'customers');

function purposeText(type, installmentNo, months, note) {
  if (!PURPOSES[type]) throw bad('Please choose what this payment is for.');
  let t = PURPOSES[type];
  if (type === 'installment' && installmentNo) t += ' #' + installmentNo + (months ? ' of ' + months : '');
  if (type === 'other' && !String(note || '').trim()) throw bad('Please describe what this payment is for.');
  if (note && String(note).trim()) t += ' — ' + String(note).trim().slice(0, 120);
  return t;
}

// ---------- allocation of a presale payment (mirrors presaleAllocOne in admin-app.js) ----------
async function loadRules(tx, db) {
  const sn = await tx.get(db.collection('presaleSettings').doc('allocation'));
  const rules = { ...DEFAULT_RULES };
  if (sn.exists) for (const k of Object.keys(DEFAULT_RULES)) if (typeof sn.data()[k] === 'number') rules[k] = sn.data()[k];
  return rules;
}
function presaleAlloc(a, amount, index, rules) {
  const amt = Number(amount) || 0;
  if (!a.agentId || index > 0) return { agent: 0, broker: 0, company: c2(amt) };
  const base = a.spotPrice || a.totalPrice || 0;
  const commission = a.agentCommission > 0 ? a.agentCommission : Math.round(base * rules.commissionRate);
  const agent = Math.min(Math.round(commission * rules.agentFirstShare), amt);
  const broker = Math.min(c2(amt * rules.brokerRate), amt - agent);
  return { agent, broker, company: c2(amt - agent - broker) };
}

// ---------- shapes sent to the browser ----------
function publicShape(r) {
  // Everything staff and the account owner may see. The photo itself is fetched separately.
  return {
    receiptNo: r.receiptNo, status: r.status, kind: r.kind, targetId: r.targetId,
    clientName: r.clientName, accountRef: r.accountRef, purpose: r.purpose, purposeType: r.purposeType,
    amount: r.amount, method: r.method,
    createdAt: r.createdAt, createdAtText: phDateTime(r.createdAt), createdBy: r.createdBy && r.createdBy.name,
    printCount: r.printCount || 0, lastPrintedAt: r.lastPrintedAt || null, hasPhoto: !!r.photoAt,
    approvedAt: r.approvedAt || null, approvedAtText: phDateTime(r.approvedAt), approvedBy: r.approvedBy && r.approvedBy.name,
    voidedAt: r.voidedAt || null, voidedAtText: phDateTime(r.voidedAt), voidedBy: r.voidedBy && r.voidedBy.name, voidReason: r.voidReason || '',
    verifyToken: r.verifyToken
  };
}
// What the public verification page may show: no address, phone, e-mail or plot.
function verifyShape(r) {
  return {
    receiptNo: r.receiptNo,
    state: r.status === ST.PAID ? 'verified' : r.status === ST.VOID ? 'voided' : 'pending',
    amount: r.amount, method: r.method, purpose: r.purpose,
    date: phDateTime(r.approvedAt || r.createdAt),
    clientMasked: maskName(r.clientName)
  };
}
function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

// ---------- operations ----------
function makeCore({ db, now = () => Date.now(), random = () => crypto.randomBytes(12).toString('hex') }) {
  const auditRef = (no) => db.collection('cashReceipts').doc(no).collection('audit').doc();
  const rcpt = (no) => db.collection('cashReceipts').doc(no);

  async function loadReceipt(tx, no) {
    const sn = await tx.get(rcpt(no));
    if (!sn.exists) throw new HttpError(404, 'Receipt ' + no + ' was not found.');
    return sn.data();
  }

  // Staff picks a client: search presale reservations and portal customers.
  async function searchClients(q) {
    const needle = String(q || '').trim().toLowerCase();
    const out = [];
    const pa = await db.collection('presaleApplications').get();
    pa.docs.forEach((d) => { const v = presaleView(d.id, d.data()); if (!v.cancelled) out.push(v); });
    const cu = await db.collection('customers').get();
    cu.docs.forEach((d) => { const v = customerView(d.id, d.data()); if (v.name) out.push(v); });
    const hay = (v) => [v.name, v.id, v.contact, v.email, v.accountRef].join(' ').toLowerCase();
    const hits = needle ? out.filter((v) => hay(v).includes(needle)) : out;
    return hits.slice(0, 40).map((v) => ({
      kind: v.kind, id: v.id, name: v.name, contact: v.contact, accountRef: v.accountRef, planText: v.planText,
      total: v.total, paid: v.paid, balance: v.balance, monthly: v.monthly, months: v.months,
      nextInstallmentNo: v.nextInstallmentNo, minAmount: v.minAmount, plan: v.plan, hasPlan: v.kind === 'presale' ? true : v.hasPlan
    }));
  }

  // 1. Record the cash payment as PENDING. Nothing about the balance changes here.
  async function createReceipt(user, body) {
    const kind = body.kind === 'customer' ? 'customer' : body.kind === 'presale' ? 'presale' : null;
    if (!kind) throw bad('Please choose the client account.');
    const id = String(body.targetId || '').trim();
    if (!id || id.includes('/')) throw bad('Please choose the client account.');
    const requestId = String(body.requestId || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw bad('Missing request id. Please reload the page and try again.');
    const amount = c2(body.amount);
    if (!(amount > 0)) throw bad('Please enter the amount received.');
    if (amount > MAX_AMOUNT) throw bad('That amount is too large. Please check it.');
    if (Math.abs(Number(body.amount) * 100 - Math.round(Number(body.amount) * 100)) > 1e-6) throw bad('The amount can have at most 2 decimal places.');

    return db.runTransaction(async (tx) => {
      const reqRef = db.collection('cashReceiptRequests').doc(requestId);
      const reqSn = await tx.get(reqRef);
      if (reqSn.exists) { // same click sent again (double-click, retry, refresh): hand back the same receipt
        const existing = await loadReceipt(tx, reqSn.data().receiptNo);
        return { receipt: existing, duplicate: true };
      }
      const tgt = await tx.get(db.collection(collFor(kind)).doc(id));
      if (!tgt.exists) throw new HttpError(404, 'That client account was not found.');
      const v = viewOf(kind, id, tgt.data());
      if (v.cancelled) throw bad('That reservation is cancelled.');
      if (kind === 'customer' && !v.hasPlan) throw bad('This customer has no payment plan yet, so a payment cannot be applied.');
      if (v.balance <= 0) throw bad('This account has no balance left to pay.');
      if (amount > v.balance + 0.005) throw bad('The amount is more than the outstanding balance (₱' + v.balance.toLocaleString('en-PH') + ').');
      if (kind === 'presale' && amount + 0.005 < v.minAmount) throw bad('The amount cannot be less than ₱' + v.minAmount.toLocaleString('en-PH') + ' (the monthly installment).');
      const type = String(body.purposeType || '');
      const instNo = type === 'installment' ? (Number(body.installmentNo) > 0 ? Math.floor(Number(body.installmentNo)) : v.nextInstallmentNo) : null;
      if (instNo && v.months && instNo > v.months) throw bad('That installment number is beyond the plan.');
      const purpose = purposeText(type, instNo, v.months, body.note);

      const counterRef = db.collection('counters').doc('cashReceipt');
      const cs = await tx.get(counterRef);
      const next = cs.exists && Number(cs.data().next) > 0 ? Number(cs.data().next) : 1;
      const receiptNo = receiptNoFor(next);
      const at = now();
      const doc = {
        receiptNo, status: ST.PENDING, kind, targetId: id, targetKey: targetKey(kind, id),
        clientName: v.name, accountRef: v.accountRef, purposeType: type, installmentNo: instNo, purpose,
        amount, method: 'Cash', createdAt: at, createdBy: actorOf(user), printCount: 0, lastPrintedAt: null,
        photoAt: null, approvedAt: null, approvedBy: null, applied: null, verifyToken: random(), requestId
      };
      tx.create(rcpt(receiptNo), doc);                       // fails if this number already exists: uniqueness is enforced by the database
      tx.set(counterRef, { next: next + 1, updatedAt: at });  // the counter only goes up, so a number is never handed out twice
      tx.set(reqRef, { receiptNo, createdAt: at, by: user.uid });
      tx.set(auditRef(receiptNo), { action: 'create', at, by: actorOf(user), details: { amount, purpose, account: doc.accountRef } });
      return { receipt: doc, duplicate: false };
    });
  }

  // 2. Printing is only recorded. It never approves the payment or touches a balance.
  async function recordPrint(user, no) {
    return db.runTransaction(async (tx) => {
      const r = await loadReceipt(tx, no);
      if (r.status === ST.VOID) throw new HttpError(409, 'This receipt was voided and cannot be printed.');
      const at = now();
      const reprint = (r.printCount || 0) >= 1;
      const count = (r.printCount || 0) + 1;
      tx.update(rcpt(no), { printCount: count, lastPrintedAt: at, lastPrintedBy: actorOf(user) });
      tx.set(auditRef(no), { action: reprint ? 'reprint' : 'print', at, by: actorOf(user), details: { printCount: count } });
      return { printCount: count, reprint, printedAt: at, printedAtText: phDateTime(at) };
    });
  }

  // 3. Photo of the printed receipt.
  async function uploadPhoto(user, no, dataUrl) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw bad('Please upload a photo (JPEG).');
    if (m[1].length > MAX_PHOTO_CHARS) throw bad('The photo is too large. Please take it again or use a smaller photo.');
    const bytes = Buffer.from(m[1], 'base64');
    if (bytes.length < 2000 || !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw bad('That file is not a valid photo.');
    return db.runTransaction(async (tx) => {
      const r = await loadReceipt(tx, no);
      if (r.status !== ST.PENDING) throw new HttpError(409, 'A photo can only be added while the payment is pending.');
      if (!(r.printCount >= 1)) throw new HttpError(409, 'Please print the receipt first, then photograph the printed copy.');
      const at = now();
      tx.set(db.collection('cashReceiptPhotos').doc(no), { receiptNo: no, mime: 'image/jpeg', data: m[1], bytes: bytes.length, uploadedAt: at, uploadedBy: actorOf(user) });
      tx.update(rcpt(no), { photoAt: at });
      tx.set(auditRef(no), { action: 'photo', at, by: actorOf(user), details: { bytes: bytes.length } });
      return { bytes: bytes.length, uploadedAt: at };
    });
  }
  async function getPhoto(no) {
    const sn = await db.collection('cashReceiptPhotos').doc(no).get();
    if (!sn.exists) throw new HttpError(404, 'No photo has been uploaded for this receipt.');
    return 'data:image/jpeg;base64,' + sn.data().data;
  }

  // 4. Confirm cash received and approve: status + account update happen together or not at all.
  async function approve(user, no, confirmed) {
    if (confirmed !== true) throw bad('Please confirm that the cash was received and the details are correct.');
    return db.runTransaction(async (tx) => {
      const r = await loadReceipt(tx, no);
      if (r.status === ST.PAID) return { receipt: r, already: true }; // second click / retry: nothing is applied twice
      if (r.status === ST.VOID) throw new HttpError(409, 'This receipt was voided.');
      if (!(r.printCount >= 1)) throw new HttpError(409, 'Print the receipt first.');
      const photo = await tx.get(db.collection('cashReceiptPhotos').doc(no));
      if (!photo.exists || !r.photoAt) throw new HttpError(409, 'Upload the photo of the printed receipt before approving.');
      const tRef = db.collection(collFor(r.kind)).doc(r.targetId);
      const tgt = await tx.get(tRef);
      if (!tgt.exists) throw new HttpError(404, 'The client account no longer exists.');
      const a = tgt.data();
      const v = viewOf(r.kind, r.targetId, a);
      if (v.cancelled) throw bad('That reservation was cancelled. Void this receipt instead.');
      if (r.amount > v.balance + 0.005) throw bad('The amount is now more than the outstanding balance (₱' + v.balance.toLocaleString('en-PH') + '). Void this receipt and record it again.');
      const rules = r.kind === 'presale' ? await loadRules(tx, db) : null;
      const plotRefs = [];
      if (r.kind === 'presale' && (a.status === 'new' || a.status === 'verified')) {
        const plots = Array.isArray(a.plots) && a.plots.length ? a.plots : [{ blockId: a.blockId, lotNo: a.lotNo }];
        for (const p of plots) if (p.blockId && p.lotNo) {
          const pr = db.collection('plots').doc(p.blockId + '_' + p.lotNo);
          const ps = await tx.get(pr);
          if (ps.exists) plotRefs.push(pr);
        }
      }
      const at = now();
      let applied;
      if (r.kind === 'customer') {
        const entry = {
          date: phDate(at), amount: r.amount, method: 'Cash', receiptNo: no, cashReceipt: true,
          note: 'Cash receipt ' + no + ' — ' + r.purpose + '. Approved by ' + user.name
        };
        const list = Array.isArray(a.payments) ? a.payments.slice() : [];
        applied = { index: list.length };
        list.push(entry);
        tx.update(tRef, { payments: list });
      } else {
        const list = Array.isArray(a.payments) ? a.payments.slice() : [];
        const index = list.length;
        const alloc = presaleAlloc(a, r.amount, index, rules);
        const entry = { amount: r.amount, date: at, ref: no, method: 'cash', remarks: r.purpose, by: user.email || user.name, cashReceipt: no, alloc: { ...alloc, rates: { ...rules } } };
        list.push(entry);
        applied = { index };
        const patch = { payments: list };
        if (a.status === 'new' || a.status === 'verified') {
          patch.status = 'paid';
          patch.paymentConfirmedAt = a.paymentConfirmedAt || at;
          patch.confirmedBy = user.email || user.name;
          patch.paymentReference = a.paymentReference || no;
        }
        tx.update(tRef, patch);
        plotRefs.forEach((pr) => tx.update(pr, { hold: false }));
      }
      tx.update(rcpt(no), { status: ST.PAID, approvedAt: at, approvedBy: actorOf(user), applied });
      tx.set(auditRef(no), { action: 'approve', at, by: actorOf(user), details: { amount: r.amount, account: r.accountRef, balanceBefore: v.balance, balanceAfter: c2(v.balance - r.amount) } });
      return { receipt: { ...r, status: ST.PAID, approvedAt: at, approvedBy: actorOf(user), applied }, already: false, balanceAfter: c2(v.balance - r.amount) };
    });
  }

  // Corrections: void with a reason. A verified payment gets a NEGATIVE reversal entry; the original entry stays.
  async function voidReceipt(user, no, reason) {
    const why = String(reason || '').trim();
    if (why.length < 5) throw bad('Please write the reason for voiding (at least 5 characters).');
    return db.runTransaction(async (tx) => {
      const r = await loadReceipt(tx, no);
      if (r.status === ST.VOID) return { receipt: r, already: true };
      const at = now();
      if (r.status === ST.PAID) {
        const tRef = db.collection(collFor(r.kind)).doc(r.targetId);
        const tgt = await tx.get(tRef);
        if (!tgt.exists) throw new HttpError(404, 'The client account no longer exists.');
        const a = tgt.data();
        const list = Array.isArray(a.payments) ? a.payments.slice() : [];
        if (r.kind === 'customer') {
          list.push({ date: phDate(at), amount: -r.amount, method: 'Cash', receiptNo: no, reversalOf: no, cashReceipt: true, note: 'Reversal of cash receipt ' + no + ': ' + why + ' (by ' + user.name + ')' });
        } else {
          const orig = list.find((x) => x.cashReceipt === no && !x.reversalOf);
          const oa = (orig && orig.alloc) || { agent: 0, broker: 0, company: r.amount };
          list.push({ amount: -r.amount, date: at, ref: no + '-VOID', method: 'cash', remarks: 'Reversal of ' + no + ': ' + why, by: user.email || user.name, cashReceipt: no, reversalOf: no, alloc: { agent: -(oa.agent || 0), broker: -(oa.broker || 0), company: -(oa.company || 0), rates: oa.rates } });
        }
        tx.update(tRef, { payments: list });
      }
      tx.update(rcpt(no), { status: ST.VOID, voidedAt: at, voidedBy: actorOf(user), voidReason: why, reversalApplied: r.status === ST.PAID, statusBeforeVoid: r.status });
      tx.set(auditRef(no), { action: 'void', at, by: actorOf(user), details: { reason: why, wasVerified: r.status === ST.PAID, amount: r.amount } });
      return { receipt: { ...r, status: ST.VOID, voidedAt: at, voidedBy: actorOf(user), voidReason: why }, already: false };
    });
  }

  async function getReceipt(no) {
    const sn = await rcpt(no).get();
    if (!sn.exists) throw new HttpError(404, 'Receipt ' + no + ' was not found.');
    return sn.data();
  }
  async function listReceipts({ status, q, limit = 200 } = {}) {
    const sn = await db.collection('cashReceipts').orderBy('createdAt', 'desc').limit(500).get();
    const needle = String(q || '').trim().toLowerCase();
    let rows = sn.docs.map((d) => d.data());
    if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
    if (needle) rows = rows.filter((r) => [r.receiptNo, r.clientName, r.accountRef, r.purpose].join(' ').toLowerCase().includes(needle));
    return rows.slice(0, limit);
  }
  async function auditOf(no) {
    const sn = await rcpt(no).collection('audit').get();
    return sn.docs.map((d) => d.data()).sort((x, y) => x.at - y.at);
  }
  async function receiptsForTarget(kind, id) {
    const sn = await db.collection('cashReceipts').where('targetKey', '==', targetKey(kind, id)).get();
    return sn.docs.map((d) => d.data()).filter((r) => r.status === ST.PAID).sort((x, y) => y.approvedAt - x.approvedAt);
  }
  return { searchClients, createReceipt, recordPrint, uploadPhoto, getPhoto, approve, voidReceipt, getReceipt, listReceipts, auditOf, receiptsForTarget };
}

module.exports = { makeCore, HttpError, ST, PURPOSES, publicShape, verifyShape, sameToken, phDateTime, phDate, maskName, receiptNoFor, presaleAlloc, viewOf };
