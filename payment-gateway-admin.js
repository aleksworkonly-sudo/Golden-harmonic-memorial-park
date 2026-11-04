'use strict';
(() => {
  if(!window.React || !window.ReactDOM)return;
  const h=React.createElement,{useState,useEffect,useRef}=React,peso=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format((n || 0)/100);
  const money=(v)=>{const m=/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(v || '0');const n=m?Number(m[1])*100+Number((m[2] || '').padEnd(2,'0')):NaN;if(!Number.isSafeInteger(n))throw Error('Use peso amounts with at most two decimals.');return n;};
  function App() {
    const [enabled,setEnabled]=useState(null),[signed,setSigned]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[kind,setKind]=useState('events');
    const [detail,setDetail]=useState(null),[intentId,setIntentId]=useState(''),[sessionId,setSessionId]=useState(''),[expire,setExpire]=useState(false);
    const [action,setAction]=useState('retry'),[reason,setReason]=useState(''),[receiptId,setReceiptId]=useState(''),[allocations,setAllocations]=useState({}),[distinct,setDistinct]=useState(false);
    const [command,setCommand]=useState(null),[uncertain,setUncertain]=useState(false);const ticket=useRef(0),uid=useRef(null),alert=useRef(null),heading=useRef(null);
    const api=(a,f)=>window.gatewayApi(a,f,true);
    const clear=()=>{ticket.current++;uid.current=null;setSigned(false);setRows([]);setCursor(null);setDetail(null);setIntentId('');setSessionId('');setCommand(null);setAllocations({});setReceiptId('');setReason('');setPassword('');setError('');setMessage('');setBusy(false);setUncertain(false);};
    const run=async(work,apply)=>{const t=++ticket.current;setBusy(true);setError('');setMessage('');try{const result=await work();if(t===ticket.current)apply(result);}
      catch(e){if(t===ticket.current){if(['UNAUTHENTICATED','FORBIDDEN'].includes(e.code))clear();setError(e.message);}}
      finally{if(t===ticket.current)setBusy(false);}};
    const queue=(nextKind=kind,more=false)=>run(()=>api('queue',{kind:nextKind,cursor:more?cursor:null}),(q)=>{setKind(nextKind);setRows((old)=>more?[...old,...q.rows]:q.rows);setCursor(q.nextCursor);setSigned(true);});
    useEffect(()=>{let live=true;fetch('/api/paymongo-checkout',{cache:'no-store'}).then((r)=>r.json()).then((c)=>{if(live)setEnabled(c.enabled);}).catch(()=>{if(live)setEnabled(false);});
      const off=window.auth?.onAuthStateChanged((u)=>{if(uid.current && u?.uid!==uid.current)clear();});const restore=(e)=>{if(e.persisted)clear();};window.addEventListener('pageshow',restore);
      return()=>{live=false;ticket.current++;off?.();window.removeEventListener('pageshow',restore);};},[]);
    useEffect(()=>{if(!signed)return;const timer=setTimeout(clear,15*60*1000);return()=>clearTimeout(timer);},[signed]);
    useEffect(()=>{if(error)alert.current?.focus();},[error]);useEffect(()=>{heading.current?.focus();},[command,detail]);
    const login=(e)=>{e.preventDefault();run(async()=>{await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);const r=await window.auth.signInWithEmailAndPassword(email,password);uid.current=r.user.uid;return api('queue',{kind});},(q)=>{setSigned(true);setPassword('');setRows(q.rows);setCursor(q.nextCursor);});};
    const stage=(operation,payload)=>{setUncertain(false);setCommand({operation,payload});};
    const decide=(e)=>{e.preventDefault();try{const c={eventKey:detail.event.eventKey,requestId:crypto.randomUUID(),action,reason};
      if(action==='link_receipt')c.receiptId=receiptId;
      if(action==='post'){if(!distinct || !detail.booking || !detail.intent)throw Error('Confirm distinct money and a linked contract first.');
        const principal=detail.intent.principalCentavos,credit=Math.min(principal,detail.booking.balanceCentavos);
        const a=detail.booking.items.map((i)=>({itemId:i.itemId,centavos:money(allocations[i.itemId])})).filter((i)=>i.centavos>0);
        if(a.reduce((n,i)=>n+i.centavos,0)!==credit)throw Error(`Allocate exactly ${peso(credit)} to principal.`);
        Object.assign(c,{expectedBookingVersion:detail.booking.version,allocations:a,unappliedCentavos:principal-credit,distinctConfirmed:true});}
      stage('resolve',c);
    }catch(ex){setError(ex.message);}};
    const save=()=>run(async()=>{try{return await api(command.operation,{command:command.payload});}catch(e){if(e.uncertain)setUncertain(true);throw e;}},(r)=>{
      setCommand(null);setDetail(null);setUncertain(false);setMessage(`Saved provider result: ${r.state}${r.receiptId?' · '+r.receiptId:''}.`);
      const t=ticket.current;api('queue',{kind}).then((q)=>{if(t===ticket.current){setRows(q.rows);setCursor(q.nextCursor);}}).catch(()=>{});
    });
    const field=(id,label,value,set,props={})=>h('div',{className:'pv-field'},h('label',{htmlFor:id},label),h('input',{id,value,required:true,disabled:busy || !!command,onChange:(e)=>set(e.target.value),...props}));
    const button=(label,work)=>h('button',{type:'button',className:'pv-secondary',disabled:busy || !!command,onClick:work},label);
    return h('main',{id:'gateway-main',className:'pv-wrap pr-wrap'},h('p',{className:'pv-eyebrow'},'Office · PayMongo'),h('h1',null,'Provider reconciliation'),
      h('p',{className:'pv-muted'},'Recover saved checkouts and compare provider money with manual receipts. Never create a replacement for an uncertain session.'),
      error&&h('div',{role:'alert',tabIndex:-1,ref:alert,className:'pv-notice pv-error'},error),message&&h('p',{role:'status',className:'pv-notice'},message),busy&&h('p',{role:'status'},'Please wait…'),
      enabled===null?h('p',null,'Checking availability…'):!enabled?h('p',{className:'pv-notice'},'Provider workflow is not enabled yet.'):
      !signed?h('section',{className:'pv-card'},h('h2',null,'Admin sign-in'),h('form',{onSubmit:login},field('gateway-email','Admin email',email,setEmail,{type:'email',autoComplete:'email'}),
        field('gateway-password','Password',password,setPassword,{type:'password',autoComplete:'current-password'}),h('button',{className:'pv-primary',disabled:busy},'Sign in for reconciliation')),
        button('Use my current sign-in',()=>{uid.current=window.auth?.currentUser?.uid;queue();})):h(React.Fragment,null,
        h('div',{className:'pv-actions'},h('button',{className:'pv-secondary',onClick:()=>{clear();window.auth?.signOut();}},'Sign out'),button('Refresh provider queue',()=>queue())),
        command?h('section',{className:'pv-card'},h('h2',{ref:heading,tabIndex:-1},'Confirm provider action'),h('p',null,command.operation==='recover'?(command.payload.expire?'Retrieve and expire the original checkout if it is still unpaid.':'Retrieve the original provider session and recover its saved result.'):`Decision: ${command.payload.action}`),
          h('p',{className:'pr-meta'},command.payload.intentId || command.payload.eventKey),command.payload.reason&&h('p',null,command.payload.reason),
          command.payload.allocations&&h('div',null,h('ul',null,command.payload.allocations.map((a)=>h('li',{key:a.itemId},`${a.itemId}: ${peso(a.centavos)}`))),h('p',null,`Unapplied principal: ${peso(command.payload.unappliedCentavos)}. Buyer fee remains separate.`)),
          command.payload.receiptId&&h('p',null,`Link to existing receipt ${command.payload.receiptId}; add no principal credit.`),
          uncertain&&h('p',{className:'pv-notice'},'Response uncertain. Retry this exact operation.'),h('div',{className:'pv-actions'},h('button',{className:'pv-primary',disabled:busy,onClick:save},uncertain?'Retry provider action':'Confirm provider action'),
            !uncertain&&h('button',{className:'pv-secondary',disabled:busy,onClick:()=>setCommand(null)},'Back'))):h(React.Fragment,null,
          h('section',{className:'pv-card'},h('h2',null,'Recover a checkout'),h('form',{onSubmit:(e)=>{e.preventDefault();stage('recover',{intentId,...(sessionId?{sessionId}:{}),expire});}},
            field('recover-intent','Internal checkout ID',intentId,setIntentId,{maxLength:128}),field('recover-session','PayMongo session ID (only needed if creation response was lost)',sessionId,setSessionId,{required:false,maxLength:128}),
            h('label',{className:'pr-check'},h('input',{type:'checkbox',checked:expire,onChange:(e)=>setExpire(e.target.checked)}),'Expire the original checkout if PayMongo confirms it can be closed.'),
            h('button',{className:'pv-primary',disabled:busy},'Review checkout recovery'))),
          h('div',{className:'pr-grid'},h('section',{className:'pv-card'},h('h2',null,'Saved provider activity'),h('div',{className:'pv-actions'},button('Payment events',()=>queue('events')),button('Checkout attempts',()=>queue('attempts'))),
            !rows.length&&h('p',null,'No provider activity recorded.'),h('ul',{className:'pr-queue'},rows.map((r)=>h('li',{key:r.id},button(`${r.sourceId || r.eventId || r.id} · ${peso(r.amount)} · ${r.state}${r.reason?' · '+r.reason:''}`,()=>{
              if(kind==='attempts'){setIntentId(r.id);setSessionId('');setDetail(null);}else run(()=>api('detail',{eventKey:r.id}),(d)=>{setDetail(d);setReason('');setAction('retry');setReceiptId('');setAllocations({});setDistinct(false);if(d.intent)setIntentId(d.intent.intentId);});
            })))),cursor&&button('Load older provider activity',()=>queue(kind,true))),
            detail&&h('section',{className:'pv-card'},h('h2',{ref:heading,tabIndex:-1},'Review provider evidence'),h('p',{className:'pr-meta'},detail.event.eventId),h('p',null,`${detail.event.state} · ${detail.event.result.reason || 'Recorded'}`),
              h('p',null,`Provider payment: ${detail.event.evidence?.id || 'Missing'} · gross ${peso(detail.event.evidence?.amount)}`),
              detail.intent&&h('p',null,`Account ${detail.intent.sourceId} · principal ${peso(detail.intent.principalCentavos)} · buyer fee ${peso(detail.intent.buyerFeeCentavos)}`),
              detail.event.result.receiptId&&h('p',null,`Recorded receipt ${detail.event.result.receiptId}`),
              h('p',{className:'pv-notice'},'Linking an earlier manual receipt requires the same contract, principal and exact received time. A mismatched or unassigned payment stays in reconciliation.'),
              h('a',{href:'/payment-review.html',className:'pv-secondary'},'Open manual payment review'),
              h('form',{onSubmit:decide},h('div',{className:'pv-field'},h('label',{htmlFor:'gateway-decision'},'Provider decision'),h('select',{id:'gateway-decision',value:action,onChange:(e)=>setAction(e.target.value)},
                h('option',{value:'retry'},'Retry automatic checks'),h('option',{value:'post'},'Post distinct verified money'),h('option',{value:'link_receipt'},'Link existing manual receipt'))),
                action==='link_receipt'&&field('gateway-receipt','Existing manual receipt ID',receiptId,setReceiptId,{maxLength:128}),
                action==='post'&&h(React.Fragment,null,detail.booking?.items.map((i)=>h(React.Fragment,{key:i.itemId},field(`gateway-item-${i.itemId}`,`${i.plotId} — remaining ${peso(i.totalCentavos-i.creditCentavos)}`,allocations[i.itemId]||'',(v)=>setAllocations({...allocations,[i.itemId]:v}),{inputMode:'decimal',required:false}))),
                  h('label',{className:'pr-check'},h('input',{type:'checkbox',checked:distinct,onChange:(e)=>setDistinct(e.target.checked)}),'I checked manual receipts and confirmed this is distinct money, not a duplicate.')),
                field('gateway-reason','Reconciliation reason',reason,setReason,{maxLength:1000}),h('button',{className:'pv-primary',disabled:busy},'Review provider decision')))))));
  }
  ReactDOM.createRoot(document.getElementById('gateway-root')).render(h(App));
})();
