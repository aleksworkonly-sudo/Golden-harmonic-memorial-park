'use strict';

class PaymentError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.status = status;
  }
}

function requireCondition(condition, code, message, status = 400) {
  if (!condition) throw new PaymentError(code, message, status);
}

module.exports = { PaymentError, requireCondition };
