'use strict';
(() => {
  if(!window.React || !window.ReactDOM) return;
  const h=React.createElement,{useState,useEffect,useRef}=React;
  const peso=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
  const stamp=(n)=>new Date(n).toLocaleString('en-PH',{timeZone:'Asia/Manila'});
  const money=(text)=>{
    if(!/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) throw Error('Use positive peso amounts with at most two decimal places.');
    const [whole,fraction='']=text.split('.');const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(n)) throw Error('Amount is too large.');return n;
  };
  const open=(p)=>['pending_verification','resubmit_requested','needs_reconciliation'].includes(p.status);
  const fresh=()=>({action:'request_correction',reason:'',buyerNote:'',amount:'',receivedAt:'',reference:'',funds:false,noFunds:false,gatewayReviewed:false,allocations:{}});
  function App({embedded=false}={}) {
    const [enabled,setEnabled]=useState(null),[signed,setSigned]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
    const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[filters,setFilters]=useState({status:'pending_verification',channel:'',sourceId:'',from:'',to:'',ageDays:0});
    const [applied,setApplied]=useState(filters),[detail,setDetail]=useState(null),[proof,setProof]=useState(null),[revision,setRevision]=useState('');
    const [form,setForm]=useState(fresh),[command,setCommand]=useState(null),[uncertain,setUncertain]=useState(false);
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
    const generation=useRef(0),uid=useRef(null),alert=useRef(null),heading=useRef(null);
    const clear=()=>{generation.current++;setRows([]);setDetail(null);setProof(null);setCommand(null);setForm(fresh());setSigned(false);setCursor(null);setBusy(false);setPassword('');uid.current=null;};
    async function api(action,fields={}) {
      if(!window.auth?.currentUser) {clear();throw Error('Please sign in again.');}
      const token=await window.auth.currentUser.getIdToken();let response;
      try {response=await fetch('/api/payment-review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...fields})});}
      catch(_){throw Object.assign(Error(action==='decide' ? 'Connection interrupted. Retry the same decision to recover its saved result.' :
        'Connection interrupted while loading payment review data. Retry loading the queue or case.'),{uncertain:action==='decide'});}
      const data=await response.json().catch(()=>({}));
      if(['FORBIDDEN','UNAUTHENTICATED'].includes(data.code)) {clear();setError(data.error || 'Admin access is required.');}
      if(!response.ok) throw Object.assign(Error(data.error || 'Review unavailable.'),{uncertain:action==='decide' && response.status>=500});
      return data;
    }
    async function run(work,apply) {
      const ticket=++generation.current;setBusy(true);setError('');setMessage('');
      try {const result=await work();if(ticket===generation.current) apply(result);}
      catch(ex){if(ticket===generation.current)setError(ex.message);}
      finally{if(ticket===generation.current)setBusy(false);}
    }
    const loadQueue=(append=false,filter=applied)=>run(()=>api('queue',{filters:filter,cursor:append?cursor:null}),(result)=>{
      setRows((old)=>append?[...old,...result.cases]:result.cases);setCursor(result.nextCursor);setApplied(filter);setSigned(true);
    });
    const select=(id)=>run(()=>api('detail',{paymentId:id}),(data)=>{setDetail(data);setProof(null);setRevision(data.payment.revisionId);setForm(fresh());setCommand(null);setUncertain(false);});
    useEffect(()=>{
      let live=true;fetch('/api/payment-review',{cache:'no-store'}).then((r)=>r.json()).then((r)=>{if(live)setEnabled(r.enabled===true);}).catch(()=>{if(live){setEnabled(false);setError('Could not check review availability. Reload this page.');}});
      const unsubscribe=window.auth?.onAuthStateChanged((user)=>{if(uid.current && uid.current!==user?.uid){clear();setMessage('Your sign-in changed. Open the queue again.');}});
      const restore=(event)=>{if(event.persisted)clear();};window.addEventListener('pageshow',restore);
      return()=>{live=false;generation.current++;if(unsubscribe)unsubscribe();window.removeEventListener('pageshow',restore);};
    },[]);
    useEffect(()=>{
      if(embedded && enabled && window.auth?.currentUser){
        uid.current=window.auth.currentUser.uid;
        loadQueue(false,filters);
      }
    },[embedded,enabled]);
    useEffect(()=>{if(error)alert.current?.focus();},[error]);
    useEffect(()=>{if(detail)heading.current?.focus();},[detail,command]);
    useEffect(()=>{if(!signed)return;const timer=setTimeout(()=>{clear();setMessage('Private review closed after 15 minutes. Sign in or open the queue again.');},900000);return()=>clearTimeout(timer);},[signed,detail]);
    const login=(event)=>{event.preventDefault();run(async()=>{
      try{await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);const result=await window.auth.signInWithEmailAndPassword(email.trim(),password);uid.current=result.user.uid;setPassword('');}
      catch(_){throw Error('Could not sign in. Check your account details.');}
      return api('queue',{filters});
    },(result)=>{setSigned(true);setRows(result.cases);setCursor(result.nextCursor);setApplied(filters);});};
    const update=(key,value)=>{setCommand(null);setForm((old)=>({...old,[key]:value}));};
    const field=(id,label,key,type='text',extra={})=>h('div',{className:'pv-field'},h('label',{htmlFor:id},label),h('input',{id,type,value:form[key],disabled:busy,onChange:(e)=>update(key,e.target.value),...extra}));
    const checkbox=(id,label,key)=>h('label',{className:'pr-check',htmlFor:id},h('input',{id,type:'checkbox',checked:form[key],disabled:busy,onChange:(e)=>update(key,e.target.checked)}),label);
    const p=detail?.payment,b=detail?.booking;
    const review=(event)=>{
      event.preventDefault();setError('');
      try {
        const cmd={paymentId:p.paymentId,requestId:crypto.randomUUID(),expectedVersion:p.version,revisionId:p.revisionId,action:form.action,reason:form.reason,buyerNote:form.buyerNote};
        if(form.action==='reject')cmd.noFundsConfirmed=form.noFunds;
        if(form.action==='approve' || (form.action==='reconcile' && form.funds)) {
          if(!form.funds)throw Error('Confirm actual receipt against the statement.');
          if(proof?.revisionId!==p.revisionId)throw Error('Open the current proof revision before confirming received money.');
          Object.assign(cmd,{fundsConfirmed:true,receivedCentavos:money(form.amount),receivedAt:Date.parse(`${form.receivedAt}:00+08:00`),verifiedReference:form.reference});
          if(!Number.isFinite(cmd.receivedAt))throw Error('Enter the actual received date and time in the Philippines.');
        }
        if(form.action==='approve') {
          if(!b || detail.blocker)throw Error(detail.blocker || 'The booking needs review.');
          Object.assign(cmd,{expectedBookingVersion:b.version,allocations:b.items.map((item)=>({itemId:item.itemId,centavos:money(form.allocations[item.itemId] || '0')})).filter((item)=>item.centavos>0),
            gatewayReviewed:form.gatewayReviewed,unappliedCentavos:Math.max(0,cmd.receivedCentavos-b.balanceCentavos)});
          if(cmd.allocations.reduce((sum,item)=>sum+item.centavos,0)!==Math.min(cmd.receivedCentavos,b.balanceCentavos))throw Error('Plot allocations must equal the principal amount being credited.');
        }
        setUncertain(false);setCommand(cmd);
      }catch(ex){setError(ex.message);}
    };
    const save=()=>run(async()=>{try{return await api('decide',{command});}catch(ex){if(ex.uncertain)setUncertain(true);throw ex;}},(result)=>{
      setMessage(`Saved: ${result.status.replaceAll('_',' ')}${result.receiptId?` · Acknowledgement ${result.receiptId}`:''}.`);setCommand(null);setDetail(null);setProof(null);
      window.dispatchEvent(new Event('payment-records-changed'));
      const ticket=generation.current;api('queue',{filters:applied}).then((next)=>{if(ticket===generation.current){setRows(next.cases);setCursor(next.nextCursor);}}).catch(()=>{});
    });
    return h(embedded?'section':'main',{id:'review-main',className:`pv-wrap pr-wrap${embedded?' admin-payment-review':''}`},h('p',{className:'pv-eyebrow'},'Office · Manual payment verification'),h(embedded?'h2':'h1',null,embedded?'Online payments to check':'Review the evidence. Record the result.'),
      h('p',{className:'pv-muted'},'Compare every claim with the receiving bank or GCash statement. Only verified funds can become account credit.'),
      error&&h('div',{className:'pv-notice pv-error',role:'alert',tabIndex:-1,ref:alert},error),message&&h('p',{role:'status',className:'pv-notice'},message),
      busy&&h('p',{role:'status'},'Please wait…'),enabled===null?h('p',null,'Checking availability…'):!enabled?h('p',{className:'pv-notice'},'Payment review is not enabled yet.'):
      !signed && embedded?h('section',{className:'pv-card'},h('p',null,'Using your Admin Panel sign-in. Admins can review receipts and record verified payments here.'),
        h('button',{className:'pv-secondary',disabled:busy,onClick:()=>{uid.current=window.auth?.currentUser?.uid;loadQueue(false,filters);}},'Reload payment review')):
      !signed?h('section',{className:'pv-card'},h('h2',null,'Admin sign-in'),h('form',{onSubmit:login},
        h('div',{className:'pv-field'},h('label',{htmlFor:'review-email'},'Admin email'),h('input',{id:'review-email',type:'email',value:email,required:true,autoComplete:'email',onChange:(e)=>setEmail(e.target.value)})),
        h('div',{className:'pv-field'},h('label',{htmlFor:'review-password'},'Password'),h('input',{id:'review-password',type:'password',value:password,required:true,autoComplete:'current-password',onChange:(e)=>setPassword(e.target.value)})),
        h('button',{className:'pv-primary',disabled:busy},'Sign in to review')),
        h('button',{className:'pv-secondary pv-block',disabled:busy,onClick:()=>{uid.current=window.auth?.currentUser?.uid;loadQueue(false,filters);}},'Use my current sign-in')):
      h(React.Fragment,null,h('div',{className:'pv-actions'},!embedded&&h('button',{className:'pv-secondary',onClick:()=>{clear();window.auth?.signOut();}},'Sign out'),
        h('button',{className:'pv-secondary',disabled:busy || !!command,onClick:()=>loadQueue()},'Refresh queue')),
        h('section',{className:'pv-card'},h('h2',null,'Find a submission'),h('form',{className:'pr-filters',onSubmit:(e)=>{e.preventDefault();loadQueue(false,filters);}},
          ...[['status','Status',['pending_verification','resubmit_requested','needs_reconciliation','verified','rejected']],['channel','Channel',['bank','gcash','maya']]].map(([key,label,values])=>h('div',{key,className:'pv-field'},h('label',{htmlFor:`filter-${key}`},label),h('select',{id:`filter-${key}`,value:filters[key],disabled:!!command,onChange:(e)=>setFilters({...filters,[key]:e.target.value})},h('option',{value:''},'All'),values.map((value)=>h('option',{key:value,value},value.replaceAll('_',' ')))))),
          ...[['sourceId','Account / reservation ID','text'],['from','Submitted from','date'],['to','Submitted through','date'],['ageDays','At least this many days old','number']].map(([key,label,type])=>h('div',{key,className:'pv-field'},h('label',{htmlFor:`filter-${key}`},label),h('input',{id:`filter-${key}`,type,value:filters[key],min:0,disabled:!!command,onChange:(e)=>setFilters({...filters,[key]:key==='ageDays'?Number(e.target.value):e.target.value})}))),
          h('button',{className:'pv-primary',disabled:busy || !!command},'Apply filters'))),
        h('div',{className:'pr-grid'},h('section',{className:'pv-card'},h('h2',null,'Oldest first'),!rows.length&&h('p',null,'No submissions match these filters.'),
          h('ul',{className:'pr-queue'},rows.map((row)=>h('li',{key:row.paymentId},h('button',{className:'pv-secondary',disabled:busy || !!command,onClick:()=>select(row.paymentId)},row.name || row.sourceId,
            h('small',null,`${row.quote.channel} · ${peso(row.claimedCentavos)} · ${row.status.replaceAll('_',' ')}`),h('small',null,`${row.sourceId} · ${stamp(row.submittedAt)}`),h('small',null,row.paymentId))))),
          cursor&&h('button',{className:'pv-secondary',disabled:busy || !!command,onClick:()=>loadQueue(true)},'Load more cases')),
          detail&&h('section',{className:'pv-card'},h('h2',{ref:heading,tabIndex:-1},command?'Confirm your decision':`Review ${detail.name || p.sourceId}`),h('p',{className:'pr-meta'},p.paymentId),
            command?h(React.Fragment,null,h('p',{className:'pv-status'},command.action.replaceAll('_',' ')),
              h('p',null,`Evidence ${command.revisionId} · case version ${command.expectedVersion}`),
              command.fundsConfirmed&&h('p',null,`Received ${peso(command.receivedCentavos)} on ${stamp(command.receivedAt)} · reference ${command.verifiedReference}`),
              command.action==='approve'&&h('div',null,h('p',null,`Principal credit ${peso(command.receivedCentavos-command.unappliedCentavos)} · unapplied credit ${peso(command.unappliedCentavos)}`),
                h('ul',null,command.allocations.map((a)=>h('li',{key:a.itemId},`${a.itemId}: ${peso(a.centavos)}`)))),
              h('p',null,`Internal reason: ${command.reason}`),h('p',null,`Customer note: ${command.buyerNote || '(none)'}`),
              h('p',{className:'pv-notice'},command.action==='approve'?'This records verified funds and updates principal credit. It does not release a plot, issue a refund or activate a new installment schedule.':'This saves a review decision. It does not reduce the customer balance.'),
              uncertain&&h('p',{className:'pv-notice pv-warning'},'Response uncertain. Retry this same decision to recover the saved result.'),
              h('div',{className:'pv-actions'},h('button',{className:'pv-primary',disabled:busy,onClick:save},uncertain?'Retry saved decision':'Confirm decision'),
                !uncertain&&h('button',{className:'pv-secondary',disabled:busy,onClick:()=>setCommand(null)},'Back to review'))):
            h(React.Fragment,null,h('p',{className:'pv-status'},p.status.replaceAll('_',' ')),h('p',null,`Claimed ${peso(p.claimedCentavos)} · expected ${peso(p.quote.expectedAmountCentavos)} · ${p.quote.purpose}`),
              h('p',null,`Reference ${p.reference} · transfer date ${p.transferDate}`),h('p',{className:'pr-meta'},`${p.quote.label} · ${p.quote.accountName} · ${p.quote.accountNumber}`),
              p.payerName && h('p',null,`Wallet account: ${p.payerName} · ${p.payerMobile} · ${p.transferTime} (Philippines)`),
              detail.gatewayActiveId&&h('p',{className:'pv-notice pv-warning'},'An open PayMongo attempt needs recovery or expiry before this transfer can post. Use Provider reconciliation.'),
              detail.possibleDuplicate&&h('p',{className:'pv-notice pv-warning'},'Another claim uses this receiving account/reference. Check actual funds and existing receipts; pending claims are not proof of duplication.'),
              detail.blocker&&h('p',{className:'pv-notice pv-warning'},detail.blocker),
              detail.reconciliation&&h('p',{className:'pv-notice'},detail.reconciliation.fundsConfirmed?`Received money held for reconciliation: ${peso(detail.reconciliation.received.receivedCentavos)}.`:'This case is awaiting reconciliation.'),
              b&&h('p',null,`Principal balance ${peso(b.balanceCentavos)} · unapplied ${peso(b.unappliedCentavos)} · contract version ${b.version}`),
              detail.history&&h('details',null,h('summary',null,'Latest recorded history and plots'),h('p',null,detail.history.plots.join(' · ')),h('ul',{className:'pr-history'},detail.history.entries.map((entry)=>h('li',{key:entry.id},`${entry.date || 'Date for review'} · ${entry.reference} · ${peso(entry.amountCentavos)}`)))),
              h('div',{className:'pv-field'},h('label',{htmlFor:'review-revision'},'Proof revision'),h('select',{id:'review-revision',value:revision,onChange:(e)=>{setRevision(e.target.value);setProof(null);}},detail.revisions.map((r)=>h('option',{key:r.revisionId,value:r.revisionId},`${r.revisionId} · ${r.reference} · ${peso(r.claimedCentavos)}`)))),
              (()=>{const selected=detail.revisions.find(r=>r.revisionId===revision);return selected?.payerName && h('p',null,`Selected proof wallet: ${selected.payerName} · ${selected.payerMobile} · ${selected.transferDate} ${selected.transferTime} (Philippines)`);})(),
              h('details',null,h('summary',null,'Receipt-reading suggestions for selected revision'),
                h('p',null,'These are unverified image suggestions. Confirm actual funds against the bank, GCash or Maya statement.'),
                (()=>{const assistance=detail.revisions.find((r)=>r.revisionId===revision)?.claimAssistance;
                  return assistance?h(React.Fragment,null,h('p',null,`Entry source: ${assistance.source.replaceAll('_',' ')}`),h('ul',null,assistance.candidates.map((c,i)=>h('li',{key:i},`${c.field}: ${c.value} · confidence ${c.confidence}%`)))):h('p',null,'No receipt-reading suggestions were saved.');})()),
              h('button',{className:'pv-secondary',disabled:busy,onClick:()=>run(()=>api('proof',{paymentId:p.paymentId,revisionId:revision}),(image)=>setProof({revisionId:revision,url:`data:image/jpeg;base64,${image.base64}`}))},'Open selected proof'),
              proof&&h('figure',{className:'ps-proof'},h('img',{className:'pr-proof',src:proof.url,alt:`Private proof ${proof.revisionId}`}),h('details',null,h('summary',null,'Inspect full-size proof'),h('div',{className:'ps-zoom',tabIndex:0},h('img',{src:proof.url,alt:'Full-size payment evidence'})))),
              open(p)?h('form',{onSubmit:review},h('div',{className:'pv-field'},h('label',{htmlFor:'review-action'},'Decision'),h('select',{id:'review-action',value:form.action,onChange:(e)=>update('action',e.target.value)},
                [['request_correction','Request correction'],['reject','Reject — no funds received'],['reconcile','Keep in reconciliation'],['approve','Approve verified funds']].map(([value,label])=>h('option',{key:value,value},label)))),
                ['approve','reconcile'].includes(form.action)&&h(React.Fragment,null,checkbox('review-funds','I checked the statement and confirmed that these funds were received.','funds'),
                  (form.action==='approve'||form.funds)&&h(React.Fragment,null,field('review-amount','Actual amount received (₱)','amount','text',{required:true,inputMode:'decimal'}),
                    field('review-received','Actual received date/time (Philippines)','receivedAt','datetime-local',{required:true}),field('review-reference','Statement reference','reference','text',{required:true,maxLength:160}))),
                form.action==='approve'&&detail.gatewayReviewRequired&&checkbox('review-gateway','I reviewed provider history and confirmed this transfer is separate money, not a PayMongo screenshot.','gatewayReviewed'),
                form.action==='reject'&&checkbox('review-no-funds','I checked and found no received funds for this claim.','noFunds'),
                form.action==='approve'&&b&&h('fieldset',{className:'pr-fieldset'},h('legend',null,'Allocate principal credit to plots'),h('p',null,'Allocate the verified amount up to the outstanding principal. Any excess is retained as unapplied credit.'),
                  b.items.map((item)=>h('div',{className:'pv-field',key:item.itemId},h('label',{htmlFor:`allocation-${item.itemId}`},`${item.plotId} — remaining ${peso(item.totalCentavos-item.creditCentavos)}`),
                    h('input',{id:`allocation-${item.itemId}`,value:form.allocations[item.itemId]||'',inputMode:'decimal',placeholder:'0.00',onChange:(e)=>update('allocations',{...form.allocations,[item.itemId]:e.target.value})})))),
                h('div',{className:'pv-field'},h('label',{htmlFor:'review-reason'},'Internal review reason'),h('textarea',{id:'review-reason',value:form.reason,required:true,maxLength:1000,onChange:(e)=>update('reason',e.target.value)})),
                h('div',{className:'pv-field'},h('label',{htmlFor:'review-note'},'Message to the customer'),h('textarea',{id:'review-note',value:form.buyerNote,required:['reject','request_correction'].includes(form.action),maxLength:500,onChange:(e)=>update('buyerNote',e.target.value)})),
                h('button',{className:'pv-primary',disabled:busy},'Review decision')):h('p',{className:'pv-notice'},p.receiptId?`Acknowledgement ${p.receiptId}. This case is closed; corrections require a separate audited workflow.`:'This rejected case is closed.'))))));
  }
  window.PaymentReview=App;
  const root=document.getElementById('review-root');
  if(root) ReactDOM.createRoot(root).render(h(App));
})();
