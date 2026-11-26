'use strict';
const { authenticate } = require('../payments/auth');
const { requireCondition } = require('./errors');
const { emailOf, validEmail } = require('./policy');
async function verifiedIdentity(auth, token) {
  const identity = await authenticate(auth,token);
  const user = await auth.getUser(identity.uid);
  const email = emailOf(user.email);
  requireCondition(!user.disabled && user.emailVerified === true && validEmail(email),
    'EMAIL_VERIFICATION_REQUIRED','Verify your account email before connecting payment records.',403);
  return { uid:identity.uid, email };
}
module.exports = { verifiedIdentity };
