'use strict';
const { authenticate, documentId, requireAdmin } = require('./auth');
const { readGuestScope } = require('./access');
const { checkBooking, ownerBinding } = require('./canonical');
const { scopeKey } = require('./submission');
const { requireCondition } = require('./errors');

async function readContract(tx, db, id) {
  const row = await tx.get(db.collection('bookings').doc(documentId(id))), booking = row.exists ? row.data() : null;
  requireCondition(booking && ['customer','presale'].includes(booking.sourceKind), 'NOT_FOUND', 'Contract not found.', 404);
  const source = await tx.get(db.collection(booking.sourceKind === 'customer' ? 'customers' : 'presaleApplications').doc(documentId(booking.sourceId)));
  requireCondition(source.exists && source.data().canonicalBookingId === id, 'BOOKING_REVIEW', 'Contract mapping needs review.', 409);
  checkBooking(booking, booking.sourceKind, booking.sourceId, source.data());
  return { booking, source:source.data(), bookingId:id, key:scopeKey(booking.sourceKind,booking.sourceId) };
}
async function identity(auth, credentials) {
  requireCondition(credentials && ['account','reservation','admin'].includes(credentials.mode), 'INVALID_COMMAND', 'Verify access.');
  return credentials.mode === 'reservation' ? credentials : { ...credentials, identity:await authenticate(auth,credentials.idToken) };
}
async function owner(tx, db, who, now) {
  if (who.mode === 'admin') { await requireAdmin(tx,db,who.identity); return null; }
  let source, kind, id, renew = () => {};
  if (who.mode === 'reservation') { const s = await readGuestScope(tx,db,who.secret,now); ({ data:source, kind, id, renew } = s); }
  else { id = documentId(who.customerId); kind = 'customer'; const row = await tx.get(db.collection('customers').doc(id));
    requireCondition(row.exists && row.data().authUid === who.identity.uid,'FORBIDDEN','You cannot access this account.',403); source = row.data(); }
  return { source, kind, id, key:scopeKey(kind,id), binding:ownerBinding(kind,source), renew };
}
module.exports = { readContract, identity, owner };
