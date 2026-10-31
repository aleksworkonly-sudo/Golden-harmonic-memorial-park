'use strict';

// Reference + mobile is no longer authorization to read private payment history.
// Keeping the old lookup would bypass the reservation email session.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ code: 'EMAIL_ACCESS_REQUIRED',
    error: 'Open My payments and request an email verification link.', path: '/my-payments' });
};
