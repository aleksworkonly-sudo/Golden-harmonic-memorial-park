'use strict';

const { isIP } = require('node:net');
const { createAccessService } = require('./access');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');

const COOKIE = '__Host-gh_payment_session';
const ACTION_FIELDS = {
  request_link: ['reference', 'email'], exchange: ['token'], guest_summary: ['cursor'],
  logout: [], account_list: [], account_summary: ['customerId', 'cursor']
};

function configuration(env) {
  let origin;
  try {
    const url = new URL(env.PAYMENT_ACCESS_ORIGIN);
    if (url.protocol === 'https:' && url.origin === env.PAYMENT_ACCESS_ORIGIN && !url.username && !url.password) origin = url.origin;
  } catch (_) { /* disabled below */ }
  return { origin, enabled: env.PAYMENT_ACCESS_ENABLED === 'true' && !!origin &&
    typeof env.PAYMENT_ACCESS_RATE_SECRET === 'string' && env.PAYMENT_ACCESS_RATE_SECRET.length >= 32 &&
    !!env.BREVO_API_KEY && !!env.SENDER_EMAIL };
}

function cookieSecret(req) {
  const values = String(req.headers.cookie || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE}=`));
  return values.length === 1 ? values[0].slice(COOKIE.length + 1) : '';
}

function sessionCookie(secret, maxAge) {
  return `${COOKIE}=${secret}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function bearer(req) {
  const value = req.headers.authorization;
  requireCondition(typeof value === 'string' && /^Bearer \S+$/.test(value), 'UNAUTHENTICATED', 'Please sign in again.', 401);
  return value.slice(7);
}

function readBody(req) {
  requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),
    'INVALID_CONTENT_TYPE', 'Send a JSON request.', 415);
  let body;
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    requireCondition(typeof raw === 'string' && Buffer.byteLength(raw) <= 4096,
      'BODY_TOO_LARGE', 'Request is too large.', 413);
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError('INVALID_BODY', 'Request is not valid JSON.');
  }
  requireCondition(body && !Array.isArray(body) && Object.hasOwn(ACTION_FIELDS, body.action),
    'INVALID_ACTION', 'Choose a supported access action.');
  requireCondition(Object.keys(body).every((key) => key === 'action' || ACTION_FIELDS[body.action].includes(key)),
    'INVALID_BODY', 'Request contains unsupported fields.');
  return body;
}

function requesterIdentity(req, env) {
  // Vercel supplies this header; local/non-Vercel adapters use the socket, not arbitrary X-Forwarded-For.
  const forwarded = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : null;
  const address = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress;
  return isIP(address || '') ? address : 'unavailable';
}

function createLinkSender(env, fetchFn = fetch) {
  return async ({ to, url }) => {
    const response = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', 'api-key': env.BREVO_API_KEY },
      body: JSON.stringify({
        sender: { name: 'Golden Harmonic Memorial Park', email: env.SENDER_EMAIL },
        to: [{ email: to }], subject: 'Open your reservation payment history',
        textContent: `Open this link, then select Continue to verify your access:\n\n${url}\n\nThe link expires in 15 minutes and works once. If you did not request it, you can ignore this email.`
      })
    });
    if (!response.ok) throw new Error('Access email delivery failed.');
  };
}

function createAccessHandler({ env = process.env, services = getFirebaseServices, sender,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), minimumRequestMs = 1000 } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const config = configuration(env);
    if (req.method === 'GET') return res.status(200).json({ enabled: config.enabled });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!config.enabled) return res.status(503).json({ code: 'ACCESS_DISABLED', error: 'Secure payment access is not available yet. Please contact the office.' });
    let body;
    const started = Date.now();
    try {
      requireCondition(req.headers.origin === config.origin, 'INVALID_ORIGIN', 'Open payment access from the park website.', 403);
      requireCondition(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin',
        'INVALID_ORIGIN', 'Open payment access from the park website.', 403);
      body = readBody(req);
      const { db, auth } = services();
      const core = createAccessService({ db, auth, origin: config.origin,
        rateSecret: env.PAYMENT_ACCESS_RATE_SECRET, sendLink: sender || createLinkSender(env) });
      const requester = requesterIdentity(req, env);
      // A saturated traffic bucket must not prevent revoking an existing session.
      if (body.action !== 'logout') await core.checkTraffic(requester);
      let result;
      switch (body.action) {
        case 'request_link':
          result = await core.requestLink({ reference: body.reference, email: body.email, requester });
          break;
        case 'exchange': {
          const session = await core.exchange({ token: body.token, requester });
          res.setHeader('Set-Cookie', sessionCookie(session.secret, session.maxAge));
          result = { ok: true };
          break;
        }
        case 'guest_summary':
          result = { summary: await core.guestSummary({ secret: cookieSecret(req), cursor: body.cursor }) };
          break;
        case 'logout':
          await core.logout({ secret: cookieSecret(req) });
          res.setHeader('Set-Cookie', sessionCookie('', 0));
          result = { ok: true };
          break;
        case 'account_list':
          result = { accounts: await core.accountList({ idToken: bearer(req) }) };
          break;
        case 'account_summary':
          result = { summary: await core.accountSummary({ idToken: bearer(req), customerId: body.customerId, cursor: body.cursor }) };
          break;
      }
      if (body.action === 'request_link') await sleep(Math.max(0, minimumRequestMs - (Date.now() - started)));
      return res.status(200).json(result);
    } catch (error) {
      if (body?.action === 'request_link') await sleep(Math.max(0, minimumRequestMs - (Date.now() - started)));
      if (error instanceof PaymentError) return res.status(error.status).json({ code: error.code, error: error.message });
      return res.status(503).json({ code: 'ACCESS_UNAVAILABLE', error: 'Payment access is temporarily unavailable. Please try again.' });
    }
  };
}

module.exports = { createAccessHandler, configuration, COOKIE, createLinkSender };
