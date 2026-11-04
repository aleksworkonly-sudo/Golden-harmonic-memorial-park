'use strict';

const { requireCondition } = require('./errors');

function centavos(value, { positive = false } = {}) {
  requireCondition(Number.isSafeInteger(value) && value >= (positive ? 1 : 0),
    'INVALID_AMOUNT', 'Use a non-negative safe integer amount in centavos.');
  return value;
}

// Parse decimal input without silently rounding a third decimal or using float multiplication.
function pesosToCentavos(value) {
  requireCondition(typeof value === 'string' || typeof value === 'number',
    'INVALID_AMOUNT', 'Enter a decimal peso amount.');
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value));
  requireCondition(match && match[1].length <= 14, 'INVALID_AMOUNT',
    'Enter a non-negative peso amount with at most two decimal places.');
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0'));
  requireCondition(amount <= BigInt(Number.MAX_SAFE_INTEGER), 'INVALID_AMOUNT', 'Amount is too large.');
  return Number(amount);
}

function addCentavos(...amounts) {
  const sum = amounts.reduce((total, amount) => total + BigInt(centavos(amount)), 0n);
  requireCondition(sum <= BigInt(Number.MAX_SAFE_INTEGER), 'INVALID_AMOUNT', 'Total is too large.');
  return Number(sum);
}

function depositForPlots(plotCount) {
  requireCondition(Number.isSafeInteger(plotCount) && plotCount > 0,
    'INVALID_PLOT_COUNT', 'A reservation must contain at least one plot.');
  return centavos(plotCount * 500000, { positive: true });
}

module.exports = { centavos, pesosToCentavos, addCentavos, depositForPlots };
