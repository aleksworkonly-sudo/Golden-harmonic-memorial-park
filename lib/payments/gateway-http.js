'use strict';
const {bearer,cookieSecret,requesterIdentity}=require('./access-http');
const {createAccessService}=require('./access');
const {getFirebaseServices}=require('./firebase');
const {PaymentError,requireCondition}=require('./errors');
const {createGatewayService}=require('./gateway');
const {providerConfiguration,createPaymongoClient,rawBody,verifyWebhook}=require('./paymongo');
const fields={context:[],create:['command'],queue:['kind','cursor'],detail:['eventKey'],recover:['command'],resolve:['command']};
function createGatewayHandler({env=process.env,services=getFirebaseServices,client,now=()=>Date.now()}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
    const config=providerConfiguration(env);
    if(req.method==='GET')return res.status(200).json({enabled:config.enabled});
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    if(!config.enabled)return res.status(503).json({code:'GATEWAY_DISABLED',error:'Online checkout is not enabled. Please contact the office.'});
    try{
      requireCondition(req.headers.origin===config.origin && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin'),'INVALID_ORIGIN','Open payments from the park website.',403);
      requireCondition(/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''),'INVALID_CONTENT_TYPE','Send JSON.',415);
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);requireCondition(typeof raw==='string' && Buffer.byteLength(raw)<=32768,'BODY_TOO_LARGE','Request is too large.',413);
      let body;try{body=JSON.parse(raw);}catch(_){throw new PaymentError('INVALID_BODY','Invalid JSON.');}
      const customer=['context','create'].includes(body?.action);
      requireCondition(body && !Array.isArray(body) && Object.hasOwn(fields,body.action) && Object.keys(body).every((k)=>['action',...(customer?['mode','customerId']:[]),...fields[body.action]].includes(k)),
        'INVALID_BODY','Unsupported gateway details.');
      const {db,auth}=services();await createAccessService({db,auth,origin:config.origin,rateSecret:env.PAYMENT_ACCESS_RATE_SECRET,now}).checkTraffic(requesterIdentity(req,env));
      const core=createGatewayService({db,auth,config,now,client:client || createPaymongoClient({secretKey:env.PAYMONGO_SECRET_KEY,origin:config.origin})});let result;
      if(customer){requireCondition(['account','reservation'].includes(body.mode) && (body.mode!=='reservation' || !Object.hasOwn(body,'customerId')),'INVALID_BODY','Use your verified account or reservation.');
        const c=body.mode==='account'?{mode:body.mode,customerId:body.customerId,idToken:bearer(req)}:{mode:body.mode,secret:cookieSecret(req)};
        result=body.action==='context'?await core.context(c):await core.create(c,body.command);
      }else{
        const token=bearer(req);
        if(body.action==='queue')result=await core.adminQueue(token,body.kind,body.cursor);
        if(body.action==='detail')result=await core.adminDetail(token,body.eventKey);
        if(body.action==='recover')result=await core.recover(token,body.command);
        if(body.action==='resolve')result=await core.resolve(token,body.command);
      }
      return res.status(200).json(result);
    }catch(e){if(e instanceof PaymentError)return res.status(e.status).json({code:e.code,error:e.message});
      return res.status(503).json({code:'GATEWAY_UNAVAILABLE',error:'The result is uncertain. Refresh the saved attempt or retry the identical request. Do not start a replacement checkout.'});}
  };
}
function createWebhookHandler({env=process.env,services=getFirebaseServices,now=()=>Date.now()}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
    const config=providerConfiguration(env);if(!config.webhookEnabled)return res.status(503).json({code:'WEBHOOK_DISABLED',error:'Webhook processing is not enabled.'});
    try{
      const raw=await rawBody(req),verified=verifyWebhook(raw,req.headers['paymongo-signature'],env.PAYMONGO_WEBHOOK_SECRET_KEY,config.environment,now());
      const {db,auth}=services();const result=await createGatewayService({db,auth,config,now}).accept(verified.event,verified.rawHash);
      return res.status(200).json({received:true,state:result.state});
    }catch(e){if(e instanceof PaymentError)return res.status(e.status).json({code:e.code,error:e.message});
      return res.status(503).json({code:'WEBHOOK_UNAVAILABLE',error:'Provider event was not acknowledged. Retry delivery.'});}
  };
}
function createWebhookWebHandler(options) {
  const handler=createWebhookHandler(options);
  return async(request)=>{
    const headers=new Headers();let status=200,result;
    const req={method:request.method,headers:Object.fromEntries(request.headers),async *[Symbol.asyncIterator](){
      if(request.body)for await(const chunk of request.body)yield chunk;
    }};
    const res={setHeader:(key,value)=>headers.set(key,value),status(code){status=code;return this;},json(value){result=value;return this;}};
    await handler(req,res);headers.set('Content-Type','application/json');return new Response(JSON.stringify(result),{status,headers});
  };
}
module.exports={createGatewayHandler,createWebhookHandler,createWebhookWebHandler};
