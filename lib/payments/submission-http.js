'use strict';

const { configuration, cookieSecret, bearer, requesterIdentity } = require('./access-http');
const { createAccessService } = require('./access');
const { createSubmissionService } = require('./submission');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');
const BODY_BYTES = 720 * 1024;
const fields = { context:[], list:['cursor'], proof:['paymentId','revisionId'], submit:['command'] };

function createSubmissionHandler({ env = process.env, services = getFirebaseServices } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const config = configuration(env);
    const enabled = config.enabled && env.PAYMENT_SUBMISSIONS_ENABLED === 'true';
    if (req.method === 'GET') return res.status(200).json({ enabled });
    if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed.' });
    if (!enabled) return res.status(503).json({ code:'SUBMISSIONS_DISABLED', error:'Online proof submission is not available yet. Please contact the office.' });
    try {
      requireCondition(req.headers.origin === config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin'),
        'INVALID_ORIGIN', 'Open this form from the park website.', 403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''), 'INVALID_CONTENT_TYPE', 'Send JSON.', 415);
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      requireCondition(typeof raw === 'string' && Buffer.byteLength(raw) <= BODY_BYTES, 'BODY_TOO_LARGE', 'Compress the proof image before uploading.', 413);
      let body; try { body = JSON.parse(raw); } catch (_) { throw new PaymentError('INVALID_BODY', 'Invalid request.'); }
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(fields, body.action) &&
        Object.keys(body).every((key) => ['action','mode','customerId',...fields[body.action]].includes(key)),
      'INVALID_BODY', 'Unsupported request details.');
      requireCondition(['account','reservation'].includes(body.mode) && (body.mode !== 'reservation' || !Object.hasOwn(body,'customerId')),
        'INVALID_BODY', 'Choose your current account or reservation.');
      const { db, auth } = services();
      const access = createAccessService({ db, auth, origin:config.origin, rateSecret:env.PAYMENT_ACCESS_RATE_SECRET });
      await access.checkTraffic(requesterIdentity(req, env));
      const core = createSubmissionService({ db, auth });
      const credentials = body.mode === 'account' ? { mode:body.mode, customerId:body.customerId, idToken:bearer(req) }
        : { mode:body.mode, secret:cookieSecret(req) };
      let result;
      if (body.action === 'context') result = await core.context(credentials);
      if (body.action === 'list') result = await core.list(credentials, body.cursor);
      if (body.action === 'proof') result = await core.proof(credentials, body.paymentId, body.revisionId);
      if (body.action === 'submit') result = await core.submit(credentials, body.command);
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof PaymentError) return res.status(error.status).json({ code:error.code, error:error.message });
      return res.status(503).json({ code:'SUBMISSION_UNAVAILABLE', error:'Could not finish the request. Retry with the same details; a saved submission will not be duplicated.' });
    }
  };
}

module.exports = { createSubmissionHandler, BODY_BYTES };
