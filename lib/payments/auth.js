'use strict';

const { PaymentError, requireCondition } = require('./errors');

function documentId(value, label = 'Identifier') {
  requireCondition(typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value),
    'INVALID_ID', `${label} is invalid.`);
  return value;
}

// Roles in an ID token or request payload are deliberately ignored.
async function authenticate(auth, idToken) {
  requireCondition(typeof idToken === 'string' && idToken.length > 0 && idToken.length <= 16384,
    'UNAUTHENTICATED', 'Please sign in again.', 401);
  try {
    const decoded = await auth.verifyIdToken(idToken, true);
    requireCondition(typeof decoded.uid === 'string' && decoded.uid.length > 0 &&
      decoded.uid.length <= 128 && !decoded.uid.includes('/'),
    'UNAUTHENTICATED', 'Please sign in again.', 401);
    return Object.freeze({ uid: decoded.uid });
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    // Fail closed while distinguishing credential failures from an unavailable identity service.
    if (['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token',
      'auth/argument-error', 'auth/user-disabled', 'auth/user-not-found'].includes(error.code)) {
      throw new PaymentError('UNAUTHENTICATED', 'Please sign in again.', 401);
    }
    throw new PaymentError('AUTH_UNAVAILABLE', 'Sign-in verification is temporarily unavailable.', 503);
  }
}

async function requireAdmin(tx, db, identity) {
  const snapshot = await tx.get(db.collection('users').doc(identity.uid));
  const user = snapshot.exists ? snapshot.data() : null;
  requireCondition(user && user.disabled !== true && ['admin', 'superadmin'].includes(user.role),
    'FORBIDDEN', 'Only an admin can record or approve payments.', 403);
  return { uid: identity.uid, role: user.role };
}

async function requireBookingReader(tx, db, identity, booking, bookingId) {
  const role = await tx.get(db.collection('users').doc(identity.uid));
  const user = role.exists ? role.data() : null;
  if (user && user.disabled !== true && ['admin', 'superadmin'].includes(user.role)) return;
  if(booking && ['customer','presale'].includes(booking.sourceKind) && booking.sourceId) {
    const scope=await require('../accounts/access').resolveBuyerSource(tx,db,identity,{kind:booking.sourceKind,id:booking.sourceId});
    requireCondition(scope.data.canonicalBookingId && (!bookingId || scope.data.canonicalBookingId===bookingId),
      'FORBIDDEN','You cannot access this payment history.',403);
    require('./canonical').checkBooking(booking,scope.kind,scope.id,scope.data);
    return;
  }
  requireCondition(booking && typeof booking.customerId === 'string',
    'FORBIDDEN', 'You cannot access this payment history.', 403);
  const customerId = documentId(booking.customerId, 'Customer');
  await require('../accounts/access').resolveBuyerSource(tx,db,identity,{kind:'customer',id:customerId});
}

module.exports = { documentId, authenticate, requireAdmin, requireBookingReader };
