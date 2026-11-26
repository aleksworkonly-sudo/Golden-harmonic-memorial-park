'use strict';
const { createHash } = require('node:crypto');
const { requireCondition } = require('./errors');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const emailOf = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = (value) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function selector(value) {
  requireCondition(value && !Array.isArray(value) && Object.keys(value).every(k => ['kind','id'].includes(k)) &&
    ['customer','presale'].includes(value.kind) && typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.id),
  'INVALID_SOURCE', 'Choose a valid account or reservation.');
  return { kind:value.kind, id:value.id };
}
const sourceKey = (s) => hash([s.kind,s.id]);
const collectionFor = (kind) => kind === 'presale' ? 'presaleApplications' : 'customers';
// Contact authority must be versioned by every office contact writer. Fingerprint also catches current drift.
const contactStamp = (s) => hash([emailOf(s.email),s.accessVersion ?? null,s.accountContactVersion ?? null,s.mobileKey || '',s.phone || '',s.authUid || '',s.canonicalBookingId || '']);
function configuration(env = process.env) {
  const launchAt = Date.parse(env.ACCOUNT_LAUNCH_AT || '');
  const policy = env.ACCOUNT_INVITE_POLICY;
  const configured = Number.isSafeInteger(launchAt) && launchAt > 0 && policy === 'positive_credit';
  return { enabled:env.ACCOUNT_ACCESS_ENABLED === 'true', invites:configured && env.ACCOUNT_INVITES_ENABLED === 'true',
    dispatch:env.ACCOUNT_EMAIL_DISPATCH_ENABLED === 'true', launchAt, policy };
}
function eligible(receipt, config) {
  return config.invites && Number.isSafeInteger(receipt?.recordedAt) && receipt.recordedAt >= config.launchAt &&
    Number.isSafeInteger(receipt.contractCreditCentavos) && receipt.contractCreditCentavos > 0;
}
module.exports = { hash, emailOf, validEmail, selector, sourceKey, collectionFor, contactStamp, configuration, eligible };
