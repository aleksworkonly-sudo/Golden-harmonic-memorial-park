'use strict';
const { requireCondition } = require('./errors');
const { selector, sourceKey, collectionFor, contactStamp } = require('./policy');
function selectedSource(credentials) {
  if (credentials.source !== undefined) {
    requireCondition(credentials.customerId === undefined,'INVALID_SOURCE','Use one account selector.');
    return selector(credentials.source);
  }
  return selector({kind:'customer',id:credentials.customerId});
}
async function resolveBuyerSource(tx, db, identity, selected) {
  const s = selector(selected);
  const row = await tx.get(db.collection(collectionFor(s.kind)).doc(s.id));
  const grant = await tx.get(db.collection('portalAccess').doc(sourceKey(s)));
  const data = row.exists ? row.data() : null;
  const g = grant.exists ? grant.data() : null;
  // Presence is authoritative: a revoked grant cannot fall back to customers.authUid.
  const allowed = g ? g.status === 'active' && g.uid === identity.uid && g.kind === s.kind && g.sourceId === s.id &&
    data && g.contactStamp === contactStamp(data) && g.bookingId === (data.canonicalBookingId || null)
    : s.kind === 'customer' && data?.authUid === identity.uid;
  requireCondition(allowed,'FORBIDDEN','You cannot access this account. Contact the office if access has changed.',403);
  return {kind:s.kind,id:s.id,data,key:sourceKey(s),actor:`uid:${identity.uid}`,renew:()=>{}};
}
async function listBuyerSources(tx,db,identity) {
  const [legacy,grants] = await Promise.all([
    tx.get(db.collection('customers').where('authUid','==',identity.uid).limit(51)),
    tx.get(db.collection('portalAccess').where('uid','==',identity.uid).limit(51))
  ]);
  requireCondition(legacy.docs.length <= 50 && grants.docs.length <= 50,'ACCOUNT_REVIEW','Contact the office to review your linked accounts.',409);
  const choices = new Map(legacy.docs.map(d => [sourceKey({kind:'customer',id:d.id}),{kind:'customer',id:d.id}]));
  for(const d of grants.docs) {const g=d.data();choices.set(d.id,{kind:g.kind,id:g.sourceId});}
  const result=[];
  for(const s of choices.values()) {
    try {const scope=await resolveBuyerSource(tx,db,identity,s);result.push({id:s.id,kind:s.kind,
      label:s.kind==='presale'?`Reservation ${s.id}`:String(scope.data.plan?.tierName || 'Plot account').slice(0,120)});}
    catch(e){if(e.code!=='FORBIDDEN')throw e;}
  }
  return result;
}
// Guest history and corrections survive onboarding; only NEW payment intake is gated.
function requireFuturePaymentAccount(scope, terms, isCorrection = false) {
  requireCondition(isCorrection || scope.actor.startsWith('uid:') || !terms?.accountRequiredAfterReceipt,
    'ACCOUNT_REQUIRED','Activate your account to make another payment. Your existing payment remains recorded.',403);
}
module.exports = { selectedSource, resolveBuyerSource, listBuyerSources, requireFuturePaymentAccount };
