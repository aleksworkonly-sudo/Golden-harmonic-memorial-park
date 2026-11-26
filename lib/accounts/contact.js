'use strict';
const {requireCondition}=require('./errors');
const {requireAdmin}=require('../payments/auth');
const {emailOf,validEmail,collectionFor,configuration}=require('./policy');
const {readSource,qualifyingReceipt}=require('./invitations');

// Office correction before linking only. Existing UID/ownership transfers require reconciliation.
async function confirmContact({db,identity,source,email,expectedVersion,reason,confirmed,env,at}) {
  const normalized=emailOf(email);
  requireCondition(validEmail(normalized) && Number.isSafeInteger(expectedVersion) && expectedVersion>=0 &&
    expectedVersion<Number.MAX_SAFE_INTEGER && confirmed===true && typeof reason==='string' &&
    reason.trim().length>=5 && reason.length<=500,'INVALID_CONTACT','Verify the buyer and enter the email and reason.');
  return db.runTransaction(async tx=>{
    await requireAdmin(tx,db,identity);
    const c=await readSource(tx,db,source);
    await qualifyingReceipt(tx,db,c,configuration(env));
    const grant=await tx.get(db.collection('portalAccess').doc(c.key));
    const pointer=await tx.get(db.collection('accountInvitationSources').doc(c.key));
    requireCondition(!grant.exists && !c.source.authUid,'ACCOUNT_REVIEW','An account is already linked or revoked. Contact and ownership changes require a separate reviewed reconciliation.',409);
    requireCondition((c.source.accountContactVersion || 0)===expectedVersion,'CONTACT_CHANGED','Reload the record; its contact has changed.',409);
    const version=expectedVersion+1;
    tx.update(db.collection(collectionFor(c.s.kind)).doc(c.s.id),{email:normalized,accountContactVersion:version});
    if(pointer.exists)tx.update(db.collection('accountInvitations').doc(pointer.data().inviteId),{status:'revoked'});
    // Invalidate existing financial delivery destinations without changing any financial identity.
    tx.update(db.collection('bookings').doc(c.bookingId),{notificationContact:{enabled:false,verified:false,
      version:(c.booking.notificationContact?.version || 0)+1,ownerBinding:c.booking.ownerBinding}});
    tx.create(db.collection('auditLogs').doc(),{action:'account_contact_confirmed',source:c.s,actor:identity.uid,
      previousEmail:emailOf(c.source.email),email:normalized,version,reason:reason.trim(),createdAt:at});
    return {ok:true,contactVersion:version};
  });
}
module.exports={confirmContact};
