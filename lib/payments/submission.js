'use strict';

const { createHash } = require('node:crypto');
const { authenticate, documentId } = require('./auth');
const { readGuestScope } = require('./access');
const { requireCondition } = require('./errors');
const { centavos } = require('./money');
const { parseDate, manilaDate } = require('./calendar');
const { validateProof, DOCUMENT_BYTES } = require('./proof-image');
const { ownerBinding, checkBooking } = require('./canonical');

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopeKey = (kind, id) => digest([kind, id]);
const MAX_BUDGET = 64 * 1024 * 1024;
const editable = (payment) => ['pending_verification','resubmit_requested'].includes(payment.status);
const safeCase = (p) => ({ paymentId:p.paymentId, version:p.version, status:p.status, submittedAt:p.submittedAt,
  updatedAt:p.updatedAt, claimedCentavos:p.claimedCentavos, transferDate:p.transferDate, reference:p.reference,
  quote:p.quote, revisionId:p.revisionId, evidenceRevisionCount:p.evidenceRevisionCount || Number(p.revisionId.slice(1)),
  mismatch:p.mismatch, buyerNote:p.buyerNote || '', receiptId:p.receiptId || null, receivedCentavos:p.receivedCentavos || null });

function command(input) {
  const keys = ['requestId','offerId','scopeVersion','claimedCentavos','transferDate','reference','image','paymentId','expectedVersion'];
  requireCondition(input && Object.keys(input).every((key) => keys.includes(key)), 'INVALID_COMMAND', 'Unsupported submission details.');
  documentId(input.requestId, 'Request'); documentId(input.offerId, 'Payment option');
  requireCondition(input.requestId.length >= 16 && Number.isSafeInteger(input.scopeVersion) && input.scopeVersion > 0,
    'INVALID_COMMAND', 'Reload your payment options before submitting.');
  centavos(input.claimedCentavos, { positive:true }); parseDate(input.transferDate);
  requireCondition(typeof input.reference === 'string' && input.reference.trim().length >= 1 &&
    input.reference.length <= 100 && !/[\x00-\x1f\x7f]/.test(input.reference), 'INVALID_REFERENCE', 'Enter the transfer reference, up to 100 characters.');
  if (input.paymentId) {
    documentId(input.paymentId, 'Payment');
    requireCondition(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion > 0, 'INVALID_COMMAND', 'Reload the submission before correcting it.');
  } else requireCondition(input.expectedVersion === undefined, 'INVALID_COMMAND', 'Version requires an existing submission.');
  return { ...input, reference:input.reference.trim() };
}

// Pending evidence only. These schemaVersion:3 cases cannot enter the narrow CP1 posting primitive.
function createSubmissionService({ db, auth, now = () => Date.now(), decode = validateProof }) {
  const doc = (collection, id) => db.collection(collection).doc(id);
  async function identity(credentials) {
    if (credentials.mode === 'account') {
      documentId(credentials.customerId, 'Account');
      return { ...credentials, identity:await authenticate(auth, credentials.idToken) };
    }
    requireCondition(credentials.mode === 'reservation', 'INVALID_COMMAND', 'Choose an access method.');
    return credentials;
  }
  async function readScope(tx, who, at) {
    let scope;
    if (who.mode === 'reservation') scope = await readGuestScope(tx, db, who.secret, at);
    else {
      const snap = await tx.get(doc('customers', who.customerId));
      requireCondition(snap.exists && snap.data().authUid === who.identity.uid, 'FORBIDDEN', 'You cannot access this account.', 403);
      scope = { kind:'customer', id:who.customerId, data:snap.data(), actor:`uid:${who.identity.uid}`, renew:() => {} };
    }
    return { ...scope, key:scopeKey(scope.kind, scope.id) };
  }
  async function options(tx, scope) {
    const snap = await tx.get(doc('paymentSubmissionScopes', scope.key));
    const terms = snap.exists ? snap.data() : null;
    const enabled = terms && terms.enabled === true && terms.sourceKind === scope.kind && terms.sourceId === scope.id &&
      Number.isSafeInteger(terms.version) && terms.version > 0 && !['cancelled','released'].includes(scope.data.status);
    if (!enabled) return { terms, offers:[] };
    requireCondition(Array.isArray(terms.offers) && terms.offers.length <= 8, 'CONFIG_REVIEW', 'Payment options need office review.', 409);
    const offers = [];
    for (const offer of terms.offers) {
      documentId(offer.id); documentId(offer.receivingAccountId);
      const account = await tx.get(doc('paymentReceivingAccounts', offer.receivingAccountId));
      if (!account.exists) continue;
      const recipient = account.data();
      if (recipient.enabled !== true || recipient.version !== offer.receivingAccountVersion) continue;
      requireCondition(['gcash','bank'].includes(recipient.channel) && ['deposit','installment','advance','settlement'].includes(offer.purpose) &&
        Number.isSafeInteger(recipient.version) && recipient.version > 0 &&
        ['label','accountName','accountNumber','instructions'].every((key) => typeof recipient[key] === 'string' && recipient[key].length <= 500),
      'CONFIG_REVIEW', 'Receiving instructions need office review.', 409);
      centavos(offer.expectedAmountCentavos, { positive:true });
      offers.push({ id:offer.id, purpose:offer.purpose, expectedAmountCentavos:offer.expectedAmountCentavos,
        receivingAccountId:offer.receivingAccountId, receivingAccountVersion:recipient.version, channel:recipient.channel,
        label:recipient.label, accountName:recipient.accountName, accountNumber:recipient.accountNumber, instructions:recipient.instructions });
    }
    return { terms, offers };
  }
  async function context(credentials) {
    const who = await identity(credentials);
    return db.runTransaction(async (tx) => {
      const scope = await readScope(tx, who, now());
      const { terms, offers } = await options(tx, scope);
      scope.renew();
      return { scopeVersion:terms?.version || null, offers };
    });
  }
  async function list(credentials, cursor = null) {
    const who = await identity(credentials);
    return db.runTransaction(async (tx) => {
      const scope = await readScope(tx, who, now());
      let query = db.collection('payments').where('submissionScope', '==', scope.key)
        .orderBy('submittedAt', 'desc').orderBy('paymentId', 'desc');
      if (cursor !== null) {
        requireCondition(typeof cursor === 'string' && cursor.length <= 400, 'INVALID_CURSOR', 'Reload the submission list.');
        let value; try { value = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch (_) { /* checked below */ }
        requireCondition(value?.scope === scope.key && Number.isSafeInteger(value.at) && typeof value.id === 'string',
          'INVALID_CURSOR', 'Reload the submission list.');
        documentId(value.id); query = query.startAfter(value.at, value.id);
      }
      const rows = (await tx.get(query.limit(21))).docs.map((row) => row.data());
      const page = rows.slice(0,20); const last = page.at(-1);
      scope.renew();
      return { cases:page.map(safeCase), nextCursor:rows.length > 20 ? Buffer.from(JSON.stringify({ scope:scope.key, at:last.submittedAt, id:last.paymentId })).toString('base64url') : null };
    });
  }
  async function proof(credentials, paymentId, revisionId) {
    documentId(paymentId); documentId(revisionId);
    const who = await identity(credentials);
    return db.runTransaction(async (tx) => {
      const scope = await readScope(tx, who, now());
      const payment = await tx.get(doc('payments', paymentId));
      requireCondition(payment.exists && payment.data().submissionScope === scope.key, 'NOT_FOUND', 'Submission not found.', 404);
      const snap = await tx.get(doc('paymentProofs', `${paymentId}_${revisionId}`));
      requireCondition(snap.exists && snap.data().submissionScope === scope.key && snap.data().paymentId === paymentId &&
        snap.data().revisionId === revisionId, 'NOT_FOUND', 'Proof not found.', 404);
      const data = snap.data(); scope.renew();
      return { mime:data.mime, base64:data.base64, width:data.width, height:data.height };
    });
  }
  async function submit(credentials, input) {
    const cmd = command(input); const who = await identity(credentials);
    // Reject unauthenticated image decoding; authorization is checked again at commit after decoding.
    await db.runTransaction(async (tx) => { await readScope(tx, who, now()); });
    const image = await decode(cmd.image);
    const at = now();
    requireCondition(cmd.transferDate <= manilaDate(at), 'INVALID_DATE', 'Transfer date cannot be in the future.');
    const bodyHash = digest({ ...cmd, image:image.inputHash });
    return db.runTransaction(async (tx) => {
      const scope = await readScope(tx, who, now());
      const opId = digest([scope.key, scope.actor, cmd.requestId]);
      const opRef = doc('submissionOperationKeys', opId);
      const previous = await tx.get(opRef);
      if (previous.exists) {
        requireCondition(previous.data().bodyHash === bodyHash, 'IDEMPOTENCY_CONFLICT', 'This request was already saved with different details.', 409);
        scope.renew(); return { ...previous.data().result, duplicate:true };
      }
      const { terms, offers } = await options(tx, scope);
      const quote = offers.find((offer) => offer.id === cmd.offerId);
      requireCondition(quote && terms.version === cmd.scopeVersion, 'STALE_QUOTE', 'Payment instructions changed or are unavailable. Reload before submitting.', 409);
      const paymentId = cmd.paymentId || `MP-${opId.slice(0,32)}`;
      const paymentRef = doc('payments', paymentId);
      const existing = await tx.get(paymentRef);
      const old = existing.exists ? existing.data() : null;
      if (cmd.paymentId) {
        requireCondition(old && old.submissionScope === scope.key, 'NOT_FOUND', 'Submission not found.', 404);
        requireCondition(old.schemaVersion === 3 && editable(old) && old.version === cmd.expectedVersion,
          'STALE_SUBMISSION', 'This submission changed or can no longer be edited. Refresh its status.', 409);
        requireCondition(digest(old.quote) === digest(quote), 'STALE_QUOTE', 'These receiving instructions changed. Ask the office to review this submission.', 409);
        requireCondition((old.evidenceRevisionCount || Number(old.revisionId.slice(1))) < 10, 'SUBMISSION_LIMIT', 'This case has reached its evidence limit. Contact the office.', 409);
      } else requireCondition(!old, 'SUBMISSION_CONFLICT', 'Refresh your submissions before retrying.', 409);
      let binding = { bookingId:null, bookingTermsVersion:null, ownerBinding:ownerBinding(scope.kind,scope.data) };
      if (scope.data.canonicalBookingId) {
        const bookingId=documentId(scope.data.canonicalBookingId);
        const snap=await tx.get(doc('bookings',bookingId));
        const booking=snap.exists ? snap.data() : null;
        checkBooking(booking,scope.kind,scope.id,scope.data);
        requireCondition(terms.bookingId === bookingId && booking.status === 'active', 'STALE_QUOTE', 'The booking needs office review.',409);
        binding={bookingId,bookingTermsVersion:booking.termsVersion,ownerBinding:ownerBinding(scope.kind,scope.data)};
      }
      if (old) requireCondition((old.bookingId || null) === binding.bookingId && (!old.ownerBinding || old.ownerBinding === binding.ownerBinding),
        'STALE_SUBMISSION','This submission needs an office ownership or migration review.',409);
      const budgetRef = doc('paymentProofBudget', 'manual');
      const budgetSnap = await tx.get(budgetRef);
      const budget = budgetSnap.exists ? budgetSnap.data() : null;
      requireCondition(budget && Number.isSafeInteger(budget.usedBytes) && budget.usedBytes >= 0 &&
        Number.isSafeInteger(budget.limitBytes) && budget.limitBytes > 0 && budget.limitBytes <= MAX_BUDGET,
      'STORAGE_UNAVAILABLE', 'Proof storage needs office review. Your payment has not been submitted.', 503);
      requireCondition(Number.isSafeInteger(terms.openCases) && terms.openCases >= 0 &&
        (old || terms.openCases < 5), 'SUBMISSION_LIMIT', 'Please contact the office to review your existing submissions.', 409);
      const day = manilaDate(at);
      requireCondition(Number.isSafeInteger(terms.dayCount) && terms.dayCount >= 0, 'CONFIG_REVIEW', 'Submission limits need office review.', 409);
      const dayCount = terms.day === day ? terms.dayCount : 0;
      requireCondition(dayCount < 10, 'SUBMISSION_LIMIT', 'Daily evidence limit reached. Please contact the office.', 429);
      const version = old ? old.version + 1 : 1;
      const evidenceRevisionCount = old ? (old.evidenceRevisionCount || Number(old.revisionId.slice(1))) + 1 : 1;
      const revisionId = `r${evidenceRevisionCount}`;
      const proofId = `${paymentId}_${revisionId}`;
      const evidence = { ...image, paymentId, revisionId, submissionScope:scope.key, createdAt:at };
      delete evidence.inputHash;
      // Conservative metadata allowance in addition to actual UTF-8 serialized document length.
      const chargedBytes = Buffer.byteLength(JSON.stringify(evidence)) + 4096;
      requireCondition(chargedBytes <= DOCUMENT_BYTES && budget.usedBytes + chargedBytes <= budget.limitBytes,
        'STORAGE_FULL', 'Private proof storage is full. Contact the office; no submission was saved.', 409);
      evidence.chargedBytes = chargedBytes;
      const payment = { schemaVersion:3, postingReady:false, paymentId, submissionScope:scope.key, ...binding, evidenceRevisionCount,
        sourceKind:scope.kind, sourceId:scope.id, quote, scopeVersion:terms.version, channel:quote.channel, purpose:quote.purpose,
        claimedCentavos:cmd.claimedCentavos, reference:cmd.reference, transferDate:cmd.transferDate,
        mismatch:cmd.claimedCentavos !== quote.expectedAmountCentavos, revisionId, proofId, version,
        status:'pending_verification', buyerNote:'', submittedAt:old?.submittedAt || at, updatedAt:at };
      const revision = { ...payment, actor:scope.actor, requestId:cmd.requestId, previousRevisionId:old?.revisionId || null };
      const result = { paymentId, revisionId, version, status:'pending_verification' };
      // Observations never reserve the economic transfer. Competing claims remain available for CP4 review.
      const claimKey = digest([quote.receivingAccountId, cmd.reference]);
      tx.create(doc('referenceClaims', `${proofId}`), { claimKey, paymentId, revisionId, submissionScope:scope.key,
        receivingAccountId:quote.receivingAccountId, reference:cmd.reference, normalization:'trim-only-v1', state:'unverified', createdAt:at });
      tx.create(doc('paymentProofs', proofId), evidence);
      tx.create(doc(`payments/${paymentId}/revisions`, revisionId), revision);
      if (old) tx.update(paymentRef, payment); else tx.create(paymentRef, payment);
      tx.update(doc('paymentSubmissionScopes', scope.key), { openCases:terms.openCases + (old ? 0 : 1), day, dayCount:dayCount + 1 });
      tx.update(budgetRef, { usedBytes:budget.usedBytes + chargedBytes });
      tx.create(opRef, { bodyHash, actor:scope.actor, submissionScope:scope.key, result, createdAt:at });
      tx.create(doc('auditLogs', `submission_${proofId}`), { action:old ? 'proof_revised' : 'proof_submitted', actor:scope.actor, paymentId, revisionId, createdAt:at });
      tx.create(doc('notifications', `submission_${proofId}`), { submissionScope:scope.key, paymentId, revisionId, state:'pending',
        title:'Evidence submitted — awaiting verification', createdAt:at });
      scope.renew(); return result;
    });
  }
  return { context, list, proof, submit };
}

module.exports = { createSubmissionService, scopeKey, MAX_BUDGET };
