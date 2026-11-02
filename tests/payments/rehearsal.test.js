'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest, validateSnapshot, sealSnapshot, verifyBackup, restoreRehearsal } = require('../../lib/payments/rehearsal-snapshot');
const { inventory, planMigration, applyRehearsal } = require('../../lib/payments/migration-rehearsal');
const { auditRelease } = require('../../lib/payments/release-audit');
const { operationsFixture } = require('./operations-fixture');
const { MemoryFirestore } = require('./memory-firestore');
const { reserveReference } = require('../../lib/payments/presale-reference');
const { createGuard, assertLegacy } = require('../../payment-legacy-guard');

function fixture() {
  const snapshot = {schemaVersion:1,capturedAt:Date.parse('2026-11-02T04:00:00Z'),documents:[
    {path:'customers/legacy-1',data:{authUid:'buyer',plan:{totalPrice:25000,monthlyAmount:2000},payments:[{amount:5000,date:'2026-10-01',ref:'BANK-001',alloc:{agent:100}}]}},
    {path:'plots/A_1',data:{customerId:'legacy-1',status:'reserved',hold:true}}
  ]};
  const decisions = {schemaVersion:1,sources:[{sourcePath:'customers/legacy-1',sourceHash:digest(snapshot.documents[0].data),
    reviewReference:'synthetic-review-001',totalCentavos:2500000,openingCreditCentavos:500000,
    items:[{plotId:'A_1',totalCentavos:2500000,creditCentavos:500000}]}]};
  return {snapshot,decisions};
}
const snapshotOf = (f) => ({schemaVersion:1,capturedAt:f.time,documents:[...f.db.records].map(([path,data]) => ({path,data}))});

test('portable snapshot hashes are stable and reject duplicates, unsupported values and tampering', () => {
  assert.equal(digest({b:2,a:1}),digest({a:1,b:2}));
  const {snapshot} = fixture(), backup = sealSnapshot(snapshot);
  assert.deepEqual(verifyBackup(backup),validateSnapshot(snapshot));
  backup.snapshot.documents[0].data.plan.totalPrice++;
  assert.throws(() => verifyBackup(backup),{code:'BACKUP_INTEGRITY'});
  assert.throws(() => validateSnapshot({...snapshot,documents:[...snapshot.documents,snapshot.documents[0]]}),{code:'SNAPSHOT_INVALID'});
  assert.throws(() => digest({a:undefined}),{code:'SNAPSHOT_INVALID'});
  assert.throws(() => digest(JSON.parse('{"__proto__":{}}')),{code:'SNAPSHOT_INVALID'});
});

test('restore requires an empty isolated target or identical state; newer money is preserved', () => {
  const {snapshot} = fixture(), backup = sealSnapshot(snapshot), empty = {...snapshot,documents:[]};
  const restored = restoreRehearsal(backup,empty);
  assert.deepEqual(restoreRehearsal(backup,restored),restored);
  const changed = structuredClone(restored);changed.documents[0].data.payments.push({amount:100,date:'2026-11-02'});
  const before = digest(changed);
  assert.throws(() => restoreRehearsal(backup,changed),{code:'RESTORE_CONFLICT'});assert.equal(digest(changed),before);
  assert.throws(() => restoreRehearsal(backup,{...empty,documents:[snapshot.documents[0]]}),{code:'RESTORE_CONFLICT'});
  assert.throws(() => restoreRehearsal(backup,{...empty,documents:[{path:'receipts/new-payment',data:{amount:100}}]}),{code:'RESTORE_CONFLICT'});
});

test('legacy inventory flags invented credit, provider overlap, duplicates, missing ownership and signed history', () => {
  for (const change of [d=>{d.status='paid';d.payments=[];},d=>{d.reservationFeePaid=5000;},d=>{d.payments.push(d.payments[0]);},
    d=>{delete d.authUid;},d=>{d.payments[0].amount=-100;},d=>{d.paymentSubmissions=[{status:'pending'}];},d=>{d.payments[0].date='2026-02-30';}]) {
    const {snapshot,decisions} = fixture();change(snapshot.documents[0].data);decisions.sources[0].sourceHash=digest(snapshot.documents[0].data);
    assert.ok(inventory(snapshot).sources[0].issues.length);assert.throws(()=>planMigration(snapshot,decisions),{code:'MIGRATION_REVIEW'});
  }
});

test('migration draft preserves original credit, allocations and terms without posting or replaying historical money', () => {
  const {snapshot,decisions} = fixture(), original = digest(snapshot), plan = planMigration(snapshot,decisions);
  assert.deepEqual(planMigration(snapshot,decisions),plan);assert.equal(plan.readyForProduction,false);
  const output = applyRehearsal(snapshot,plan), booking = output.documents.find(r=>r.path.startsWith('bookings/')).data;
  assert.equal(booking.openingCreditCentavos,500000);assert.equal(booking.balanceCentavos,2000000);assert.equal(booking.monthlyCentavos,200000);
  assert.equal(booking.postingEnabled,false);assert.equal(booking.lifecycleEnabled,false);assert.equal(booking.legacyWritesBlocked,false);
  assert.equal(output.documents.filter(r=>r.path.startsWith('ledgerEntries/')).length,1);
  assert.equal(output.documents.find(r=>r.path.startsWith('ledgerEntries/')).data.allocations[0].centavos,500000);
  assert.ok(!output.documents.some(r=>/^(receipts|economicPayments|emailOutbox|notifications)\//.test(r.path)));
  assert.deepEqual(output.documents.find(r=>r.path.startsWith('paymentMigrationSnapshots/')).data.source,snapshot.documents[0].data);
  assert.equal(digest(snapshot),original);assert.equal(auditRelease(output).readyForProduction,false);
});

test('migration refuses changed full snapshots, output collisions, wrong plots and changed item allocations', () => {
  const {snapshot,decisions} = fixture(), plan = planMigration(snapshot,decisions);
  const changed = structuredClone(snapshot);changed.documents.push({path:'payments/new',data:{status:'pending_verification'}});
  assert.throws(()=>applyRehearsal(changed,plan),{code:'MIGRATION_CONFLICT'});
  assert.throws(()=>applyRehearsal(snapshot,{...plan,planHash:'changed'}),{code:'MIGRATION_CONFLICT'});
  for (const mutate of [f=>{f.snapshot.documents[1].data.customerId='another';},f=>{f.decisions.sources[0].items[0].creditCentavos=499999;},
    f=>{f.snapshot.documents.push({path:plan.writes.find(w=>w.path.startsWith('bookings/')).path,data:{existing:true}});}]) {
    const f=fixture();mutate(f);assert.throws(()=>planMigration(f.snapshot,f.decisions));
  }
});

test('migration requires exact plot coverage and rejects dual ownership and inconsistent declared plots', () => {
  for(const mutate of [
    f=>f.snapshot.documents.push({path:'plots/A_2',data:{customerId:'legacy-1',status:'reserved'}}),
    f=>{f.snapshot.documents[1].data.presaleRef='PS-OTHER';},
    f=>{f.snapshot.documents[0].data.plots=[{blockId:'A',lotNo:2}];f.decisions.sources[0].sourceHash=digest(f.snapshot.documents[0].data);}
  ]){const f=fixture();mutate(f);assert.throws(()=>planMigration(f.snapshot,f.decisions),{code:'MIGRATION_REVIEW'});}
});

test('release audit reconciles real fixture receipts and cannot assert production readiness', async () => {
  const f=operationsFixture();await f.paid();const snapshot=snapshotOf(f), report=auditRelease(snapshot);
  assert.deepEqual(report.findings,[]);assert.equal(report.localDataChecksPassed,true);assert.equal(report.readyForProduction,false);
  assert.ok(report.gates.every(g=>g.status==='unverified'));
  const receipt=snapshot.documents.find(r=>r.path.startsWith('receipts/'));receipt.data.receivedCentavos++;
  assert.ok(auditRelease(snapshot).findings.some(r=>r.code==='RECEIPT_LEDGER_MISMATCH'));
});

test('release audit detects orphan money, changed plots, held money and ambiguous external actions', async () => {
  const f=operationsFixture();await f.paid();const snapshot=snapshotOf(f);
  snapshot.documents.find(r=>r.path==='plots/c1_plot1').data.paymentBookingId='wrong';
  snapshot.documents.push({path:'receipts/orphan',data:{receiptId:'orphan'}},{path:'emailOutbox/ambiguous',data:{state:'uncertain'}},
    {path:'paymentReconciliations/held',data:{state:'open',fundsConfirmed:true}});
  const codes=auditRelease(snapshot).findings.map(f=>f.code);
  for(const code of ['PLOT_BINDING','ORPHAN_RECEIPT','EMAIL_INVESTIGATION','HELD_MONEY_REVIEW'])assert.ok(codes.includes(code));
});

test('release audit catches shifted item credit and unmatched provider funds outside a booking', async () => {
  const f=operationsFixture();await f.paid();const snapshot=snapshotOf(f),b=snapshot.documents.find(r=>r.path==='bookings/booking-c1').data;
  b.items[0].creditCentavos-=100;b.items[1].creditCentavos+=100;
  snapshot.documents.push({path:'economicPayments/unmatched',data:{state:'held'}},{path:'providerEvents/unmatched',data:{state:'needs_reconciliation'}});
  const codes=auditRelease(snapshot).findings.map(r=>r.code);
  for(const code of ['ITEM_CREDIT_MISMATCH','HELD_ECONOMIC_MONEY','UNMATCHED_PROVIDER_EVIDENCE'])assert.ok(codes.includes(code));
});

test('offline CLI never overwrites an existing output and does not load credential-dependent services', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gh-cp9-')),input=path.join(dir,'source.json'),out=path.join(dir,'backup.json');
  fs.writeFileSync(input,JSON.stringify(fixture().snapshot));
  const cli=path.resolve(__dirname,'../../scripts/payments/rehearse.cjs');
  const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',env:{...process.env,FIREBASE_SERVICE_ACCOUNT_B64:'INVALID-NOT-TO-BE-READ'}});
  assert.equal(run('backup',input,out).status,0);const before=fs.readFileSync(out,'utf8');
  assert.equal(run('backup',input,out).status,1);assert.equal(fs.readFileSync(out,'utf8'),before);
  assert.equal(run('verify',out).status,0);
  for(const file of [input,out])fs.unlinkSync(file);fs.rmdirSync(dir);
});

test('stale or malformed reservation counters never overwrite existing sources', async () => {
  for(const data of [{canonicalBookingId:'protected'},{legacy:true}]){
    const db=new MemoryFirestore({'presaleApplications/PS-0001':data});
    await assert.rejects(db.runTransaction(async tx=>reserveReference(tx,db,await tx.get(db.collection('counters').doc('presale')))),{code:'REFERENCE_REVIEW'});
    assert.deepEqual(db.read('presaleApplications/PS-0001'),data);assert.equal(db.count('plots'),0);
  }
  for(const n of [-1,'1',1.2,999999]){
    const db=new MemoryFirestore({'counters/presale':{n}});
    await assert.rejects(db.runTransaction(async tx=>reserveReference(tx,db,await tx.get(db.collection('counters').doc('presale')))),{code:'REFERENCE_REVIEW'});
  }
});

test('concurrent reservation reference creation retries to distinct identities', async () => {
  const db=new MemoryFirestore({'counters/presale':{n:0}});
  const create=()=>db.runTransaction(async tx=>{const counter=db.collection('counters').doc('presale');const r=await reserveReference(tx,db,await tx.get(counter));tx.update(counter,{n:r.number});tx.create(r.reference,{ref:r.id});return r.id;});
  assert.deepEqual((await Promise.all([create(),create()])).sort(),['PS-0001','PS-0002']);assert.equal(db.read('counters/presale').n,2);
});

test('legacy edits check fresh markers on transaction retry and staff cannot record money', async () => {
  const db=new MemoryFirestore({'customers/c1':{authUid:'buyer'},'users/admin':{role:'admin'},'users/staff':{role:'staff'}});
  let uid='admin';const guard=createGuard({db,currentUser:()=>({uid})});
  db.beforeCommit=d=>d.put('customers/c1',{authUid:'buyer',canonicalBookingId:'protected'});
  await assert.rejects(guard.update('customers','c1',{payments:[]}),/protected payment/);
  assert.equal(db.read('customers/c1').payments,undefined);
  db.put('customers/c1',{authUid:'buyer'});uid='staff';await assert.rejects(guard.update('customers','c1',{payments:[]}),/Only an admin/);
  uid='buyer';await guard.update('customers','c1',{paymentSubmissions:[]},{ownerSubmission:true});
  await assert.rejects(guard.update('customers','c1',{payments:[]},{ownerSubmission:true}),/cannot submit/);
  uid=undefined;db.put('customers/c1',{});await assert.rejects(guard.update('customers','c1',{paymentSubmissions:[]},{ownerSubmission:true}),/cannot submit/);
});

test('legacy guards reject marker removal, financial trash restore and owner changes; contact version advances atomically', async () => {
  assert.throws(()=>assertLegacy({'canonicalBookingId.hidden':null}),/protected payment/);
  const db=new MemoryFirestore({'users/admin':{role:'admin'},'presaleApplications/p1':{email:'old@example.test',accessVersion:2}});
  const guard=createGuard({db,currentUser:()=>({uid:'admin'})});
  assert.throws(()=>guard.assertTrashCollection('customers'),/backup\/restore/);
  await guard.update('presaleApplications','p1',{email:'new@example.test'});assert.equal(db.read('presaleApplications/p1').accessVersion,3);
  await guard.update('presaleApplications','p1',{email:'old@example.test'});assert.equal(db.read('presaleApplications/p1').accessVersion,4);
  await assert.rejects(guard.update('presaleApplications','p1',{accessVersion:1}),/managed/);
  db.put('users/admin',{role:'admin',disabled:true});await assert.rejects(guard.update('presaleApplications','p1',{payments:[]}),/Only an admin/);
  await assert.rejects(guard.setPlot('A_3',{}),/Only an admin/);
});

test('plot operations inspect linked owner markers, including a plot without canonical lock fields', async () => {
  const db=new MemoryFirestore({'users/admin':{role:'admin'},'customers/c1':{canonicalBookingId:'protected'},'plots/A_1':{customerId:'c1'}});
  const guard=createGuard({db,currentUser:()=>({uid:'admin'})});
  await assert.rejects(guard.removePlot('A_1'),/protected payment/);
  await assert.rejects(guard.setPlot('A_2',{customerId:'c1'}),/protected payment/);
  assert.equal(db.count('plots'),1);
});

test('legacy cancellation and commission attachment cannot leave partial financial side effects', async () => {
  const db=new MemoryFirestore({'users/admin':{role:'admin'},'presaleApplications/PS-0001':{status:'new',plots:[{blockId:'A',lotNo:1},{blockId:'A',lotNo:2}]},
    'presaleApplications/PS-OTHER':{status:'new'},'plots/A_1':{presaleRef:'PS-0001',hold:true},'plots/A_2':{presaleRef:'PS-OTHER',hold:true}});
  const guard=createGuard({db,currentUser:()=>({uid:'admin'})});
  await assert.rejects(guard.updatePresaleWithPlots('PS-0001',{status:'cancelled'},'cancel'),/assignment changed/);
  assert.equal(db.read('presaleApplications/PS-0001').status,'new');assert.equal(db.count('plots'),2);
  db.put('plots/A_2',{presaleRef:'PS-0001',hold:true});
  await guard.updatePresaleWithPlots('PS-0001',{status:'cancelled'},'cancel');assert.equal(db.count('plots'),0);
  db.beforeCommit=d=>d.put('presaleApplications/PS-0001',{...d.read('presaleApplications/PS-0001'),paymentMigrationLock:'review'});
  await assert.rejects(guard.attachCommission('PS-0001',{commission:100},{agentId:'agent'}),/protected payment/);
  assert.equal(db.count('agentCommissions'),0);
});
