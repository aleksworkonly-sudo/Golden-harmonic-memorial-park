'use strict';
const { gatewayFixture } = require('./gateway-fixture');
const { createLifecycleService } = require('../../lib/payments/lifecycle');
const { deriveLifecycle, presentLifecycle } = require('../../lib/payments/lifecycle-model');
function lifecycleFixture() {
  const f = gatewayFixture();
  for (const id of ['c1', 'PS-0001']) {
    const bookingId = `booking-${id}`, path = `bookings/${bookingId}`, b = f.db.read(path);
    const booking = { ...b, bookingId, lifecycleEnabled:true,
      lifecycleTerms:{ version:1, bookingTermsVersion:1, reservationVerified:true,
        reservedAt:Date.parse('2026-06-30T04:00:00Z'), plan:id === 'c1' ? 'installment' : 'spot_cash', termMonths:12 } };
    booking.lifecycle = presentLifecycle(deriveLifecycle(booking, [f.db.read(`ledgerEntries/${b.openingBalanceId}`)], f.time), f.time);
    f.db.put(path, booking);
  }
  const clock = { time:f.time };
  const lifecycle = createLifecycleService({ db:f.db, auth:f.auth, now:() => clock.time });
  const retainCommand = (overrides = {}) => ({ bookingId:'booking-c1', expectedVersion:1, requestId:'retain-request-00001', reason:'Awaiting statement review; keep all plots held.', ...overrides });
  return { ...f, clock, lifecycle, retainCommand };
}
module.exports = { lifecycleFixture };
