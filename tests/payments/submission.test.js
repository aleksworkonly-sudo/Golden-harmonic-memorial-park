'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { randomBytes, createHash } = require('node:crypto');
const { fixture } = require('./submission-fixture');
const { createSubmissionService, scopeKey } = require('../../lib/payments/submission');
const { validateProof, DOCUMENT_BYTES } = require('../../lib/payments/proof-image');

test('proof pipeline decodes real images, strips metadata and bounds input, output and pixels', async () => {
  for (const format of ['png','jpeg','webp']) {
    const raw = await sharp({create:{width:500,height:800,channels:3,background:'#eee'}})[format]().withMetadata({exif:{IFD0:{Copyright:'private metadata'}}}).toBuffer();
    const proof = await validateProof(raw.toString('base64'));
    assert.equal(proof.mime,'image/jpeg'); assert.equal(proof.width,500); assert.equal(proof.height,800);
    const meta = await sharp(Buffer.from(proof.base64,'base64')).metadata(); assert.equal(meta.exif,undefined);
  }
  for (const invalid of ['AAAA=','a'.repeat(800000),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>').toString('base64')]) {
    await assert.rejects(validateProof(invalid),{code:'INVALID_IMAGE'});
  }
  for (const size of [20,4100]) {
    const raw = await sharp({create:{width:size,height:size,channels:3,background:'white'}}).png().toBuffer();
    await assert.rejects(validateProof(raw.toString('base64')),{code:'INVALID_IMAGE'});
  }
  const png = Buffer.from((await fixture().command()).image,'base64');
  await assert.rejects(validateProof(png.subarray(0,png.length-50).toString('base64')),{code:'INVALID_IMAGE'});
});

test('submission saves atomic private evidence and a pending case, with no financial side effects', async () => {
  const f=fixture(); const before=f.db.read('customers/c1'); const result=await f.core.submit(f.account,await f.command());
  assert.equal(result.status,'pending_verification');
  const p=f.db.read(`payments/${result.paymentId}`); assert.equal(p.postingReady,false); assert.equal(p.schemaVersion,3);
  assert.deepEqual(f.db.read('customers/c1'),before); assert.equal(f.db.count('ledgerEntries'),0); assert.equal(f.db.count('receipts'),0);
  assert.equal(f.db.count('economicPayments'),0); assert.equal(f.db.count('emailOutbox'),0);
  const evidence=f.db.read(`paymentProofs/${p.proofId}`);
  assert.ok(evidence.chargedBytes<=DOCUMENT_BYTES); assert.equal(f.db.read('paymentProofBudget/manual').usedBytes,evidence.chargedBytes);
  assert.equal(f.db.count('notifications'),1); assert.equal(f.db.count('auditLogs'),1);
  const list=await f.core.list(f.account); assert.equal(list.cases.length,1);
  assert.equal(JSON.stringify(list).includes(evidence.base64),false); assert.equal(JSON.stringify(list).includes('actor'),false);
  assert.equal((await f.core.proof(f.account,result.paymentId,result.revisionId)).base64,evidence.base64);
});

test('concurrent identical retries and changed-payload retry charge storage once', async () => {
  const f=fixture(); const cmd=await f.command();
  const results=await Promise.all([f.core.submit(f.account,cmd),f.core.submit(f.account,cmd)]);
  assert.equal(results[0].paymentId,results[1].paymentId); assert.equal(f.db.count('paymentProofs'),1);
  await assert.rejects(f.core.submit(f.account,{...cmd,reference:'different'}),{code:'IDEMPOTENCY_CONFLICT'});
  assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,1);
});

test('correction keeps old evidence/reference and stable case; amount mismatch never changes quote', async () => {
  const f=fixture(); const first=await f.core.submit(f.account,await f.command());
  const old=f.db.read(`paymentProofs/${first.paymentId}_r1`);
  const corrected=await f.core.submit(f.account,await f.command({requestId:'request-0000000002',paymentId:first.paymentId,expectedVersion:1,reference:'  000NEW  ',claimedCentavos:490000}));
  assert.equal(corrected.paymentId,first.paymentId); assert.equal(corrected.version,2); assert.deepEqual(f.db.read(`paymentProofs/${first.paymentId}_r1`),old);
  const p=f.db.read(`payments/${first.paymentId}`); assert.equal(p.reference,'000NEW'); assert.equal(p.quote.expectedAmountCentavos,500000); assert.equal(p.mismatch,true);
  assert.equal(f.db.count('referenceClaims'),2); assert.equal(f.db.count(`payments/${first.paymentId}/revisions`),2);
  assert.equal(f.db.read(`paymentSubmissionScopes/${f.key}`).openCases,1);
  assert.ok((await f.core.proof(f.account,first.paymentId,'r1')).base64);
  await assert.rejects(f.core.submit(f.account,await f.command({requestId:'request-0000000003',paymentId:first.paymentId,expectedVersion:1})),{code:'STALE_SUBMISSION'});
});

test('other account, forged scope, revoked user and wrong guest cannot submit or guess proofs', async () => {
  const f=fixture(); const cmd=await f.command(); const saved=await f.core.submit(f.account,cmd);
  await assert.rejects(f.core.context({...f.account,idToken:'other'}),{code:'FORBIDDEN'});
  await assert.rejects(f.core.submit({...f.account,idToken:'revoked'},cmd),{code:'UNAUTHENTICATED'});
  await assert.rejects(f.core.submit(f.account,{...cmd,receivedCentavos:500000}),{code:'INVALID_COMMAND'});
  await assert.rejects(f.core.proof({...f.account,customerId:'c2'},saved.paymentId,'r1'),{code:'NOT_FOUND'});
  await assert.rejects(f.core.proof(f.guest,saved.paymentId,'r1'),{code:'NOT_FOUND'});
  await assert.rejects(f.core.submit({...f.guest,secret:'q'.repeat(43)},cmd),{code:'SESSION_REQUIRED'});
  const g=await f.core.submit(f.guest,await f.command({requestId:'request-guest-0001'}));
  assert.ok((await f.core.proof(f.guest,g.paymentId,'r1')).base64);
});

test('ownership/contact changes during decoding and commit are rechecked', async () => {
  for (const guest of [false,true]) {
    const f=fixture(); const core=createSubmissionService({db:f.db,auth:f.auth,now:()=>f.time,decode:async (image) => {
      const proof=await validateProof(image);
      f.db.beforeCommit=(db)=> guest ? db.put('presaleApplications/PS-0001',{...db.read('presaleApplications/PS-0001'),accessVersion:2})
        : db.put('customers/c1',{...db.read('customers/c1'),authUid:'other'});
      return proof;
    }});
    await assert.rejects(core.submit(guest ? f.guest : f.account,await f.command()),{code:guest ? 'SESSION_REQUIRED' : 'FORBIDDEN'});
    assert.equal(f.db.count('paymentProofs'),0); assert.equal(f.db.read('paymentProofBudget/manual').usedBytes,0);
  }
});

test('current quote, recipient, cancellation and verification races fail closed', async () => {
  for (const mutation of ['quote','recipient','cancelled','verified']) {
    const f=fixture(); let cmd=await f.command();
    if (mutation==='verified') {const saved=await f.core.submit(f.account,cmd);cmd={...cmd,requestId:'request-0000000002',paymentId:saved.paymentId,expectedVersion:1};}
    const core=createSubmissionService({db:f.db,auth:f.auth,now:()=>f.time,decode:async (image)=> {
      const proof=await validateProof(image); f.db.beforeCommit=(db)=> {
        if(mutation==='quote') db.put(`paymentSubmissionScopes/${f.key}`,{...db.read(`paymentSubmissionScopes/${f.key}`),version:2});
        if(mutation==='recipient') db.put('paymentReceivingAccounts/demo-bank',{...db.read('paymentReceivingAccounts/demo-bank'),enabled:false});
        if(mutation==='cancelled') db.put('customers/c1',{...db.read('customers/c1'),status:'cancelled'});
        if(mutation==='verified') db.put(`payments/${cmd.paymentId}`,{...db.read(`payments/${cmd.paymentId}`),status:'verified',version:2});
      }; return proof;
    }});
    await assert.rejects(core.submit(f.account,cmd),{code:mutation==='verified'?'STALE_SUBMISSION':'STALE_QUOTE'});
    assert.equal(f.db.count('paymentProofs'),mutation==='verified'?1:0);
  }
});

test('failed commit leaves no proof, counter, reference or notification and exact retry succeeds', async () => {
  const f=fixture(); const cmd=await f.command();
  const core=createSubmissionService({db:f.db,auth:f.auth,now:()=>f.time,decode:async(image)=>{const p=await validateProof(image);f.db.failNextCommit=true;return p;}});
  await assert.rejects(core.submit(f.account,cmd),/Simulated commit failure/);
  for(const collection of ['paymentProofs','payments','referenceClaims','notifications','submissionOperationKeys']) assert.equal(f.db.count(collection),0);
  assert.equal(f.db.read('paymentProofBudget/manual').usedBytes,0);
  assert.ok(await f.core.submit(f.account,cmd));
});

test('last storage allocation and open-case slot cannot be overspent concurrently', async () => {
  for(const cap of ['storage','cases']) {
    const f=fixture(); const cmd=await f.command();
    if(cap==='storage') f.db.put('paymentProofBudget/manual',{usedBytes:0,limitBytes:7500});
    else f.db.put(`paymentSubmissionScopes/${f.key}`,{...f.db.read(`paymentSubmissionScopes/${f.key}`),openCases:4});
    const results=await Promise.allSettled([f.core.submit(f.account,cmd),f.core.submit(f.account,{...cmd,requestId:'request-0000000002'})]);
    assert.equal(results.filter((r)=>r.status==='fulfilled').length,1,cap); assert.equal(f.db.count('paymentProofs'),1);
  }
});

test('missing budget, daily/revision caps and future dates reject without changes', async () => {
  const f=fixture(); const cmd=await f.command();
  f.db.records.delete('paymentProofBudget/manual'); await assert.rejects(f.core.submit(f.account,cmd),{code:'STORAGE_UNAVAILABLE'});
  f.db.put('paymentProofBudget/manual',{usedBytes:0,limitBytes:100000});
  f.db.put(`paymentSubmissionScopes/${f.key}`,{...f.db.read(`paymentSubmissionScopes/${f.key}`),dayCount:10});
  await assert.rejects(f.core.submit(f.account,cmd),{code:'SUBMISSION_LIMIT'});
  await assert.rejects(f.core.submit(f.account,{...cmd,transferDate:'2026-11-01'}),{code:'INVALID_DATE'});
  f.db.put(`paymentSubmissionScopes/${f.key}`,{...f.db.read(`paymentSubmissionScopes/${f.key}`),dayCount:0});
  const saved=await f.core.submit(f.account,cmd);const path=`payments/${saved.paymentId}`;f.db.put(path,{...f.db.read(path),version:10,evidenceRevisionCount:10});
  await assert.rejects(f.core.submit(f.account,{...cmd,requestId:'request-0000000002',paymentId:saved.paymentId,expectedVersion:10}),{code:'SUBMISSION_LIMIT'});
});

test('pending reference observations cannot squat on another genuine submission', async () => {
  const f=fixture(); const cmd=await f.command();
  await f.core.submit(f.account,cmd); await f.core.submit(f.guest,cmd);
  assert.equal(f.db.count('referenceClaims'),2); assert.equal(f.db.count('economicPayments'),0);
  const accountList=await f.core.list(f.account); const guestList=await f.core.list(f.guest);
  assert.equal(accountList.cases.length,1); assert.equal(guestList.cases.length,1);
  assert.notEqual(accountList.cases[0].paymentId,guestList.cases[0].paymentId);
});

test('bounded stable list cursors exclude revision subcollections and other scopes', async () => {
  const f=fixture(); const saved=await f.core.submit(f.account,await f.command());const p=f.db.read(`payments/${saved.paymentId}`);
  for(let i=0;i<24;i++) f.db.put(`payments/item${i}`,{...p,paymentId:`item${i}`,submittedAt:f.time+i});
  const page1=await f.core.list(f.account);assert.equal(page1.cases.length,20);
  const page2=await f.core.list(f.account,page1.nextCursor);assert.equal(page2.cases.length,5);assert.equal(page2.nextCursor,null);
  assert.equal(new Set([...page1.cases,...page2.cases].map((row)=>row.paymentId)).size,25);
  await assert.rejects(f.core.list(f.guest,page1.nextCursor),{code:'INVALID_CURSOR'});
  const invalid=Buffer.from(JSON.stringify({scope:scopeKey('customer','c1'),at:1,id:'../oops'})).toString('base64url');
  await assert.rejects(f.core.list(f.account,invalid),{code:'INVALID_ID'});
});

test('decoded image that grows past the encoded storage cap is rejected instead of silently blurred', async () => {
  const raw = await sharp(randomBytes(1500*1500*3),{raw:{width:1500,height:1500,channels:3}}).jpeg({quality:15}).toBuffer();
  assert.ok(raw.length < 512*1024);
  await assert.rejects(validateProof(raw.toString('base64')),{code:'IMAGE_TOO_LARGE'});
});

test('revocation racing private proof retrieval prevents delivery', async () => {
  const f=fixture();const saved=await f.core.submit(f.guest,await f.command());
  const path=`reservationSessions/${createHash('sha256').update(f.guest.secret).digest('hex')}`;
  f.db.beforeCommit=(db)=>db.put(path,{...db.read(path),revokedAt:f.time});
  await assert.rejects(f.core.proof(f.guest,saved.paymentId,'r1'),{code:'SESSION_REQUIRED'});
});

test('GCash instructions are server-owned snapshots; old quote corrections need office review', async () => {
  const f=fixture();const path='paymentReceivingAccounts/demo-bank';
  f.db.put(path,{...f.db.read(path),channel:'gcash',label:'Demo GCash — sample only'});
  const saved=await f.core.submit(f.account,await f.command());
  assert.equal((await f.core.list(f.account)).cases[0].quote.channel,'gcash');
  f.db.put(path,{...f.db.read(path),version:2,accountNumber:'DIFFERENT-DEMO'});
  const terms=f.db.read(`paymentSubmissionScopes/${f.key}`);
  f.db.put(`paymentSubmissionScopes/${f.key}`,{...terms,version:2,offers:terms.offers.map((offer)=>({...offer,receivingAccountVersion:2}))});
  await assert.rejects(f.core.submit(f.account,await f.command({requestId:'request-0000000002',paymentId:saved.paymentId,expectedVersion:1,scopeVersion:2})),{code:'STALE_QUOTE'});
});
