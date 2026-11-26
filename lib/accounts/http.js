'use strict';
const {timingSafeEqual,createHmac}=require('node:crypto');
const {configuration,emailOf,selector,sourceKey}=require('./policy');
const {requireCondition,PaymentError}=require('./errors');
const {bearer,isCustomerPaymentOrigin,requesterIdentity}=require('../payments/access-http');
const {getFirebaseServices}=require('../payments/firebase');
const {authenticate,requireAdmin}=require('../payments/auth');
const {createInvitationService}=require('./invitations');
const {createClaimService}=require('./claims');
const {createDeliveryService}=require('./delivery');
const FIELDS={request_setup:['source','email'],setup_context:['inviteId'],complete_claim:['inviteId','termsAccepted'],
  admin_status:['source'],admin_resend:['source'],admin_revoke:['source','reason'],
  admin_contact:['source','email','expectedVersion','reason','confirmed']};
const GENERIC={message:'If this record is eligible, setup instructions will be sent to its registered email. Check your inbox and spam folder.'};
async function limit(db,secret,scope,at,max) {
  requireCondition(typeof secret==='string' && secret.length>=32,'ACCOUNT_CONFIG','Account access is unavailable.',503);
  const id=createHmac('sha256',secret).update(scope).digest('hex');
  const allowed=await db.runTransaction(async tx=>{
    const ref=db.collection('accountAccessLimits').doc(id),row=await tx.get(ref),old=row.exists?row.data():null;
    const state=old && old.resetAt>at?old:{count:0,resetAt:at+15*60000};
    tx.set(ref,{count:Math.min(max,state.count+1),resetAt:state.resetAt});return state.count<max;
  });
  requireCondition(allowed,'RATE_LIMITED','Too many requests. Try again in 15 minutes.',429);
}
function createAccountHandler({env=process.env,services=getFirebaseServices,now=()=>Date.now(),send,link,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),minimumRequestMs=1000}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const config=configuration(env);
    if(req.method==='GET')return res.status(200).json({enabled:config.enabled});
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!config.enabled)return res.status(503).json({code:'ACCOUNTS_DISABLED',error:'Account setup is not available yet.'});
    let action;const started=now();
    try{
      requireCondition(isCustomerPaymentOrigin(req,env),'INVALID_ORIGIN','Open account access from the park website.',403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),'INVALID_CONTENT_TYPE','Send JSON.',415);
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      requireCondition(typeof raw==='string' && Buffer.byteLength(raw)<=4096,'BODY_TOO_LARGE','Request is too large.',413);
      let body;try{body=JSON.parse(raw);}catch(_){throw new PaymentError('INVALID_BODY','Invalid JSON.');}
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(FIELDS,body.action) && Object.keys(body).every(k=>k==='action' || FIELDS[body.action].includes(k)),
        'INVALID_BODY','Unsupported account request.');
      action=body.action;const {db,auth}=services();
      await limit(db,env.PAYMENT_ACCESS_RATE_SECRET,`traffic:${requesterIdentity(req,env)}`,now(),60);
      await limit(db,env.PAYMENT_ACCESS_RATE_SECRET,'all-account-traffic',now(),2000);
      const invites=createInvitationService({db,env,now}),claims=createClaimService({db,auth,env,now});let result;
      if(action==='request_setup') {
        const source=selector(body.source),email=emailOf(body.email);
        requireCondition(email.length<=254 && email.includes('@'),'INVALID_EMAIL','Enter your registered email.');
        await limit(db,env.PAYMENT_ACCESS_RATE_SECRET,`setup:${sourceKey(source)}`,now(),3);
        await limit(db,env.PAYMENT_ACCESS_RATE_SECRET,'all-setup-mail',now(),300);
        try{const issued=await invites.issue(source,{expectedEmail:email});
          // Public requests only queue delivery: provider timing must not reveal an email match.
          if(issued.inviteId)await createDeliveryService({db,auth,env,now,send,link}).resend(issued.inviteId);
        }catch(e){if(!e.status)throw e;}
        result=GENERIC;
      }else if(action==='setup_context')result=await claims.context(bearer(req),body.inviteId);
      else if(action==='complete_claim')result=await claims.complete(bearer(req),body.inviteId,body.termsAccepted);
      else {
        const identity=await authenticate(auth,bearer(req)),source=selector(body.source),key=sourceKey(source);
        await db.runTransaction(tx=>requireAdmin(tx,db,identity));
        if(action==='admin_resend'){
          await limit(db,env.PAYMENT_ACCESS_RATE_SECRET,`setup:${key}`,now(),3);
          result=await invites.issue(source,{adminIdentity:identity});
        }
        if(action==='admin_status')result=await db.runTransaction(async tx=>{
          await requireAdmin(tx,db,identity);
          const c=await require('./invitations').readSource(tx,db,source);
          const grant=await tx.get(db.collection('portalAccess').doc(key)),pointer=await tx.get(db.collection('accountInvitationSources').doc(key));
          const id=pointer.exists?pointer.data().inviteId:null,inv=id?await tx.get(db.collection('accountInvitations').doc(id)):null,
            delivery=id?await tx.get(db.collection('accountDeliveryEvents').doc(id)):null;
          return {email:emailOf(c.source.email),contactVersion:c.source.accountContactVersion || 0,canConfirmContact:!grant.exists && !c.source.authUid,
            access:grant.exists?grant.data().status:c.source.authUid?'legacy_linked':'not_linked',invitation:inv?.exists?inv.data().status:'not_invited',
            delivery:delivery?.exists?delivery.data().state:'not_queued'};
        });
        if(action==='admin_contact')result=await require('./contact').confirmContact({db,identity,source,email:body.email,
          expectedVersion:body.expectedVersion,reason:body.reason,confirmed:body.confirmed,env,at:now()});
        if(action==='admin_revoke') {
          requireCondition(typeof body.reason==='string' && body.reason.trim().length>=5 && body.reason.length<=500,'REASON_REQUIRED','Enter a reason for revocation.');
          result=await db.runTransaction(async tx=>{
            await requireAdmin(tx,db,identity);const ref=db.collection('portalAccess').doc(key),row=await tx.get(ref);
            requireCondition(row.exists,'NOT_FOUND','No account grant exists.',404);
            const pointer=await tx.get(db.collection('accountInvitationSources').doc(key));
            tx.update(ref,{status:'revoked',revokedAt:now(),revokedBy:identity.uid});
            if(pointer.exists)tx.update(db.collection('accountInvitations').doc(pointer.data().inviteId),{status:'revoked'});
            tx.create(db.collection('auditLogs').doc(),{action:'account_revoked',source,actor:identity.uid,reason:body.reason.trim(),createdAt:now()});
            return {ok:true};
          });
        }
        if(action==='admin_resend' && result.inviteId){const delivery=createDeliveryService({db,auth,env,now,send,link});await delivery.resend(result.inviteId,identity);await delivery.dispatch(result.inviteId);}
      }
      if(action==='request_setup')await sleep(Math.max(0,minimumRequestMs-(now()-started)));
      return res.status(200).json(result);
    }catch(e){
      if(action==='request_setup')await sleep(Math.max(0,minimumRequestMs-(now()-started)));
      if(e instanceof PaymentError)return res.status(e.status).json({code:e.code,error:e.message});
      return res.status(503).json({code:'ACCOUNT_UNAVAILABLE',error:'Account setup is temporarily unavailable. Your payment remains recorded.'});
    }
  };
}
function createAccountWorker({env=process.env,services=getFirebaseServices,now,send,link}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed.'});
    const secret=env.ACCOUNT_WORKER_SECRET,expected=`Bearer ${secret}`,actual=req.headers.authorization || '';
    if(typeof secret!=='string' || secret.length<32 || typeof actual!=='string' || Buffer.byteLength(expected)!==Buffer.byteLength(actual) ||
      !timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return res.status(401).json({error:'Unauthorized'});
    try{return res.status(200).json(await createDeliveryService({...services(),env,now,send,link}).tick());}
    catch(_){return res.status(503).json({error:'Account delivery needs review. Payments remain recorded.'});}
  };
}
module.exports={createAccountHandler,createAccountWorker};
