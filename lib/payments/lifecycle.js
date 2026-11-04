'use strict';

const { authenticate, documentId, requireAdmin } = require('./auth');
const { requireCondition } = require('./errors');
const { checkBooking } = require('./canonical');
const { readLifecycle, presentLifecycle } = require('./lifecycle-model');
const { scopeKey } = require('./submission');
const { hash } = require('./identities');
const { FieldPath } = require('firebase-admin/firestore');

function createLifecycleService({ db, auth, now = () => Date.now() }) {
  const doc = (c, id) => db.collection(c).doc(id);
  async function contract(tx, bookingId) {
    const row = await tx.get(doc('bookings', documentId(bookingId))), b = row.exists ? row.data() : null;
    requireCondition(b?.lifecycleEnabled === true && ['customer', 'presale'].includes(b.sourceKind),
      'NOT_FOUND', 'Reservation lifecycle is not enabled for this contract.', 404);
    const source = await tx.get(doc(b.sourceKind === 'customer' ? 'customers' : 'presaleApplications', documentId(b.sourceId)));
    requireCondition(source.exists && source.data().canonicalBookingId === bookingId, 'BOOKING_REVIEW', 'Source mapping needs review.', 409);
    checkBooking(b, b.sourceKind, b.sourceId, source.data());
    return b;
  }
  async function queue(token, cursor = null) {
    const identity = await authenticate(auth, token);
    if (cursor !== null) documentId(cursor);
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, identity);
      let query = db.collection('bookings').where('lifecycleEnabled', '==', true).orderBy(FieldPath.documentId(), 'asc');
      if (cursor) query = query.startAfter(cursor);
      const docs = (await tx.get(query.limit(21))).docs, page = docs.slice(0, 20);
      const rows = page.map((d) => {
        const b = d.data(), m = b.lifecycle?.basisVersion === b.version ? presentLifecycle(b.lifecycle, now()) : null;
        return { bookingId:d.id, sourceId:b.sourceId, status:b.status, state:m?.state || 'needs_reconciliation',
          reviewRequired:m?.reviewRequired ?? true, deadlineDate:m?.deadlineDate || null,
          message:m ? null : 'Open this contract to calculate its current lifecycle.' };
      });
      return { rows, nextCursor:docs.length > 20 ? page.at(-1).id : null };
    });
  }
  async function inspect(tx, bookingId) {
    const b = await contract(tx, bookingId);
    const lifecycle = await readLifecycle(tx, db, b, bookingId, now());
    const scope = await tx.get(doc('paymentSubmissionScopes', scopeKey(b.sourceKind, b.sourceId)));
    const review = await tx.get(doc('reservationReviews', bookingId));
    const plots = await Promise.all(b.items.map((i) => tx.get(doc('plots', i.plotId))));
    return { bookingId, version:b.version, status:b.status, sourceId:b.sourceId, lifecycle,
      balanceCentavos:b.balanceCentavos, unappliedCentavos:b.unappliedCentavos,
      plotIds:b.items.map((i) => i.plotId),
      ownershipCurrent:plots.every((p, i) => p.exists && p.data().paymentBookingId === bookingId &&
        p.data().paymentOwnershipVersion === b.items[i].ownershipVersion && !['available', 'released'].includes(p.data().status)),
      pendingCases:scope.exists ? scope.data().openCases : null, gatewayActive:!!scope.data()?.gatewayActiveId,
      lastReview:review.exists ? review.data() : null };
  }
  async function detail(token, bookingId) {
    const identity = await authenticate(auth, token); documentId(bookingId);
    return db.runTransaction(async (tx) => { await requireAdmin(tx, db, identity); return inspect(tx, bookingId); });
  }
  async function retain(token, command) {
    requireCondition(command && typeof command === 'object' && !Array.isArray(command) &&
      Object.keys(command).every((k) => ['bookingId', 'expectedVersion', 'requestId', 'reason'].includes(k)),
    'INVALID_COMMAND', 'Use a reservation review command.');
    documentId(command.bookingId); documentId(command.requestId);
    requireCondition(command.requestId.length >= 16 && Number.isSafeInteger(command.expectedVersion) &&
      typeof command.reason === 'string' && command.reason.trim().length > 0 && command.reason.length <= 1000,
    'INVALID_COMMAND', 'A reason and current contract version are required.');
    const identity = await authenticate(auth, token), at = now();
    return db.runTransaction(async (tx) => {
      const actor = await requireAdmin(tx, db, identity);
      const opId = hash(['reservation-retain', actor.uid, command.requestId]), bodyHash = hash(command);
      const op = await tx.get(doc('operationKeys', opId));
      if (op.exists) {
        requireCondition(op.data().bodyHash === bodyHash, 'IDEMPOTENCY_CONFLICT', 'Use the original review details for this retry.', 409);
        return { ...op.data().result, duplicate:true };
      }
      const d = await inspect(tx, command.bookingId);
      requireCondition(d.version === command.expectedVersion && d.status === 'active', 'STALE_BOOKING', 'Reload the contract before saving this review.', 409);
      const record = { bookingId:command.bookingId, decision:'retain_hold', reason:command.reason.trim(),
        actor:actor.uid, createdAt:at, reviewedVersion:d.version, deadlineDate:d.lifecycle.deadlineDate,
        reviewRequired:d.lifecycle.reviewRequired, pendingCases:d.pendingCases, gatewayActive:d.gatewayActive,
        ownershipCurrent:d.ownershipCurrent };
      const result = { decision:'retain_hold', bookingId:command.bookingId, version:d.version + 1 };
      const model = { ...d.lifecycle, basisVersion:d.version + 1 };
      if (d.lastReview) tx.update(doc('reservationReviews', command.bookingId), record);
      else tx.create(doc('reservationReviews', command.bookingId), record);
      tx.update(doc('bookings', command.bookingId), { lifecycle:model, lifecycleReviewRequired:model.reviewRequired, version:d.version + 1 });
      tx.create(doc('auditLogs', opId), { ...record, action:'reservation_hold_retained' });
      tx.create(doc('operationKeys', opId), { bodyHash, result, createdAt:at });
      // Acknowledging review never clears an unmet deadline, changes dates, or mutates inventory/money.
      return result;
    });
  }
  return { queue, detail, retain };
}

module.exports = { createLifecycleService };
