'use strict';
const { requireCondition } = require('./errors');

// Called before ANY transaction write; a restored/stale counter cannot overwrite a sale.
async function reserveReference(tx,db,counter) {
  const previous = counter.exists ? counter.data().n : 0;
  requireCondition(Number.isSafeInteger(previous) && previous >= 0 && previous < 999999,
    'REFERENCE_REVIEW', 'Reservation numbering needs office reconciliation.',409);
  const number = previous + 1, id = `PS-${String(number).padStart(4,'0')}`;
  const reference = db.collection('presaleApplications').doc(id), existing = await tx.get(reference);
  requireCondition(!existing.exists, 'REFERENCE_REVIEW', 'Reservation numbering needs office reconciliation.',409);
  return {number,id,reference};
}
module.exports = { reserveReference };
