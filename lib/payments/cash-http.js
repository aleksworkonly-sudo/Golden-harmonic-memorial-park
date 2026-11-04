'use strict';
const { configuration, bearer, requesterIdentity } = require('./access-http');
const { createAccessService } = require('./access');
const { createCashService } = require('./cash');
const { getFirebaseServices } = require('./firebase');
const { PaymentError, requireCondition } = require('./errors');
const allowed={context:['sourceKind','sourceId'],queue:['filters','cursor'],detail:['paymentId'],proof:['paymentId','revisionId'],record:['command'],print:['command'],photo:['command'],approve:['command']};

function createCashHandler({env=process.env,services=getFirebaseServices}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const config=configuration(env);const enabled=config.enabled && env.PAYMENT_CASH_ENABLED==='true';
    if(req.method==='GET') return res.status(200).json({enabled});
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed.'});
    if(!enabled) return res.status(503).json({code:'CASH_DISABLED',error:'Cash payments are not available yet.'});
    try {
      requireCondition(req.headers.origin===config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin'),
        'INVALID_ORIGIN','Open cash payments from the park website.',403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),'INVALID_CONTENT_TYPE','Send JSON.',415);
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      requireCondition(typeof raw==='string' && Buffer.byteLength(raw)<=737280,'BODY_TOO_LARGE','Cash request is too large.',413);
      let body;try{body=JSON.parse(raw);}catch(_){throw new PaymentError('INVALID_BODY','Invalid cash request.');}
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(allowed,body.action) &&
        Object.keys(body).every((key)=>key==='action' || allowed[body.action].includes(key)),'INVALID_BODY','Unsupported cash fields.');
      const token=bearer(req);const {db,auth}=services();
      await createAccessService({db,auth,origin:config.origin,rateSecret:env.PAYMENT_ACCESS_RATE_SECRET}).checkTraffic(requesterIdentity(req,env));
      const core=createCashService({db,auth});let result;
      if(body.action==='context') result=await core.context(token,body.sourceKind,body.sourceId);
      if(body.action==='queue') result=await core.queue(token,body.filters,body.cursor);
      if(body.action==='detail') result=await core.detail(token,body.paymentId);
      if(body.action==='proof') result=await core.proof(token,body.paymentId,body.revisionId);
      if(['record','print','photo','approve'].includes(body.action)) result=await core.mutate(token,body.action,body.command);
      return res.status(200).json(result);
    } catch(error) {
      if(error instanceof PaymentError) return res.status(error.status).json({code:error.code,error:error.message});
      return res.status(503).json({code:'CASH_UNAVAILABLE',error:'The result is uncertain. Retry the same cash step to recover its saved result.'});
    }
  };
}
module.exports={createCashHandler};
