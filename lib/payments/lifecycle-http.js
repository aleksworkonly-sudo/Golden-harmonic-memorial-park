'use strict';
const { configuration, bearer, requesterIdentity } = require('./access-http');
const { createAccessService } = require('./access');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');
const { createLifecycleService } = require('./lifecycle');
const fields = { queue:['cursor'], detail:['bookingId'], retain:['command'] };

function createLifecycleHandler({ env = process.env, services = getFirebaseServices, now = () => Date.now() } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const config = configuration(env), enabled = config.enabled && env.PAYMENT_LIFECYCLE_ENABLED === 'true';
    if (req.method === 'GET') return res.status(200).json({ enabled });
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
    if (!enabled) return res.status(503).json({ code:'LIFECYCLE_DISABLED', error:'Reservation review is not enabled.' });
    try {
      requireCondition(req.headers.origin === config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin'),
        'INVALID_ORIGIN', 'Open reservation review from the park website.', 403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'INVALID_CONTENT_TYPE', 'Send JSON.', 415);
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      requireCondition(typeof raw === 'string' && Buffer.byteLength(raw) <= 8192, 'BODY_TOO_LARGE', 'Request is too large.', 413);
      let body; try { body = JSON.parse(raw); } catch (_) { throw new PaymentError('INVALID_BODY', 'Invalid JSON.'); }
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(fields, body.action) &&
        Object.keys(body).every((k) => ['action', ...fields[body.action]].includes(k)), 'INVALID_BODY', 'Unsupported review details.');
      const token = bearer(req), { db, auth } = services();
      await createAccessService({ db, auth, origin:config.origin, rateSecret:env.PAYMENT_ACCESS_RATE_SECRET, now }).checkTraffic(requesterIdentity(req, env));
      const core = createLifecycleService({ db, auth, now });
      const result = body.action === 'queue' ? await core.queue(token, body.cursor) :
        body.action === 'detail' ? await core.detail(token, body.bookingId) : await core.retain(token, body.command);
      return res.status(200).json(result);
    } catch (e) {
      if (e instanceof PaymentError) return res.status(e.status).json({ code:e.code, error:e.message });
      return res.status(503).json({ code:'LIFECYCLE_UNAVAILABLE', error:'The result is uncertain. Retry the same review request.' });
    }
  };
}
module.exports = { createLifecycleHandler };
