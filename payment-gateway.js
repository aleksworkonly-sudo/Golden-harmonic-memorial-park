'use strict';
(() => {
  if(!window.React)return;
  const h=React.createElement,{useEffect,useState,useRef}=React;
  const peso=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
  async function gatewayApi(action,fields={},account=false) {
    const headers={'Content-Type':'application/json'};
    if(account){if(!window.auth?.currentUser)throw Object.assign(Error('Please sign in again.'),{code:'UNAUTHENTICATED'});headers.Authorization=`Bearer ${await window.auth.currentUser.getIdToken()}`;}
    let response;try{response=await fetch('/api/paymongo-checkout',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action,...fields})});}
    catch(_){throw Object.assign(Error('Connection interrupted. Retry the same request; do not start another checkout.'),{uncertain:true});}
    let data;try{data=await response.json();}catch(_){throw Object.assign(Error('Response uncertain. Retrieve your saved attempt before paying.'),{uncertain:true});}
    if(!response.ok)throw Object.assign(Error(data.error || 'Gateway request failed.'),{code:data.code,uncertain:response.status>=500});return data;
  }
  function PaymentGateway({mode,customerId,onAccessLost}) {
    const [enabled,setEnabled]=useState(null),[data,setData]=useState(null),[offerId,setOfferId]=useState(''),[command,setCommand]=useState(null);
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
    const ticket=useRef(0),mounted=useRef(true),alert=useRef(null),heading=useRef(null);
    const api=(action,extra={})=>gatewayApi(action,{mode,...(mode==='account'?{customerId}:{}),...extra},mode==='account');
    const apply=(d)=>{setData(d);setOfferId(d.offers[0]?.id || '');};
    const run=async(work,save)=>{const t=++ticket.current;setBusy(true);setError('');try{const result=await work();if(mounted.current && t===ticket.current)save(result);}
      catch(e){if(mounted.current && t===ticket.current){if(['UNAUTHENTICATED','SESSION_REQUIRED','FORBIDDEN'].includes(e.code))onAccessLost();else setError(e.message);}}
      finally{if(mounted.current && t===ticket.current)setBusy(false);}};
    useEffect(()=>{mounted.current=true;run(async()=>{const config=await fetch('/api/paymongo-checkout',{cache:'no-store'}).then((r)=>r.json());return config.enabled?{enabled:true,data:await api('context')}:{enabled:false};},
      (r)=>{setEnabled(r.enabled);if(r.data)apply(r.data);});return()=>{mounted.current=false;ticket.current++;};},[]);
    useEffect(()=>{if(error)alert.current?.focus();},[error]);useEffect(()=>{if(command)heading.current?.focus();},[command]);
    const offer=data?.offers.find((o)=>o.id===offerId);
    const save=()=>run(async()=>{try{return await api('create',{command});}catch(e){if(e.uncertain)setUncertain(true);throw e;}},(saved)=>{
      setCommand(null);setUncertain(false);setData((old)=>({...old,active:saved,offers:[],history:[saved,...old.history.filter((i)=>i.intentId!==saved.intentId)]}));});
    const status=(i)=>({creating:'Checkout creation pending — contact the office if it does not finish.',creation_uncertain:'Checkout creation needs recovery. Do not pay through a replacement.',ready:'Awaiting confirmed payment.',paid:'Payment recorded.',linked:'Payment linked to an existing receipt; no second credit.',expired:'Checkout expired — no new payment can be made through this session.',needs_reconciliation:'Provider payment needs office reconciliation.'}[i.state] || 'Office review needed.');
    return h('section',{className:'pv-card','aria-label':'PayMongo online payments'},h('p',{className:'pv-eyebrow'},'PayMongo'),h('h2',null,'Pay online securely'),
      h('p',{className:'pv-muted'},'Review the approved principal and 2.5% buyer fee before opening checkout. Returning from PayMongo does not confirm payment; refresh to check the recorded result.'),
      error&&h('div',{role:'alert',tabIndex:-1,ref:alert,className:'pv-notice pv-error'},error),busy&&h('p',{role:'status'},'Please wait…'),
      enabled===false?h('p',{className:'pv-notice'},'Online checkout is not enabled yet. Contact the office for assistance.'):data&&h(React.Fragment,null,
        !command&&h('button',{className:'pv-secondary',disabled:busy,onClick:()=>run(()=>api('context'),apply)},'Refresh checkout status'),
        data.blocker&&h('p',{className:'pv-notice pv-warning'},data.blocker),
        command?h('div',null,h('h3',{ref:heading,tabIndex:-1},'Review online payment'),
          h('p',null,`${offer.purpose} · principal ${peso(offer.principalCentavos)} · buyer fee ${peso(offer.buyerFeeCentavos)} · total ${peso(offer.totalCentavos)}`),
          uncertain&&h('p',{className:'pv-notice'},'Response uncertain. Keep this request unchanged and recover the saved attempt.'),
          h('div',{className:'pv-actions'},h('button',{className:'pv-primary',disabled:busy,onClick:save},uncertain?'Retry same checkout request':'Create secure checkout'),
            !uncertain&&h('button',{className:'pv-secondary',disabled:busy,onClick:()=>setCommand(null)},'Back'))):
        data.active?h('div',{className:'ps-case'},h('h3',null,'Current checkout'),h('p',{className:'ps-id'},data.active.intentId),h('p',{role:'status'},status(data.active)),
          h('p',null,`Principal ${peso(data.active.principalCentavos)} + buyer fee ${peso(data.active.buyerFeeCentavos)} = ${peso(data.active.totalCentavos)}`),
          data.active.checkoutUrl&&h('a',{className:'pv-primary',href:data.active.checkoutUrl,referrerPolicy:'no-referrer'},'Continue to PayMongo')):
        data.offers.length?h('form',{onSubmit:(e)=>{e.preventDefault();setUncertain(false);setCommand({requestId:crypto.randomUUID(),offerId,scopeVersion:data.scopeVersion});}},
          h('div',{className:'pv-field'},h('label',{htmlFor:'gateway-offer'},'Approved online payment'),h('select',{id:'gateway-offer',value:offerId,onChange:(e)=>setOfferId(e.target.value)},data.offers.map((o)=>h('option',{key:o.id,value:o.id},`${o.purpose} · ${peso(o.principalCentavos)} + ${peso(o.buyerFeeCentavos)} fee`)))),
          h('button',{className:'pv-primary',disabled:busy},'Review online checkout')):h('p',null,'The office must prepare an approved payment option before you can start a checkout.'),
        h('h3',null,'Recent checkouts'),data.history.map((i)=>h('article',{key:i.intentId,className:'ps-case'},h('p',{className:'ps-id'},i.intentId),h('p',null,status(i)),
          h('p',null,`Total ${peso(i.totalCentavos)} including ${peso(i.buyerFeeCentavos)} buyer fee.`),i.receiptId&&h('p',null,`Acknowledgement ${i.receiptId}. Refresh payment history for principal credit.`)))));
  }
  window.gatewayApi=gatewayApi;window.PaymentGateway=PaymentGateway;
})();
