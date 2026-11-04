'use strict';
(() => {
  if(!window.React)return;const h=React.createElement,{useState,useEffect,useRef}=React;
  const peso=(n)=>n===null?'Not recorded':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
  async function operationsApi(action,fields={},account=false) {
    const headers={'Content-Type':'application/json'};if(account){if(!window.auth?.currentUser)throw Object.assign(Error('Please sign in again.'),{code:'UNAUTHENTICATED'});headers.Authorization=`Bearer ${await window.auth.currentUser.getIdToken()}`;}
    let response;try{response=await fetch('/api/payment-operations',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action,...fields})});}catch(_){throw Object.assign(Error('Connection interrupted. Retry the same request.'),{uncertain:true});}
    const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(Error(result.error || 'Payment service unavailable.'),{code:result.code,uncertain:response.status>=500});return result;
  }
  function printPayment(){document.body.classList.add('payment-print');const clean=()=>document.body.classList.remove('payment-print');window.addEventListener('afterprint',clean,{once:true});window.print();setTimeout(clean,1000);}
  function Receipt({receipt:r}) {
    return h('section',{className:'pv-card payment-print-area'},h('h2',null,'Payment acknowledgement'),h('p',null,r.notice),h('p',{className:'ps-id'},r.receiptId),
      h('dl',{className:'pv-dates'},[['Received date',r.receivedDate],['Channel',r.channel],['Principal credited',peso(r.creditCentavos)],['Unapplied credit',peso(r.unappliedCentavos)],['Buyer fee',peso(r.buyerFeeCentavos)],['Balance after receipt',peso(r.balanceAfterCentavos)]].map(([k,v])=>h('div',{key:k},h('dt',null,k),h('dd',null,v)))),
      h('button',{className:'pv-secondary',onClick:printPayment},'Print acknowledgement'));
  }
  function PaymentCommunications({mode,customerId,entries,onAccessLost}) {
    const [enabled,setEnabled]=useState(false),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[receipt,setReceipt]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
    const api=(a,fields)=>operationsApi(a,{mode,...(mode==='account'?{customerId}:{}),...fields},mode==='account');
    const run=async(work,apply)=>{const n=++generation.current;setBusy(true);setError('');try{const r=await work();if(n===generation.current)apply(r);}catch(e){if(n===generation.current){if(['FORBIDDEN','SESSION_REQUIRED','UNAUTHENTICATED'].includes(e.code))onAccessLost();else setError(e.message);}}finally{if(n===generation.current)setBusy(false);}};
    const load=(more=false)=>run(()=>api('notices',{cursor:more?cursor:null}),(r)=>{setRows((old)=>more?[...old,...r.rows]:r.rows);setCursor(r.nextCursor);});
    useEffect(()=>{let live=true;fetch('/api/payment-operations',{cache:'no-store'}).then((r)=>r.json()).then((c)=>{if(live && c.enabled){setEnabled(true);load();}}).catch(()=>{});return()=>{live=false;generation.current++;};},[]);
    if(!enabled)return null;
    return h('section',{className:'pv-card'},h('h2',null,'Updates and acknowledgements'),error && h('p',{role:'alert',className:'pv-notice pv-error'},error),
      h('button',{className:'pv-secondary',disabled:busy,onClick:()=>load()},'Refresh updates'),busy && h('p',{role:'status'},'Loading updates…'),
      rows.map((r)=>h('article',{className:'pv-notice',key:r.id},h('strong',null,r.title),h('p',null,r.buyerNote || r.type.replaceAll('_',' ')),h('small',null,new Date(r.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})))),
      !rows.length && !busy && h('p',null,'No updates are available yet.'),cursor && h('button',{className:'pv-secondary',disabled:busy,onClick:()=>load(true)},'Load earlier updates'),
      h('h3',null,'Recorded acknowledgements'),entries.filter((e)=>e.kind==='receipt').map((e)=>h('button',{key:e.id,className:'pv-secondary pv-account',disabled:busy,onClick:()=>run(()=>api('receipt',{receiptId:e.id}),setReceipt)},`View ${e.reference}`)),
      receipt && h(React.Fragment,null,h(Receipt,{receipt}),h('button',{className:'pv-secondary',onClick:()=>setReceipt(null)},'Close acknowledgement')));
  }
  window.paymentOperationsApi=operationsApi;window.PaymentCommunications=PaymentCommunications;window.PaymentReceipt=Receipt;window.printPayment=printPayment;
})();
