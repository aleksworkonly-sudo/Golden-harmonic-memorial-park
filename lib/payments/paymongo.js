'use strict';
const {createHmac,timingSafeEqual,createHash}=require('node:crypto');
const {requireCondition,PaymentError}=require('./errors');
const {documentId}=require('./auth');
const {centavos,addCentavos}=require('./money');
const {configuration}=require('./access-http');
const RAW_LIMIT=256*1024;
const providerKey=(account,environment,id)=>require('./identities').hash(['paymongo',account,environment,id]);
function providerConfiguration(env) {
  const access=configuration(env),environment=env.PAYMONGO_ENVIRONMENT,accountId=env.PAYMONGO_ACCOUNT_ID;
  const valid=['test','live'].includes(environment) && /^[A-Za-z0-9_-]{1,128}$/.test(accountId || '') &&
    typeof env.PAYMONGO_SECRET_KEY==='string' && env.PAYMONGO_SECRET_KEY.startsWith(`sk_${environment}_`) &&
    env.PAYMONGO_SECRET_KEY.length>=20 && typeof env.PAYMONGO_WEBHOOK_SECRET_KEY==='string' && env.PAYMONGO_WEBHOOK_SECRET_KEY.length>=20;
  return {...access,environment,accountId,enabled:access.enabled && valid && env.PAYMENT_GATEWAY_ENABLED==='true',
    webhookEnabled:valid && env.PAYMENT_GATEWAY_WEBHOOK_ENABLED==='true'};
}
function buyerFee(principal) {centavos(principal,{positive:true});return Number((BigInt(principal)*25n+500n)/1000n);}
function checkoutUrl(value) {
  let u;try{u=new URL(value);}catch(_){/* fail below */}
  requireCondition(u && u.protocol==='https:' && u.hostname==='checkout.paymongo.com' && !u.username && !u.password && !u.port,
    'PROVIDER_RESPONSE','PayMongo checkout URL needs reconciliation.',503);return u.href;
}
async function rawBody(req) {
  if(Buffer.isBuffer(req.body)){requireCondition(req.body.length<=RAW_LIMIT,'BODY_TOO_LARGE','Webhook is too large.',413);return req.body;}
  if(typeof req.body==='string'){const b=Buffer.from(req.body,'utf8');requireCondition(b.length<=RAW_LIMIT,'BODY_TOO_LARGE','Webhook is too large.',413);return b;}
  requireCondition(req.body===undefined && typeof req[Symbol.asyncIterator]==='function','RAW_BODY_REQUIRED','Original webhook bytes are required.',400);
  const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;requireCondition(size<=RAW_LIMIT,'BODY_TOO_LARGE','Webhook is too large.',413);chunks.push(b);}
  return Buffer.concat(chunks);
}
function verifyWebhook(raw,header,secret,environment,now=Date.now()) {
  requireCondition(Buffer.isBuffer(raw) && raw.length<=RAW_LIMIT && typeof secret==='string' && secret.length>=20 && ['test','live'].includes(environment),
    'INVALID_SIGNATURE','Webhook verification unavailable.',401);
  requireCondition(typeof header==='string' && header.length<=512,'INVALID_SIGNATURE','Invalid webhook signature.',401);
  const parts={};for(const pair of header.split(',')){const m=/^(t|te|li)=(.*)$/.exec(pair.trim());
    requireCondition(m && !Object.hasOwn(parts,m[1]),'INVALID_SIGNATURE','Invalid webhook signature.',401);parts[m[1]]=m[2];}
  const signature=parts[environment==='live'?'li':'te'];
  requireCondition(/^\d{10,12}$/.test(parts.t || '') && /^[a-fA-F0-9]{64}$/.test(signature || '') && Math.abs(now-Number(parts.t)*1000)<=300000,
    'INVALID_SIGNATURE','Invalid or stale webhook signature.',401);
  const expected=createHmac('sha256',secret).update(parts.t+'.').update(raw).digest();
  requireCondition(timingSafeEqual(expected,Buffer.from(signature,'hex')),'INVALID_SIGNATURE','Invalid webhook signature.',401);
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch(_){throw new PaymentError('INVALID_EVENT','Invalid provider JSON.');}
  requireCondition(event?.data?.type==='event' && typeof event.data.id==='string' && event.data.id.startsWith('evt_') &&
    event.data.attributes?.livemode===(environment==='live'),'INVALID_EVENT','Unexpected provider event or environment.',400);
  documentId(event.data.id);return {event:event.data,rawHash:createHash('sha256').update(raw).digest('hex')};
}
function paymentEvidence(p) {
  const a=p?.attributes || {};
  return {id:typeof p?.id==='string'?p.id.slice(0,128):null,status:a.status || null,currency:a.currency || null,amount:a.amount ?? null,
    livemode:a.livemode ?? null,paidAt:Number.isSafeInteger(a.paid_at)?a.paid_at*1000:null,providerFeeCentavos:a.fee ?? null,
    netCentavos:a.net_amount ?? null,paymentIntentId:typeof a.payment_intent_id==='string'?a.payment_intent_id.slice(0,128):null};
}
function sessionEvidence(s) {
  const a=s?.attributes || {};
  return {id:s?.id,type:s?.type,livemode:a.livemode,status:a.status,reference:a.reference_number,
    intentId:a.metadata?.intentId,quoteHash:a.metadata?.quoteHash,paymentIntentId:a.payment_intent?.id || null,
    lineItems:Array.isArray(a.line_items)?a.line_items.slice(0,5).map((l)=>({amount:l.amount,currency:l.currency,quantity:l.quantity})):[],
    payments:Array.isArray(a.payments)?a.payments.slice(0,100).map(paymentEvidence):[]};
}
function sessionMatches(s,intent) {
  return s.type==='checkout_session' && s.livemode===(intent.environment==='live') && s.reference===intent.intentId &&
    s.intentId===intent.intentId && s.quoteHash===intent.quoteHash && s.lineItems.length===2 &&
    s.lineItems[0].amount===intent.principalCentavos && s.lineItems[1].amount===intent.buyerFeeCentavos &&
    s.lineItems.every((l)=>l.currency==='PHP' && l.quantity===1);
}
function createPaymongoClient({secretKey,origin,fetchFn=fetch}) {
  async function request(path,method='GET',payload) {
    const response=await fetchFn(`https://api.paymongo.com/v1/${path}`,{method,signal:AbortSignal.timeout(10000),
      headers:{Authorization:'Basic '+Buffer.from(secretKey+':').toString('base64'),'Content-Type':'application/json',Accept:'application/json'},
      ...(payload?{body:JSON.stringify(payload)}:{})});
    requireCondition(response.ok,'PROVIDER_UNAVAILABLE','PayMongo result needs recovery. Do not create a replacement checkout.',503);
    const raw=await response.text();requireCondition(Buffer.byteLength(raw)<=RAW_LIMIT,'PROVIDER_RESPONSE','Provider response is too large.',503);
    let body;try{body=JSON.parse(raw);}catch(_){throw new PaymentError('PROVIDER_RESPONSE','Provider response needs recovery.',503);}
    requireCondition(body?.data,'PROVIDER_RESPONSE','Provider response needs recovery.',503);return body.data;
  }
  return {
    create:async(i)=>request('checkout_sessions','POST',{data:{attributes:{
      line_items:[{name:'Golden Harmonic '+i.quote.purpose,amount:i.principalCentavos,currency:'PHP',quantity:1},
        {name:'Buyer processing fee (2.5%)',amount:i.buyerFeeCentavos,currency:'PHP',quantity:1}],
      payment_method_types:i.methods,send_email_receipt:false,show_description:true,show_line_items:true,
      reference_number:i.intentId,metadata:{intentId:i.intentId,quoteHash:i.quoteHash},
      success_url:origin+'/my-payments.html?mode='+i.accessMode+'&gateway_return=1',cancel_url:origin+'/my-payments.html?mode='+i.accessMode+'&gateway_return=1'
    }}}),
    retrieve:async(id)=>request('checkout_sessions/'+documentId(id)),
    expire:async(id)=>request('checkout_sessions/'+documentId(id)+'/expire','POST')
  };
}
module.exports={providerConfiguration,providerKey,buyerFee,checkoutUrl,rawBody,verifyWebhook,paymentEvidence,sessionEvidence,sessionMatches,createPaymongoClient,RAW_LIMIT};
