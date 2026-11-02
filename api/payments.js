'use strict';

// Shared deployment entry point; public URLs are preserved by vercel.json.
// The native PayMongo webhook intentionally remains a separate function.
module.exports = require('../lib/payments/router').createPaymentRouter();
