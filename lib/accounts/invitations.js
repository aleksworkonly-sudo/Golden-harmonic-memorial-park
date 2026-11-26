'use strict';
const { randomBytes } = require('node:crypto');
const { requireCondition } = require('./errors');
const { selector,sourceKey,collectionFor,contactStamp,emailOf,validEmail,eligible,configuration } = require('./policy');
const { checkBooking } = require('../payments/canonical');
const { requireAdmin } = require('../payments/auth');
const TTL = 24 * 60 * 60 * 1000;
const inviteId = () => randomBytes(32).toString('base64url');
const validInvite = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{43}$/.test(id);
async function readSource(tx,db,selected) {
  const s=selector(selected), key=sourceKey(s);
  const row=await tx.get(db.collection(collectionFor(s.kind)).doc(s.id));
  requireCondition(row.exists,'NOT_ELIGIBLE','Account setup is not available for this record.',409);
  const source=row.data();
  const bookingRow=source.canonicalBookingId ? await tx.get(db.collection('bookings').doc(source.canonicalBookingId)) : null;
  requireCondition(bookingRow?.exists,'NOT_ELIGIBLE','The office must review this record before account setup.',409);
  const booking=bookingRow.data();checkBooking(booking,s.kind,s.id,source);
  return {s,key,source,booking,bookingId:source.canonicalBookingId};
}
async function qualifyingReceipt(tx,db,c,config) {
  const scope=await tx.get(db.collection('paymentSubmissionScopes').doc(c.key));
  const receiptId=scope.exists && scope.data().accountRequiredAfterReceipt;
  const receipt=receiptId ? await tx.get(db.collection('receipts').doc(receiptId)) : null;
  const r=receipt?.exists ? receipt.data() : null;
  requireCondition(r && r.bookingId===c.bookingId && r.submissionScope===c.key &&
    r.ownerBinding===c.booking.ownerBinding && eligible(r,config),'NOT_ELIGIBLE','Account setup follows a verified payment after launch.',409);
  return r;
}
function createInvitationService({db,env=process.env,now=()=>Date.now(),random=inviteId}) {
  const config=configuration(env);
  async function issue(selected,{expectedEmail,force=false,adminIdentity}={}) {
    requireCondition(config.enabled && config.invites,'ACCOUNTS_DISABLED','Account setup is not enabled.',503);
    const id=random(),at=now();requireCondition(validInvite(id),'ACCOUNT_CONFIG','Setup is unavailable.',503);
    return db.runTransaction(async tx=>{
      if(adminIdentity)await requireAdmin(tx,db,adminIdentity);
      const c=await readSource(tx,db,selected),r=await qualifyingReceipt(tx,db,c,config);
      const email=emailOf(c.source.email);
      requireCondition(validEmail(email) && (expectedEmail===undefined || email===emailOf(expectedEmail)),
        'NOT_ELIGIBLE','Account setup is unavailable.',409);
      const grant=await tx.get(db.collection('portalAccess').doc(c.key));
      if(grant.exists) {
        requireCondition(grant.data().status==='active' && grant.data().contactStamp===contactStamp(c.source),
          'ACCOUNT_REVIEW','Contact the office to review your account access.',409);
        return {active:true};
      }
      // Preserve trusted existing logins without issuing a new invitation or changing their UID.
      if(c.s.kind==='customer' && c.source.authUid)return {active:true};
      // Versioned contacts are required; unlinked legacy contacts need office confirmation.
      requireCondition(Number.isSafeInteger(c.source.accessVersion) && c.source.accessVersion>0 ||
        Number.isSafeInteger(c.source.accountContactVersion) && c.source.accountContactVersion>0,
      'CONTACT_REVIEW','The office must verify this contact before account setup.',409);
      const pointer=await tx.get(db.collection('accountInvitationSources').doc(c.key));
      const old=pointer.exists ? await tx.get(db.collection('accountInvitations').doc(pointer.data().inviteId)) : null;
      const previous=old?.exists ? old.data() : null;
      if(previous?.status==='invited' && previous.contactStamp===contactStamp(c.source) && previous.expiresAt>at && !force)
        return {inviteId:old.id};
      const invitation={kind:c.s.kind,sourceId:c.s.id,sourceKey:c.key,bookingId:c.bookingId,email,
        contactStamp:contactStamp(c.source),ownerBinding:c.booking.ownerBinding,qualifyingReceiptId:r.receiptId,
        status:'invited',createdAt:at,expiresAt:at+TTL,claimedUid:null};
      if(previous && previous.status!=='claimed')tx.update(db.collection('accountInvitations').doc(old.id),{status:'revoked'});
      tx.create(db.collection('accountInvitations').doc(id),invitation);
      tx.set(db.collection('accountInvitationSources').doc(c.key),{inviteId:id});
      tx.create(db.collection('accountDeliveryEvents').doc(id),{inviteId:id,state:'queued',attempts:0,nextAttemptAt:at,createdAt:at});
      if(adminIdentity)tx.create(db.collection('auditLogs').doc(`account_invite_${id}`),{action:'account_invitation_issued',actor:adminIdentity.uid,source:c.s,createdAt:at});
      return {inviteId:id};
    });
  }
  return {issue};
}
module.exports={createInvitationService,readSource,qualifyingReceipt,validInvite,TTL};
