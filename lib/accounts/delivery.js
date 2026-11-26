'use strict';
const { randomUUID }=require('node:crypto');
const {requireAdmin}=require('../payments/auth');
const {PaymentError}=require('./errors');
const {hash}=require('./policy');
const { configuration,contactStamp }=require('./policy');
const { createInvitationService,readSource }=require('./invitations');
const { createActionLink }=require('./firebase-auth');
const { createBrevoSender }=require('../payments/outbox');
function createDeliveryService({db,auth,env=process.env,now=()=>Date.now(),send,link}) {
  const config=configuration(env),invitations=createInvitationService({db,env,now});
  const origin=env.PAYMENT_ACCESS_ORIGIN;
  const sender=send || createBrevoSender({apiKey:env.BREVO_API_KEY,sender:env.SENDER_EMAIL,
    fetchFn:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(5000)})});
  async function resend(id,adminIdentity) {
    return db.runTransaction(async tx=>{
      if(adminIdentity)await requireAdmin(tx,db,adminIdentity);
      const ref=db.collection('accountDeliveryEvents').doc(id),row=await tx.get(ref);
      if(!row.exists)return;
      const e=row.data();
      if(!['accepted','failed','uncertain'].includes(e.state) || e.attempts>=5 || (e.updatedAt || e.createdAt)+60000>now())return;
      tx.update(ref,{state:'retry',nextAttemptAt:now()});
      if(adminIdentity)tx.create(db.collection('auditLogs').doc(),{action:'account_invitation_resent',inviteId:id,actor:adminIdentity.uid,createdAt:now()});
    });
  }
  async function dispatch(id) {
    if(!config.enabled || !config.dispatch)return {state:'disabled'};
    const lease=randomUUID(),at=now();
    const claim=await db.runTransaction(async tx=>{
      const ref=db.collection('accountDeliveryEvents').doc(id),row=await tx.get(ref);
      if(!row.exists)return null;
      const e=row.data();
      if(e.state==='sending' && e.leaseUntil<=at){tx.update(ref,{state:'uncertain'});return null;}
      if(!['queued','retry'].includes(e.state) || e.nextAttemptAt>at || e.attempts>=5)return null;
      const inv=await tx.get(db.collection('accountInvitations').doc(id)),i=inv.exists?inv.data():null;
      let valid=i && i.status==='invited' && i.expiresAt>at;
      if(valid) {try {const c=await readSource(tx,db,{kind:i.kind,id:i.sourceId});valid=i.contactStamp===contactStamp(c.source);}
        catch(e){if(!(e instanceof PaymentError))throw e;valid=false;}}
      if(!valid){tx.update(ref,{state:'suppressed'});return null;}
      tx.update(ref,{state:'sending',lease,leaseUntil:at+60000,attempts:e.attempts+1});
      return {i,attempts:e.attempts+1};
    });
    if(!claim)return {state:'not_claimed'};
    let outcome;
    try {
      let timer;
      const url=await Promise.race([(link || createActionLink(auth,origin))(claim.i.email,id),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Link generation timed out')),3000);})]).finally(()=>clearTimeout(timer));
      // Action URL exists only in memory and the outbound message, never in database/logs.
      outcome=await sender({to:claim.i.email,subject:'Activate your Golden Harmonic account',
        text:`You can now set up your buyer account. Open the link below to verify your email and choose a password:\n\n${url}\n\nAlready have an account? Use the same email to connect your records. If you did not expect this email, contact our office.`,
        eventId:`account_${id}`,providerKey:hash([id,claim.attempts]).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,'$1-$2-$3-$4-$5')});
    }catch(_){outcome={state:'uncertain'};}
    const state=['accepted','retry','failed','uncertain'].includes(outcome?.state)?outcome.state:'uncertain';
    return db.runTransaction(async tx=>{
      const ref=db.collection('accountDeliveryEvents').doc(id),row=await tx.get(ref);
      if(!row.exists || row.data().lease!==lease)return {state:'uncertain'};
      const result={state:state==='retry' && claim.attempts>=5?'failed':state,
        messageId:typeof outcome.messageId==='string'?outcome.messageId.slice(0,300):null,
        nextAttemptAt:now()+Math.min(3600000,60000*2**claim.attempts),updatedAt:now()};
      tx.update(ref,result);return {state:result.state};
    });
  }
  async function tick({batchSize=5,dispatchMail=true}={}) {
    if(!config.enabled || !config.invites)return {state:'disabled'};
    const events=await db.runTransaction(async tx=>(await tx.get(db.collection('accountPaymentEvents').where('state','==','queued').limit(batchSize))).docs.map(r=>({id:r.id,...r.data()})));
    for(const row of events) {
      let result,state='prepared';
      try{result=await invitations.issue(row.source);}
      catch(e){if(!e.status)throw e;state='needs_review';}
      await db.runTransaction(async tx=>{const ref=db.collection('accountPaymentEvents').doc(row.id),latest=await tx.get(ref);
        if(latest.exists && latest.data().state==='queued')tx.update(ref,{state,inviteId:result?.inviteId || null,updatedAt:now()});});
    }
    if(!dispatchMail)return {prepared:events.length,results:[]};
    const due=await db.runTransaction(async tx=>{
      const rows=[];
      for(const state of ['queued','retry','sending']) {
        const q=db.collection('accountDeliveryEvents').where('state','==',state);
        const found=await tx.get((state==='sending'?q.where('leaseUntil','<=',now()).orderBy('leaseUntil','asc'):
          q.where('nextAttemptAt','<=',now()).orderBy('nextAttemptAt','asc')).limit(5));
        rows.push(...found.docs.map(r=>({id:r.id,at:state==='sending'?0:r.data().nextAttemptAt,state})));
      }
      return [...rows.filter(r=>r.state==='sending'),...rows.filter(r=>r.state!=='sending').sort((a,b)=>a.at-b.at).slice(0,batchSize)].map(r=>r.id);
    });
    const results=[];for(const id of due)results.push({id,...await dispatch(id)});
    return {prepared:events.length,results};
  }
  return {dispatch,tick,resend};
}
// Awaited after a financial commit; never add Auth/provider network latency to payment responses.
async function afterPayment({db,auth,env=process.env}) {
  if(!configuration(env).enabled)return;
  try{await createDeliveryService({db,auth,env}).tick({batchSize:1,dispatchMail:false});}catch(_){/* durable event remains for authenticated worker */}
}
module.exports={createDeliveryService,afterPayment};
