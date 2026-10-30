'use strict';

const { createHash } = require('node:crypto');
const { requireCondition } = require('./errors');
const { centavos, addCentavos } = require('./money');
const { timestamp, manilaDate } = require('./calendar');
const { documentId, authenticate, requireAdmin, requireBookingReader } = require('./auth');

const hash = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

function approvalCommand(input) {
  const keys = ['paymentId', 'requestId', 'expectedVersion', 'receivedCentavos', 'receivedAt', 'verifiedReference'];
  requireCondition(input && typeof input === 'object' && !Array.isArray(input) &&
    Object.keys(input).every((key) => keys.includes(key)) && keys.every((key) => Object.hasOwn(input, key)),
  'INVALID_COMMAND', 'The payment approval contains missing or unsupported fields.');
  documentId(input.paymentId, 'Payment');
  requireCondition(typeof input.requestId === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(input.requestId),
    'INVALID_REQUEST_ID', 'Use a stable request identifier for this approval.');
  requireCondition(Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 1 &&
    input.expectedVersion < Number.MAX_SAFE_INTEGER,
    'INVALID_VERSION', 'Payment version is required.');
  centavos(input.receivedCentavos, { positive: true });
  timestamp(input.receivedAt);
  requireCondition(typeof input.verifiedReference === 'string' && input.verifiedReference.trim().length > 0 &&
    input.verifiedReference.length <= 160 && !/[\u0000-\u001f\u007f]/.test(input.verifiedReference),
  'INVALID_REFERENCE', 'Enter the reference checked against the receiving statement.');
  // Preserve leading zeros and case. Provider-specific normalization needs verified samples.
  return { ...input, verifiedReference: input.verifiedReference.trim() };
}

function decisionHash(command) {
  return hash([command.paymentId, command.expectedVersion, command.receivedCentavos,
    command.receivedAt, command.verifiedReference]);
}

function receiptResult(receipt) {
  return {
    receiptId: receipt.receiptId, paymentId: receipt.paymentId, bookingId: receipt.bookingId,
    receivedCentavos: receipt.receivedCentavos, receivedAt: receipt.receivedAt,
    recordedAt: receipt.recordedAt, balanceAfterCentavos: receipt.balanceAfterCentavos
  };
}

/**
 * CP1 internal foundation, NOT an HTTP handler or production-ready approval workflow.
 * Server-prepared, policy-approved balance-credit cases only. No cash/provider adapters,
 * deposit/schedule activation, penalties, refunds, migration, or submission creation here.
 * All these collections must be server-write-only before a route is connected.
 */
function createPaymentService({ db, auth, now = () => Date.now() }) {
  const ref = (collection, id) => db.collection(collection).doc(id);

  async function approveManualPayment({ idToken, command: input }) {
    const identity = await authenticate(auth, idToken);
    const command = approvalCommand(input);
    const recordedAt = timestamp(now());
    requireCondition(command.receivedAt <= recordedAt, 'INVALID_DATE', 'Received date cannot be in the future.');
    const bodyHash = decisionHash(command);
    const operationId = hash(['manual-approval', identity.uid, command.requestId]);

    return db.runTransaction(async (tx) => {
      // Reading authority inside the transaction makes concurrent role changes cause a retry.
      const actor = await requireAdmin(tx, db, identity);
      const operationRef = ref('operationKeys', operationId);
      const operation = await tx.get(operationRef);
      if (operation.exists) {
        requireCondition(operation.data().bodyHash === bodyHash, 'IDEMPOTENCY_CONFLICT',
          'This request identifier was already used with different details.', 409);
        return { ...operation.data().result, duplicate: true };
      }

      const paymentRef = ref('payments', command.paymentId);
      const snapshot = await tx.get(paymentRef);
      requireCondition(snapshot.exists, 'NOT_FOUND', 'Payment not found.', 404);
      const payment = snapshot.data();
      if (payment.status === 'verified') {
        requireCondition(payment.approvalHash === bodyHash, 'PAYMENT_CONFLICT',
          'This payment has already been approved with different details.', 409);
        const existing = await tx.get(ref('receipts', documentId(payment.receiptId)));
        requireCondition(existing.exists, 'INTEGRITY_ERROR', 'Receipt requires reconciliation.', 409);
        const result = receiptResult(existing.data());
        tx.create(operationRef, { bodyHash, actorUid: actor.uid, result, createdAt: recordedAt });
        return { ...result, duplicate: true };
      }

      requireCondition(payment.schemaVersion === 1 && payment.status === 'pending_verification',
        'INVALID_STATE', 'Payment is not awaiting verification.', 409);
      requireCondition(payment.version === command.expectedVersion, 'STALE_VERSION',
        'Payment changed. Reload before approving.', 409);
      requireCondition(['gcash', 'bank'].includes(payment.channel) && payment.purpose === 'balance',
        'WORKFLOW_NOT_READY', 'This payment requires a later workflow checkpoint.', 409);
      requireCondition(centavos(payment.expectedAmountCentavos, { positive: true }) === command.receivedCentavos,
        'AMOUNT_REQUIRES_REVIEW', 'A different received amount requires reconciliation.', 409);
      const bookingId = documentId(payment.bookingId, 'Booking');
      const bookingRef = ref('bookings', bookingId);
      const bookingSnapshot = await tx.get(bookingRef);
      requireCondition(bookingSnapshot.exists, 'NOT_FOUND', 'Booking not found.', 404);
      const booking = bookingSnapshot.data();
      // Explicit opt-in prevents writing into existing customers/presale records or guessed terms.
      requireCondition(booking.schemaVersion === 1 && booking.postingEnabled === true &&
        booking.policyStatus === 'approved' && booking.status === 'active' &&
        booking.currency === 'PHP' && payment.currency === 'PHP',
      'POLICY_NOT_READY', 'This contract is not enabled for the new posting service.', 409);
      requireCondition(Number.isSafeInteger(booking.version) && booking.version >= 1 &&
        booking.version < Number.MAX_SAFE_INTEGER &&
        booking.version === payment.bookingVersion,
      'STALE_QUOTE', 'The contract changed. Reconcile the quote before approval.', 409);
      const total = centavos(booking.totalCentavos, { positive: true });
      const paid = centavos(booking.netCreditCentavos);
      requireCondition(paid <= total && booking.balanceCentavos === total - paid,
        'INTEGRITY_ERROR', 'Contract totals require reconciliation.', 409);
      const netCredit = addCentavos(paid, command.receivedCentavos);
      // Settlement must include approved charge/schedule rules; CP1 must not silently close a contract.
      requireCondition(netCredit < total, 'SETTLEMENT_REQUIRES_REVIEW',
        'Final settlement or excess money requires the settlement workflow.', 409);

      documentId(payment.revisionId, 'Proof revision');
      const proofSnapshot = await tx.get(ref('paymentProofs', documentId(payment.proofId, 'Proof')));
      const proof = proofSnapshot.exists ? proofSnapshot.data() : null;
      requireCondition(proof && proof.paymentId === command.paymentId && proof.bookingId === bookingId &&
        proof.revisionId === payment.revisionId && typeof payment.revisionId === 'string' &&
        proof.validationStatus === 'validated',
      'INVALID_PROOF', 'A validated proof revision linked to this payment is required.', 409);
      // Receiving account ID is stable across QR/settings versions, and read from server-owned data.
      const accountId = documentId(payment.receivingAccountId, 'Receiving account');
      const economicId = hash(['manual-receipt-v1', accountId, command.verifiedReference]);
      const economicRef = ref('economicPayments', economicId);
      const economic = await tx.get(economicRef);
      requireCondition(!economic.exists, 'DUPLICATE_PAYMENT',
        'This transfer already has a receipt. Reconcile the existing payment.', 409);

      const receiptId = `PAY-${hash(['payment', command.paymentId])}`;
      const balanceAfterCentavos = total - netCredit;
      const receipt = {
        schemaVersion: 1, receiptId, paymentId: command.paymentId, bookingId, currency: 'PHP',
        receivedCentavos: command.receivedCentavos, receivedAt: command.receivedAt,
        receivedDate: manilaDate(command.receivedAt), recordedAt, balanceAfterCentavos,
        channel: payment.channel, proofId: payment.proofId, revisionId: payment.revisionId,
        economicId, actor
      };
      const result = receiptResult(receipt);
      // All reads above; all writes below. No provider call, email or random ID inside the callback.
      tx.create(economicRef, { receiptId, paymentId: command.paymentId, bookingId, createdAt: recordedAt });
      tx.create(ref('receipts', receiptId), receipt);
      tx.create(ref('ledgerEntries', receiptId), {
        ...receipt, kind: 'receipt', contractCreditCentavos: command.receivedCentavos
      });
      tx.update(bookingRef, { netCreditCentavos: netCredit, balanceCentavos: balanceAfterCentavos,
        version: booking.version + 1 });
      tx.update(paymentRef, { status: 'verified', version: payment.version + 1, receiptId,
        approvalHash: bodyHash, receivedCentavos: command.receivedCentavos, receivedAt: command.receivedAt,
        verifiedAt: recordedAt, verifiedBy: actor.uid, verifiedReference: command.verifiedReference });
      tx.create(ref('auditLogs', receiptId), { action: 'payment_verified', actor, bookingId,
        paymentId: command.paymentId, receiptId, recordedAt, beforeCentavos: paid, afterCentavos: netCredit });
      tx.create(ref('notifications', receiptId), {
        type: 'payment_verified', bookingId, receiptId, createdAt: recordedAt, readAt: null
      });
      // Dispatcher and fixed recipient/template resolution arrive in CP8; never send inline.
      tx.create(ref('emailOutbox', receiptId), {
        type: 'payment_verified', bookingId, receiptId, createdAt: recordedAt, state: 'awaiting_configuration'
      });
      tx.create(operationRef, { bodyHash, actorUid: actor.uid, result, createdAt: recordedAt });
      return { ...result, duplicate: false };
    });
  }

  async function paymentHistory({ idToken, bookingId, afterReceiptId = null, pageSize = 20 }) {
    const identity = await authenticate(auth, idToken);
    documentId(bookingId, 'Booking');
    requireCondition(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50,
      'INVALID_PAGE_SIZE', 'Page size must be between 1 and 50.');
    if (afterReceiptId !== null) documentId(afterReceiptId, 'Receipt cursor');

    return db.runTransaction(async (tx) => {
      const bookingSnapshot = await tx.get(ref('bookings', bookingId));
      // Generic access failure avoids disclosing whether another buyer's booking exists.
      requireCondition(bookingSnapshot.exists, 'FORBIDDEN', 'You cannot access this payment history.', 403);
      const booking = bookingSnapshot.data();
      await requireBookingReader(tx, db, identity, booking);
      let query = db.collection('ledgerEntries').where('bookingId', '==', bookingId)
        .orderBy('recordedAt', 'desc').orderBy('receiptId', 'desc');
      if (afterReceiptId) {
        const cursor = await tx.get(ref('ledgerEntries', afterReceiptId));
        requireCondition(cursor.exists && cursor.data().bookingId === bookingId,
          'INVALID_CURSOR', 'History cursor is invalid.');
        query = query.startAfter(cursor.data().recordedAt, cursor.data().receiptId);
      }
      const entries = await tx.get(query.limit(pageSize + 1));
      const rows = entries.docs.slice(0, pageSize).map((entry) => receiptResult(entry.data()));
      return {
        bookingId, balanceCentavos: centavos(booking.balanceCentavos), entries: rows,
        nextCursor: entries.docs.length > pageSize ? rows[rows.length - 1].receiptId : null
      };
    });
  }

  return Object.freeze({ approveManualPayment, paymentHistory });
}

module.exports = { createPaymentService };
