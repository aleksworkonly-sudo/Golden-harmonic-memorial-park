'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccessService, TOKEN_MS, IDLE_MS, SESSION_MS } = require('../../lib/payments/access');
const { legacySummary } = require('../../lib/payments/read-model');
const { MemoryFirestore } = require('./memory-firestore');

function fixture() {
  let time = Date.parse('2026-10-31T04:00:00Z');
  const db = new MemoryFirestore({
    'presaleApplications/PS-0001': { name:'Test Buyer', email:'buyer@example.test', mobileKey:'9123456789', accessVersion:1,
      plan:'installment', years:1, totalPrice:27500, monthly:2292, status:'new', plots:[{ plotCode:'A-0001' }],
      payments:[{ amount:5000, date:time - 86400000, ref:'RC-1', method:'cash', note:'private note' }] },
    'presaleApplications/PS-0002': { name:'Other Buyer', email:'other@example.test', mobileKey:'9987654321', accessVersion:1, totalPrice:22000, payments:[] },
    'customers/c1': { authUid:'buyer', firstName:'Test', lastName:'Buyer', email:'buyer@example.test', plan:{ totalPrice:27500 }, payments:[] },
    'customers/c2': { authUid:'buyer', fullName:'Test Buyer', plan:{ totalPrice:40000 }, payments:[] },
    'customers/c3': { authUid:'other', email:'buyer@example.test', plan:{ totalPrice:10000 }, payments:[] }
  });
  const sent = [];
  const auth = { verifyIdToken: async (token, revoked) => { assert.equal(revoked,true); return { uid:token }; } };
  let failSend = false;
  const core = createAccessService({ db, auth, origin:'https://park.example.test', rateSecret:'test-only-rate-secret-32-characters',
    now:() => time, sendLink:async (mail) => { if (failSend) throw new Error('provider failure'); sent.push(mail); } });
  const request = (overrides = {}) => core.requestLink({ reference:'PS-0001', email:'buyer@example.test', requester:'test-client', ...overrides });
  const issue = async () => { await request(); return new URL(sent.at(-1).url).hash.slice('#access='.length); };
  const login = async () => core.exchange({ token:await issue(), requester:'test-client' });
  return { db, core, sent, request, issue, login, advance:(ms) => { time += ms; }, failEmail:() => { failSend = true; } };
}

test('link requests send only to the stored email and return the same generic response for mismatches', async () => {
  const { request, sent, db } = fixture();
  const valid = await request();
  assert.deepEqual(await request({ email:'attacker@example.test' }),valid);
  assert.deepEqual(await request({ reference:'PS-9999' }),valid);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'buyer@example.test');
  const secret = new URL(sent[0].url).hash.slice(8);
  assert.equal(secret.length,43);
  assert.equal(JSON.stringify([...db.records]).includes(secret),false);
  assert.equal(JSON.stringify(valid).includes('buyer@example.test'),false);
});

test('legacy unversioned contacts are not enabled implicitly; failed delivery does not disclose existence', async () => {
  const { request, db, sent, failEmail } = fixture();
  const original = db.read('presaleApplications/PS-0001');
  db.put('presaleApplications/PS-0001',{ ...original, accessVersion:undefined });
  const unversioned = await request();
  assert.equal(sent.length,0);
  db.put('presaleApplications/PS-0001',original);
  failEmail();
  assert.deepEqual(await request(),unversioned);
  assert.equal(db.count('reservationSessions'),0);
});

test('concurrent reservation requests enforce the email cap atomically', async () => {
  const { request, sent, db } = fixture();
  await Promise.all(Array.from({ length:8 },(_,i) => request({ requester:`client-${i}` })));
  assert.equal(sent.length,3);
  assert.equal(db.count('reservationAccess'),3);
  assert.ok(db.retries > 0);
});

test('requester limit also applies to nonexistent references without creating usable tokens', async () => {
  const { request, db } = fixture();
  for (let i=0;i<10;i++) await request({ reference:`PS-${String(9000+i)}` });
  await request();
  assert.equal(db.count('reservationAccess'),0);
});

test('one link permits only one concurrent exchange; stored sessions contain no raw bearer secret', async () => {
  const { core, issue, db } = fixture();
  const token = await issue();
  const results = await Promise.allSettled([core.exchange({ token, requester:'x' }),core.exchange({ token, requester:'x' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length,1);
  assert.equal(db.count('reservationSessions'),1);
  const session = results.find((r) => r.status === 'fulfilled').value;
  assert.equal(JSON.stringify([...db.records]).includes(session.secret),false);
  await assert.rejects(core.exchange({ token, requester:'x' }),{ code:'INVALID_LINK' });
});

test('expiry boundaries reject tokens, idle sessions and sessions beyond absolute lifetime', async () => {
  let f=fixture();
  let token=await f.issue(); f.advance(TOKEN_MS);
  await assert.rejects(f.core.exchange({ token, requester:'x' }),{ code:'INVALID_LINK' });
  f=fixture(); let session=await f.login(); f.advance(IDLE_MS);
  await assert.rejects(f.core.guestSummary(session),{ code:'SESSION_REQUIRED' });
  f=fixture(); session=await f.login();
  for (let elapsed=0;elapsed<SESSION_MS-IDLE_MS;elapsed+=IDLE_MS/2) { f.advance(IDLE_MS/2); await f.core.guestSummary(session); }
  f.advance(IDLE_MS);
  await assert.rejects(f.core.guestSummary(session),{ code:'SESSION_REQUIRED' });
});

test('contact change racing exchange invalidates the link', async () => {
  const { db, core, issue }=fixture();
  const token=await issue();
  db.beforeCommit=() => db.put('presaleApplications/PS-0001',{ ...db.read('presaleApplications/PS-0001'),email:'new@example.test',accessVersion:2 });
  await assert.rejects(core.exchange({ token, requester:'x' }),{ code:'INVALID_LINK' });
  assert.equal(db.count('reservationSessions'),0);
});

test('current contact fingerprint and monotonic version both revoke existing sessions', async () => {
  for (const patch of [{ email:'new@example.test' },{ accessVersion:2 },{ mobileKey:'9999999999' }]) {
    const { db, core, login }=fixture(); const session=await login();
    db.put('presaleApplications/PS-0001',{ ...db.read('presaleApplications/PS-0001'),...patch });
    await assert.rejects(core.guestSummary(session),{ code:'SESSION_REQUIRED' });
  }
});

test('a contact-version change during a read cannot return private history', async () => {
  const { db, core, login }=fixture(); const session=await login();
  db.beforeCommit=() => db.put('presaleApplications/PS-0001',{ ...db.read('presaleApplications/PS-0001'),accessVersion:2 });
  await assert.rejects(core.guestSummary(session),{ code:'SESSION_REQUIRED' });
});

test('logout revokes the server session; racing renewal never resurrects it', async () => {
  const { db, core, login }=fixture(); const session=await login();
  db.beforeCommit=() => core.logout(session);
  await assert.rejects(core.guestSummary(session),{ code:'SESSION_REQUIRED' });
  await core.logout(session);
  await assert.rejects(core.guestSummary(session),{ code:'SESSION_REQUIRED' });
});

test('guest summary is scoped to its session reservation and hides notes/contact details', async () => {
  const { core, login }=fixture(); const session=await login();
  const summary=await core.guestSummary({ ...session, reference:'PS-0002' });
  assert.equal(summary.id,'PS-0001');
  assert.equal(summary.balanceCentavos,2250000);
  assert.equal(summary.deadlineDate,null);
  assert.equal(summary.nextDueDate,null);
  assert.equal(JSON.stringify(summary).includes('private note'),false);
  assert.equal(JSON.stringify(summary).includes('example.test'),false);
  assert.equal(JSON.stringify(summary).includes('9123456789'),false);
});

test('account list supports multiple linked records but never links by matching email', async () => {
  const { core }=fixture();
  assert.deepEqual((await core.accountList({ idToken:'buyer' })).map((row) => row.id),['c1','c2']);
  await assert.rejects(core.accountSummary({ idToken:'buyer',customerId:'c3' }),{ code:'FORBIDDEN' });
  await assert.rejects(core.accountSummary({ idToken:'buyer',customerId:'missing' }),{ code:'FORBIDDEN' });
});

test('account ownership change during summary read forces reauthorization', async () => {
  const { db, core }=fixture();
  db.beforeCommit=() => db.put('customers/c1',{ ...db.read('customers/c1'),authUid:'other' });
  await assert.rejects(core.accountSummary({ idToken:'buyer',customerId:'c1' }),{ code:'FORBIDDEN' });
});

test('read model flags missing gateway credit and legacy paid flag rather than inventing money', () => {
  const gateway=legacySummary('presale','PS-0001',{ totalPrice:22000,reservationFeePaid:5000,status:'verified' });
  assert.equal(gateway.paidCentavos,0); assert.equal(gateway.balanceCentavos,null); assert.ok(gateway.warnings.length);
  const old=legacySummary('presale','PS-0001',{ totalPrice:22000,status:'paid' });
  assert.equal(old.entries.length,0); assert.equal(old.balanceCentavos,null);
  const firstOnly=legacySummary('presale','PS-0001',{ totalPrice:22000,firstInstallmentDueDate:'2026-12-01' });
  assert.equal(firstOnly.nextDueDate,null); // A historical first-due date is not the next due date.
});

test('read model preserves reversals and centavos; changed history/cross-account cursors are rejected', () => {
  const data={ plan:{ totalPrice:1000 }, payments:Array.from({ length:21 },(_,i) => ({ amount:i === 20 ? -0.25 : 1.25,date:'2026-10-31',ref:String(i) })) };
  const page=legacySummary('customer','c1',data);
  assert.equal(page.entries.length,20); assert.equal(page.entries[0].amountCentavos,-25);
  assert.equal(page.paidCentavos,2475);
  assert.equal(legacySummary('customer','c1',data,page.nextCursor).entries.length,1);
  assert.throws(() => legacySummary('customer','c2',data,page.nextCursor),{ code:'INVALID_CURSOR' });
  assert.throws(() => legacySummary('customer','c1',{ ...data,payments:[...data.payments,{ amount:1 }] },page.nextCursor),{ code:'HISTORY_CHANGED' });
});

test('general traffic cap fails closed and resets after the window', async () => {
  const { core, advance }=fixture();
  for(let i=0;i<120;i++) await core.checkTraffic('x');
  await assert.rejects(core.checkTraffic('x'),{ code:'RATE_LIMITED' });
  advance(15*60*1000); await core.checkTraffic('x');
});
