'use strict';
const { configuration, bearer, requesterIdentity } = require('./access-http');
const { createAccessService } = require('./access');
const { createReviewService } = require('./review');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');
const { adminRecord } = require('./admin-records');
const allowed={queue:['filters','cursor'],detail:['paymentId'],proof:['paymentId','revisionId'],decide:['command'],record:['kind','id'],count:[]};

function createReviewHandler({env=process.env,services=getFirebaseServices,logger=console}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const config=configuration(env);const enabled=config.enabled && env.PAYMENT_REVIEW_ENABLED==='true';
    if(req.method==='GET') return res.status(200).json({enabled});
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
    if(!enabled) return res.status(503).json({code:'REVIEW_DISABLED',error:'Payment review is not available yet.'});
    let action='unknown',stage='validation';
    try {
      requireCondition(req.headers.origin===config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin'),
        'INVALID_ORIGIN','Open review from the park website.',403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),'INVALID_CONTENT_TYPE','Send JSON.',415);
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      requireCondition(typeof raw==='string' && Buffer.byteLength(raw)<=32768,'BODY_TOO_LARGE','Review request is too large.',413);
      let body;try{body=JSON.parse(raw);}catch(_){throw new PaymentError('INVALID_BODY','Invalid review request.');}
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(allowed,body.action) &&
        Object.keys(body).every((key)=>key==='action' || allowed[body.action].includes(key)),'INVALID_BODY','Unsupported review fields.');
      action=body.action;
      const token=bearer(req);stage='services';const {db,auth}=services();
      stage='traffic';
      await createAccessService({db,auth,origin:config.origin,rateSecret:env.PAYMENT_ACCESS_RATE_SECRET}).checkTraffic(requesterIdentity(req,env));
      const core=createReviewService({db,auth});let result;
      stage=action;
      if(body.action==='queue') result=await core.queue(token,body.filters,body.cursor);
      if(body.action==='count') result=await core.pendingCount(token);
      if(body.action==='detail') result=await core.detail(token,body.paymentId);
      if(body.action==='proof') result=await core.proof(token,body.paymentId,body.revisionId);
      if(body.action==='decide') result=await core.decide(token,body.command);
      if(body.action==='record') result=await adminRecord({db,auth,token,kind:body.kind,id:body.id});
      return res.status(200).json(result);
    } catch(error) {
      if(error instanceof PaymentError) return res.status(error.status).json({code:error.code,error:error.message});
      const missingIndex=[9,'9','failed-precondition','FAILED_PRECONDITION'].includes(error?.code) &&
        /requires an index|index.*(?:building|not ready)/i.test(String(error?.message || ''));
      const grpcCode=Number(error?.code);
      // Exclude tokens, commands, private proof and raw provider messages.
      logger.error('[payment-review]',{action,stage,reason:missingIndex?'missing_index':'unexpected_error',
        grpcCode:Number.isInteger(grpcCode) && grpcCode>=0 && grpcCode<=16?grpcCode:null});
      if(['queue','detail','proof','record','count'].includes(action)) {
        if(missingIndex) return res.status(503).json({code:'REVIEW_INDEX_REQUIRED',
          error:'Payment review needs a database index that is missing or still building. Ask the site administrator to finish the index setup, then reload the queue or case. No payment decision was submitted by this request.'});
        return res.status(503).json({code:'REVIEW_READ_UNAVAILABLE',
          error:'Could not load payment review data. No payment decision was submitted by this request. Retry loading the queue or case.'});
      }
      return res.status(503).json({code:'REVIEW_UNAVAILABLE',error:'The result is uncertain. Retry the same reviewed decision to recover its saved result.'});
    }
  };
}
module.exports={createReviewHandler};
