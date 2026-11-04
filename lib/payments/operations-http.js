'use strict';
const { timingSafeEqual } = require('node:crypto');
const { configuration, bearer, cookieSecret, requesterIdentity } = require('./access-http');
const { createAccessService } = require('./access');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');
const { createReportService } = require('./reports');
const { createOutboxService, createBrevoSender } = require('./outbox');
const fields={notices:['cursor'],receipt:['receiptId'],statement:['bookingId'],collections:['filters'],queue:['state','cursor'],prepare:['eventId'],reconcile:['command'],reminders:['cursor']};
function createOperationsHandler({env=process.env,services=getFirebaseServices,now=()=>Date.now()}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const config=configuration(env),enabled=config.enabled && env.PAYMENT_OPERATIONS_ENABLED==='true';
    if(req.method==='GET')return res.status(200).json({enabled});
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!enabled)return res.status(503).json({code:'OPERATIONS_DISABLED',error:'Payment communications and reports are not enabled.'});
    try{
      requireCondition(req.headers.origin===config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin'),'INVALID_ORIGIN','Open payments from the park website.',403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),'INVALID_CONTENT_TYPE','Send JSON.',415);
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);requireCondition(typeof raw==='string' && Buffer.byteLength(raw)<=8192,'BODY_TOO_LARGE','Request is too large.',413);
      let b;try{b=JSON.parse(raw);}catch(_){throw new PaymentError('INVALID_BODY','Invalid JSON.');}
      const customer=['receipt','notices'].includes(b?.action);
      requireCondition(b && Object.hasOwn(fields,b.action) && Object.keys(b).every((k)=>['action',...(customer?['mode','customerId']:[]),...fields[b.action]].includes(k)),'INVALID_BODY','Unsupported request fields.');
      const {db,auth}=services();await createAccessService({db,auth,rateSecret:env.PAYMENT_ACCESS_RATE_SECRET,now}).checkTraffic(requesterIdentity(req,env));
      const reports=createReportService({db,auth,now}),outbox=createOutboxService({db,auth,now,origin:config.origin});let result;
      if(customer){requireCondition(['account','reservation'].includes(b.mode) && (b.mode!=='reservation' || b.customerId===undefined),'INVALID_BODY','Use verified customer access.');
        const c=b.mode==='account'?{mode:b.mode,idToken:bearer(req),customerId:b.customerId}:{mode:b.mode,secret:cookieSecret(req)};
        result=b.action==='receipt'?await reports.receipt(c,b.receiptId):await reports.notices(c,b.cursor);
      }else{const token=bearer(req);
        if(b.action==='statement')result=await reports.statement(token,b.bookingId);
        if(b.action==='collections')result=await reports.collections(token,b.filters);
        if(b.action==='queue')result=await outbox.queue(token,b.state,b.cursor);
        if(b.action==='prepare')result=await outbox.prepare(token,b.eventId);
        if(b.action==='reconcile')result=await outbox.reconcile(token,b.command);
        if(b.action==='reminders')result=await outbox.reminders(token,b.cursor);
      }return res.status(200).json(result);
    }catch(e){if(e instanceof PaymentError)return res.status(e.status).json({code:e.code,error:e.message});return res.status(503).json({code:'OPERATIONS_UNAVAILABLE',error:'Operation unavailable. Retry the same saved action; do not record another payment.'});}
  };
}
function createMessagingWorker({env=process.env,services=getFirebaseServices,send,now=()=>Date.now()}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');const c=configuration(env);
    if(req.method!=='POST' && req.method!=='GET')return res.status(405).json({error:'Method not allowed.'});
    if(!c.enabled || env.PAYMENT_EMAIL_DISPATCH_ENABLED!=='true' || env.PAYMENT_OPERATIONS_ENABLED!=='true')return res.status(503).json({error:'Messaging worker disabled.'});
    const expected=`Bearer ${env.PAYMENT_WORKER_SECRET || ''}`,actual=req.headers.authorization || '';
    if(typeof env.PAYMENT_WORKER_SECRET!=='string' || env.PAYMENT_WORKER_SECRET.length<32 || typeof actual!=='string' || Buffer.byteLength(actual)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized'});
    try{const {db,auth}=services();const core=createOutboxService({db,auth,origin:c.origin,now,send:send || createBrevoSender({apiKey:env.BREVO_API_KEY,sender:env.SENDER_EMAIL})});return res.status(200).json(await core.tick());}
    catch(_){return res.status(503).json({error:'Messaging worker needs review. Payments remain recorded.'});}
  };
}
module.exports={createOperationsHandler,createMessagingWorker};
