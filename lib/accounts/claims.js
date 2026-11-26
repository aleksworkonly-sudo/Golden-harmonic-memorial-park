'use strict';
const { requireCondition } = require('./errors');
const { verifiedIdentity } = require('./identity');
const { configuration,contactStamp,emailOf } = require('./policy');
const { readSource,qualifyingReceipt,validInvite } = require('./invitations');
const { resolveBuyerSource } = require('./access');
function createClaimService({db,auth,env=process.env,now=()=>Date.now()}) {
  async function inspect(tx,identity,id) {
    requireCondition(validInvite(id),'INVALID_INVITE','Request a new account setup link.',400);
    const row=await tx.get(db.collection('accountInvitations').doc(id));
    const i=row.exists?row.data():null;
    requireCondition(i && i.email===identity.email,'INVALID_INVITE','Sign in with the email that received this invitation.',403);
    const c=await readSource(tx,db,{kind:i.kind,id:i.sourceId});
    const staff=await tx.get(db.collection('users').doc(identity.uid));
    requireCondition(!staff.exists || !['staff','admin','superadmin'].includes(staff.data().role),'ACCOUNT_REVIEW','The office must review this account before linking buyer records.',409);
    requireCondition(i.contactStamp===contactStamp(c.source) && i.bookingId===c.bookingId && i.ownerBinding===c.booking.ownerBinding && emailOf(c.source.email)===identity.email,
      'CONTACT_CHANGED','Your contact or contract changed. Ask the office for a new setup link.',409);
    if(i.status==='claimed') {
      requireCondition(i.claimedUid===identity.uid,'ACCOUNT_CONFLICT','This record is already connected to another account.',409);
      await resolveBuyerSource(tx,db,identity,c.s);
      return {i,c,complete:true};
    }
    requireCondition(i.status==='invited' && i.expiresAt>now(),'INVITE_EXPIRED','This invitation expired. Request a new setup link.',409);
    await qualifyingReceipt(tx,db,c,configuration(env));
    const grant=await tx.get(db.collection('portalAccess').doc(c.key));
    requireCondition(!grant.exists,'ACCOUNT_CONFLICT','This record already has an access decision. Contact the office.',409);
    requireCondition(!c.source.authUid || c.source.authUid===identity.uid,'ACCOUNT_CONFLICT','The office must review the existing account link.',409);
    return {i,c,complete:false};
  }
  async function context(token,id) {
    const identity=await verifiedIdentity(auth,token);
    return db.runTransaction(async tx=>{const {c,complete}=await inspect(tx,identity,id);return {email:identity.email,source:c.s,complete};});
  }
  async function complete(token,id,termsAccepted) {
    requireCondition(termsAccepted===true,'TERMS_REQUIRED','Accept the account terms and privacy notice.');
    const identity=await verifiedIdentity(auth,token),at=now();
    return db.runTransaction(async tx=>{
      const {i,c,complete}=await inspect(tx,identity,id);
      if(complete)return {ok:true,source:c.s};
      const profile=await tx.get(db.collection('portalProfiles').doc(identity.uid));
      tx.create(db.collection('portalAccess').doc(c.key),{uid:identity.uid,kind:c.s.kind,sourceId:c.s.id,
        bookingId:c.bookingId,contactStamp:i.contactStamp,status:'active',claimedAt:at,inviteId:id});
      tx.set(db.collection('portalProfiles').doc(identity.uid),{...(profile.exists?profile.data():{}),setupState:'active',
        termsVersion:'2026-11-26',privacyVersion:'2026-11-26',acceptedAt:at,updatedAt:at});
      tx.update(db.collection('accountInvitations').doc(id),{status:'claimed',claimedUid:identity.uid,claimedAt:at});
      tx.update(db.collection('bookings').doc(c.bookingId),{notificationContact:{enabled:true,verified:true,email:identity.email,
        version:(c.booking.notificationContact?.version || 0)+1,ownerBinding:c.booking.ownerBinding,verifiedAt:at}});
      tx.create(db.collection('auditLogs').doc(`account_claim_${id}`),{action:'account_claimed',actor:identity.uid,
        sourceKind:c.s.kind,sourceId:c.s.id,createdAt:at});
      return {ok:true,source:c.s};
    });
  }
  return {context,complete};
}
module.exports={createClaimService};
