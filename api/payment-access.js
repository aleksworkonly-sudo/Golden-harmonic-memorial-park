'use strict';

// CP2 read-only financial access; activation requires configuration and rules review.
// Only access tokens/sessions/limits change here; this never posts financial entries.
module.exports = require('../lib/payments/access-http').createAccessHandler();
