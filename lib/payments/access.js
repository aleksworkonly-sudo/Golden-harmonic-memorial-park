'use strict';

const { randomBytes, createHash, createHmac } = require('node:crypto');
const { authenticate, documentId } = require('./auth');
const { requireCondition } = require('./errors');
const { legacySummary } = require('./read-model');

const TOKEN_MS = 15 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validSecret = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const emailOf = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const versionOf = (data) => Number.isSafeInteger(data.accessVersion) && data.accessVersion >= 1 ? data.accessVersion : null;
const fingerprint = (data) => hash(JSON.stringify([emailOf(data.email), data.mobileKey || '', data.accessVersion]));

function createAccessService({ db, auth, origin, rateSecret, sendLink, now = () => Date.now(),
  random = () => randomBytes(32).toString('base64url') }) {
  requireCondition(typeof rateSecret === 'string' && rateSecret.length >= 32, 'ACCESS_CONFIG', 'Access service is not configured.', 503);
  const doc = (collection, id) => db.collection(collection).doc(id);
  const rateKey = (scope) => createHmac('sha256', rateSecret).update(scope).digest('hex');

  async function consumeLimits(tx, specs, at) {
    const refs = specs.map(([scope]) => doc('paymentAccessLimits', rateKey(scope)));
    const snaps = await Promise.all(refs.map((reference) => tx.get(reference)));
    const states = snaps.map((snap) => snap.exists && snap.data().resetAt > at
      ? snap.data() : { count: 0, resetAt: at + WINDOW_MS });
    const allowed = states.every((state, index) => state.count < specs[index][1]);
    // Return staged writes so callers can finish ALL transaction reads before writing.
    return { allowed, write() {
      refs.forEach((reference, index) => {
        const state = { count: Math.min(states[index].count + 1, specs[index][1]), resetAt: states[index].resetAt };
        if (snaps[index].exists) tx.update(reference, state); else tx.create(reference, state);
      });
    } };
  }

  async function requestLink({ reference, email, requester }) {
    const ref = typeof reference === 'string' ? reference.trim().toUpperCase() : '';
    const enteredEmail = emailOf(email);
    requireCondition(/^PS-\d{3,6}$/.test(ref) && validEmail(enteredEmail),
      'INVALID_REQUEST', 'Enter your reservation reference and registered email.');
    const token = random();
    requireCondition(validSecret(token), 'ACCESS_CONFIG', 'Access service is unavailable.', 503);
    const tokenId = hash(token);
    const at = now();
    const recipient = await db.runTransaction(async (tx) => {
      const limits = await consumeLimits(tx, [[`requester:${requester}`, 10], [`reservation:${ref}`, 3], ['all-link-requests', 300]], at);
      const reservation = await tx.get(doc('presaleApplications', ref));
      const data = reservation.exists ? reservation.data() : null;
      const eligible = limits.allowed && data && versionOf(data) !== null &&
        validEmail(emailOf(data.email)) && emailOf(data.email) === enteredEmail;
      limits.write();
      if (!eligible) return null;
      tx.create(doc('reservationAccess', tokenId), {
        ref, accessVersion: data.accessVersion, contactFingerprint: fingerprint(data),
        createdAt: at, expiresAt: at + TOKEN_MS, consumedAt: null, delivery: 'pending'
      });
      return emailOf(data.email);
    });
    if (recipient) {
      // Neither usable token nor address is returned to the caller or persisted in logs/outbox.
      // A fragment keeps the bearer secret out of ordinary HTTP URL logs.
      let delivery = 'accepted';
      try { await sendLink({ to: recipient, url: `${origin}/payment-link.html#access=${token}` }); }
      catch (_) { delivery = 'failed'; }
      await db.runTransaction(async (tx) => {
        const reference = doc('reservationAccess', tokenId);
        const snap = await tx.get(reference);
        if (snap.exists) tx.update(reference, { delivery });
      });
    }
    return { message: 'If the details match a reservation, a verification link will be sent to its registered email. Please check your inbox and spam folder.' };
  }

  async function exchange({ token, requester }) {
    requireCondition(validSecret(token), 'INVALID_LINK', 'This link is invalid or expired. Request a new link.', 401);
    const secret = random();
    requireCondition(validSecret(secret), 'ACCESS_CONFIG', 'Access service is unavailable.', 503);
    const at = now();
    const accepted = await db.runTransaction(async (tx) => {
      const limits = await consumeLimits(tx, [[`exchange:${requester}`, 30]], at);
      const tokenRef = doc('reservationAccess', hash(token));
      const access = await tx.get(tokenRef);
      const record = access.exists ? access.data() : null;
      const reservation = record ? await tx.get(doc('presaleApplications', record.ref)) : null;
      const data = reservation && reservation.exists ? reservation.data() : null;
      const allowed = limits.allowed && record && record.consumedAt === null && record.expiresAt > at &&
        data && versionOf(data) !== null && data.accessVersion === record.accessVersion && fingerprint(data) === record.contactFingerprint;
      limits.write();
      if (!allowed) return false;
      tx.update(tokenRef, { consumedAt: at });
      tx.create(doc('reservationSessions', hash(secret)), {
        ref: record.ref, accessVersion: record.accessVersion, contactFingerprint: record.contactFingerprint,
        createdAt: at, expiresAt: at + SESSION_MS, idleExpiresAt: at + IDLE_MS, revokedAt: null
      });
      return true;
    });
    requireCondition(accepted, 'INVALID_LINK', 'This link is invalid or expired. Request a new link.', 401);
    return { secret, maxAge: SESSION_MS / 1000 };
  }

  async function guestSummary({ secret, cursor = null }) {
    requireCondition(validSecret(secret), 'SESSION_REQUIRED', 'Open a new email verification link to continue.', 401);
    const at = now();
    return db.runTransaction(async (tx) => {
      const sessionRef = doc('reservationSessions', hash(secret));
      const snap = await tx.get(sessionRef);
      const session = snap.exists ? snap.data() : null;
      requireCondition(session && session.revokedAt === null && session.expiresAt > at && session.idleExpiresAt > at,
        'SESSION_REQUIRED', 'Your access has expired. Request a new email link.', 401);
      const reservation = await tx.get(doc('presaleApplications', session.ref));
      const data = reservation.exists ? reservation.data() : null;
      requireCondition(data && versionOf(data) !== null && data.accessVersion === session.accessVersion &&
        fingerprint(data) === session.contactFingerprint,
      'SESSION_REQUIRED', 'Your access has changed. Request a new email link.', 401);
      const result = legacySummary('presale', session.ref, data, cursor);
      tx.update(sessionRef, { idleExpiresAt: Math.min(at + IDLE_MS, session.expiresAt) });
      return result;
    });
  }

  async function logout({ secret }) {
    if (!validSecret(secret)) return;
    await db.runTransaction(async (tx) => {
      const reference = doc('reservationSessions', hash(secret));
      const snap = await tx.get(reference);
      if (snap.exists && !snap.data().revokedAt) tx.update(reference, { revokedAt: now() });
    });
  }

  async function accountList({ idToken }) {
    const identity = await authenticate(auth, idToken);
    return db.runTransaction(async (tx) => {
      const rows = await tx.get(db.collection('customers').where('authUid', '==', identity.uid).limit(51));
      requireCondition(rows.docs.length <= 50, 'ACCOUNT_REVIEW', 'Contact the office to review your linked accounts.', 409);
      return rows.docs.map((row) => {
        const data = row.data();
        return { id: row.id, label: typeof data.plan?.tierName === 'string' ? data.plan.tierName.slice(0, 120) : 'Plot account' };
      });
    });
  }

  async function checkTraffic(requester) {
    const allowed = await db.runTransaction(async (tx) => {
      const limits = await consumeLimits(tx, [[`traffic:${requester}`, 120], ['all-access-traffic', 2000]], now());
      limits.write();
      return limits.allowed;
    });
    requireCondition(allowed, 'RATE_LIMITED', 'Too many requests. Please try again in 15 minutes.', 429);
  }

  async function accountSummary({ idToken, customerId, cursor = null }) {
    const identity = await authenticate(auth, idToken);
    documentId(customerId, 'Account');
    return db.runTransaction(async (tx) => {
      const customer = await tx.get(doc('customers', customerId));
      requireCondition(customer.exists && customer.data().authUid === identity.uid,
        'FORBIDDEN', 'You cannot access this account.', 403);
      return legacySummary('customer', customerId, customer.data(), cursor);
    });
  }

  return { requestLink, exchange, guestSummary, logout, accountList, accountSummary, checkTraffic };
}

module.exports = { createAccessService, TOKEN_MS, IDLE_MS, SESSION_MS };
