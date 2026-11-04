'use strict';

const { createAccessHandler } = require('./access-http');
const { createSubmissionHandler } = require('./submission-http');
const { createReviewHandler } = require('./review-http');
const { createCashHandler } = require('./cash-http');
const { createLifecycleHandler } = require('./lifecycle-http');
const { createOperationsHandler, createMessagingWorker } = require('./operations-http');

// Vercel rewrites select one function while retaining the incoming request URL.
// Dispatch only by the public pathname, never a caller-controlled query/header.
// The original handlers still own authorization, feature gates and body limits.
function createPaymentRouter(options) {
  const handlers = new Map([
    ['/api/payment-access', createAccessHandler(options)],
    ['/api/payment-submission', createSubmissionHandler(options)],
    ['/api/payment-review', createReviewHandler(options)],
    ['/api/payment-cash', createCashHandler(options)],
    ['/api/payment-lifecycle', createLifecycleHandler(options)],
    ['/api/payment-operations', createOperationsHandler(options)],
    ['/api/payment-messaging-worker', createMessagingWorker(options)]
  ]);

  return function paymentRouter(req, res) {
    const pathname = typeof req.url === 'string' ? req.url.split('?', 1)[0] : '';
    const route = pathname.replace(/\.js$/, '').replace(/\/$/, '');
    const handler = handlers.get(route);
    if (handler) return handler(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(404).json({ error: 'Payment endpoint not found.' });
  };
}

module.exports = { createPaymentRouter };
