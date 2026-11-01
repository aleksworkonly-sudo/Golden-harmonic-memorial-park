'use strict';
const { createHash } = require('node:crypto');
const hash = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
// Shared with CP1: account versions and channel labels must never reset uniqueness.
const manualEconomicId = (accountId, reference) => hash(['manual-receipt-v1',accountId,reference.trim()]);
const receiptIdFor = (paymentId) => `PAY-${hash(['payment',paymentId])}`;
const cashEconomicId = (officeId, reference) => hash(['cash-receipt-v1',officeId,reference.trim()]);
module.exports = { hash, manualEconomicId, cashEconomicId, receiptIdFor };
