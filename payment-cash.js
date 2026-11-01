'use strict';
(() => {
  if(!window.React || !window.ReactDOM) return;
  const h=React.createElement,{useState,useEffect,useRef}=React;
  const peso=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
  const stamp=(n)=>new Date(n).toLocaleString('en-PH',{timeZone:'Asia/Manila'});
  const money=(value)=>{const m=/^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);const n=m?Number(m[1])*100+Number((m[2]||'').padEnd(2,'0')):NaN;
    if(!Number.isSafeInteger(n))throw Error('Enter peso amounts with at most two decimal places.');return n;};
  const fresh=()=>({amount:'',receivedAt:'',collector:'',officeReference:'',purpose:'deposit',fundsConfirmed:false});
  function App() {
    const [enabled,setEnabled]=useState(null),[signed,setSigned]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
    const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
    const [rows,setRows]=useState([]),[cursor,setCursor]=useState(null),[filter,setFilter]=useState('pending_verification'),[applied,setApplied]=useState('pending_verification');
    const [kind,setKind]=useState('customer'),[sourceId,setSourceId]=useState(''),[context,setContext]=useState(null),[form,setForm]=useState(fresh);
    const [detail,setDetail]=useState(null),[image,setImage]=useState(''),[revision,setRevision]=useState(''),[shown,setShown]=useState(null);
    const [allocations,setAllocations]=useState({}),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
    const [command,setCommand]=useState(null),[uncertain,setUncertain]=useState(false),[print,setPrint]=useState(null);
    const ticket=useRef(0),uid=useRef(null),alert=useRef(null),heading=useRef(null);
    const clear=()=>{ticket.current++;uid.current=null;setSigned(false);setRows([]);setCursor(null);setContext(null);setDetail(null);setCommand(null);
      setImage('');setShown(null);setPrint(null);setForm(fresh());setAllocations({});setReason('');setConfirmed(false);setPassword('');setError('');setMessage('');setBusy(false);setUncertain(false);};
    async function api(action,fields={}) {
      if(!window.auth?.currentUser){clear();throw Error('Please sign in again.');}
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${await window.auth.currentUser.getIdToken()}`};
      let response;try{response=await fetch('/api/payment-cash',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action,...fields})});}
      catch(_){throw Object.assign(Error('Connection interrupted. Retry this same step to recover its saved result.'),{uncertain:true});}
      const result=await response.json().catch(()=>({}));
      if(['UNAUTHENTICATED','FORBIDDEN'].includes(result.code)){clear();setError(result.error || 'Admin access is required.');}
      if(!response.ok)throw Object.assign(Error(result.error || 'The result is uncertain. Retry this same step.'),{uncertain:response.status>=500});return result;
    }
    async function run(work,apply) {
      const current=++ticket.current;setBusy(true);setError('');setMessage('');
      try{const result=await work();if(current===ticket.current)apply(result);}
      catch(e){if(current===ticket.current)setError(e.message);}
      finally{if(current===ticket.current)setBusy(false);}
    }
    const queue=(more=false,status=applied)=>run(()=>api('queue',{filters:{status},cursor:more?cursor:null}),(r)=>{
      setSigned(true);setApplied(status);setRows((old)=>more?[...old,...r.cases]:r.cases);setCursor(r.nextCursor);});
    const loadDetail=(id)=>run(()=>api('detail',{paymentId:id}),(r)=>{setDetail(r);setContext(null);setImage('');setShown(null);
      setRevision(r.payment.revisionId);setAllocations({});setReason('');setConfirmed(false);setPrint(null);});
    useEffect(()=>{
      let live=true;fetch('/api/payment-cash',{cache:'no-store'}).then((r)=>r.json()).then((v)=>{if(live)setEnabled(v.enabled);}).catch(()=>{if(live)setEnabled(false);});
      const unsubscribe=window.auth?.onAuthStateChanged((user)=>{if(uid.current && user?.uid!==uid.current)clear();});
      const restore=(e)=>{if(e.persisted)clear();};window.addEventListener('pageshow',restore);
      return()=>{live=false;ticket.current++;unsubscribe?.();window.removeEventListener('pageshow',restore);};
    },[]);
    useEffect(()=>{if(!signed)return;const timer=setTimeout(clear,15*60*1000);return()=>clearTimeout(timer);},[signed]);
    useEffect(()=>{if(error)alert.current?.focus();},[error]);
    useEffect(()=>{heading.current?.focus();},[command,detail?.payment.paymentId,context]);
    useEffect(()=>{if(print){window.print();}},[print]);
    const login=(e)=>{e.preventDefault();run(async()=>{await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      const result=await window.auth.signInWithEmailAndPassword(email,password);uid.current=result.user.uid;
      return api('queue',{filters:{status:filter}});},(r)=>{setPassword('');setSigned(true);setRows(r.cases);setCursor(r.nextCursor);setApplied(filter);});};
    const stage=(action,values)=>{setUncertain(false);setError('');setCommand({action,command:{requestId:crypto.randomUUID(),...values}});};
    const record=(e)=>{e.preventDefault();try {
      if(!form.fundsConfirmed)throw Error('Confirm that cash has actually been received.');
      const receivedCentavos=money(form.amount);if(receivedCentavos<=0)throw Error('Enter a positive cash amount.');
      stage('record',{sourceKind:context.sourceKind,sourceId:context.sourceId,scopeVersion:context.scopeVersion,expectedBookingVersion:context.bookingVersion,
        purpose:form.purpose,receivedCentavos,receivedAt:Date.parse(`${form.receivedAt}+08:00`),collector:form.collector,officeReference:form.officeReference,fundsConfirmed:true});
    }catch(e){setError(e.message);}};
    const approve=(e)=>{e.preventDefault();try {
      if(!confirmed || shown?.revisionId!==detail.payment.revisionId)throw Error('Open the latest photo and confirm that it matches the printed receipt.');
      const received=detail.payment.receivedCentavos,credit=Math.min(received,detail.booking.balanceCentavos);
      const items=detail.booking.items.map((i)=>({itemId:i.itemId,centavos:money(allocations[i.itemId] || '0')})).filter((i)=>i.centavos>0);
      if(items.reduce((n,i)=>n+i.centavos,0)!==credit)throw Error(`Allocate exactly ${peso(credit)} to principal.`);
      stage('approve',{paymentId:detail.payment.paymentId,expectedVersion:detail.payment.version,revisionId:detail.payment.revisionId,
        expectedBookingVersion:detail.booking.version,allocations:items,unappliedCentavos:received-credit,reason,photoConfirmed:true});
    }catch(e){setError(e.message);}};
    const save=()=>run(async()=>{try{return await api(command.action,{command:command.command});}catch(e){if(e.uncertain)setUncertain(true);throw e;}},(r)=>{
      const action=command.action;setCommand(null);setUncertain(false);setImage('');setContext(null);setForm(fresh());setShown(null);setConfirmed(false);
      setMessage(`${action==='approve'?'Approved':action==='record'?'Cash recorded — awaiting print, photo and approval':action==='photo'?'Photo saved — awaiting approval':'Print attempt recorded'} · ${r.cashReceiptId}`);
      if(action==='print')setPrint({snapshot:r.snapshot,status:r.printStatus});
      const current=ticket.current;
      Promise.all([api('detail',{paymentId:r.paymentId}),api('queue',{filters:{status:applied}})]).then(([d,q])=>{
        if(current!==ticket.current)return;setDetail(d);setRevision(d.payment.revisionId);setRows(q.cases);setCursor(q.nextCursor);
      }).catch(()=>{if(current===ticket.current){setDetail(null);setMessage(`Step saved · ${r.cashReceiptId}. Refresh the queue to resume.`);}});
    });
    const field=(id,label,value,change,props={})=>h('div',{className:'pv-field'},h('label',{htmlFor:id},label),h('input',{id,value,onChange:(e)=>change(e.target.value),disabled:busy,required:true,...props}));
    const button=(label,onClick,extra={})=>h('button',{type:'button',className:'pv-secondary',disabled:busy || !!command,onClick,...extra},label);
    const preview=(url,alt)=>h('figure',{className:'ps-proof'},h('img',{src:url,alt,className:'pr-proof'}),h('details',null,h('summary',null,'Inspect full-size photo'),h('div',{className:'ps-zoom',tabIndex:0},h('img',{src:url,alt:'Full-size cash receipt photo'}))));
    const p=detail?.payment,s=p?.snapshot;
    return h(React.Fragment,null,h('main',{id:'cash-main',className:'pv-wrap pr-wrap cash-screen'},
      h('p',{className:'pv-eyebrow'},'Office · Cash payments'),h('h1',null,'Record → Print → Photo → Approve'),
      h('p',{className:'pv-muted'},'Cash stays pending until an admin approves the printed receipt photo. The same admin may complete all four steps.'),
      error&&h('div',{role:'alert',tabIndex:-1,ref:alert,className:'pv-notice pv-error'},error),message&&h('p',{role:'status',className:'pv-notice'},message),busy&&h('p',{role:'status'},'Please wait…'),
      enabled===null?h('p',null,'Checking availability…'):!enabled?h('p',{className:'pv-notice'},'Cash workflow is not enabled yet.'):
      !signed?h('section',{className:'pv-card'},h('h2',null,'Admin sign-in'),h('form',{onSubmit:login},
        field('cash-email','Admin email',email,setEmail,{type:'email',autoComplete:'email'}),field('cash-password','Password',password,setPassword,{type:'password',autoComplete:'current-password'}),
        h('button',{className:'pv-primary',disabled:busy},'Sign in for cash')),
        button('Use my current sign-in',()=>{uid.current=window.auth?.currentUser?.uid;queue(false,filter);})):h(React.Fragment,null,
        h('div',{className:'pv-actions'},button('Sign out',()=>{clear();window.auth?.signOut();},{disabled:false}),button('Refresh queue',()=>queue())),
        !command&&h('section',{className:'pv-card'},h('h2',null,'1. Record cash received'),h('form',{className:'pc-lookup',onSubmit:(e)=>{e.preventDefault();run(()=>api('context',{sourceKind:kind,sourceId}),(c)=>{setContext(c);setDetail(null);setPrint(null);setForm({...fresh(),purpose:c.purposes[0]});});}},
          h('div',{className:'pv-field'},h('label',{htmlFor:'cash-kind'},'Account type'),h('select',{id:'cash-kind',value:kind,onChange:(e)=>{setKind(e.target.value);setContext(null);}},h('option',{value:'customer'},'Account holder'),h('option',{value:'presale'},'Presale reservation'))),
          field('cash-source','Exact account / reservation ID',sourceId,(v)=>{setSourceId(v);setContext(null);},{maxLength:128}),h('button',{className:'pv-primary',disabled:busy},'Load cash options')),
          context&&h('form',{onSubmit:record},h('h3',{ref:heading,tabIndex:-1},context.name),h('p',null,`${context.sourceId} · ${context.officeLabel} · principal balance ${peso(context.balanceCentavos)}`),
            h('div',{className:'pv-field'},h('label',{htmlFor:'cash-purpose'},'Payment purpose'),h('select',{id:'cash-purpose',value:form.purpose,onChange:(e)=>setForm({...form,purpose:e.target.value})},context.purposes.map((v)=>h('option',{key:v,value:v},v)))),
            field('cash-amount','Cash received (₱)',form.amount,(v)=>setForm({...form,amount:v}),{inputMode:'decimal'}),
            field('cash-received','Actual received date/time (Philippines)',form.receivedAt,(v)=>setForm({...form,receivedAt:v}),{type:'datetime-local'}),
            field('cash-collector','Collector name',form.collector,(v)=>setForm({...form,collector:v}),{maxLength:160}),
            field('cash-reference','Unique office intake reference',form.officeReference,(v)=>setForm({...form,officeReference:v}),{maxLength:160,'aria-describedby':'cash-ref-help'}),
            h('p',{id:'cash-ref-help'},'Use the existing office register/series and document reference for this cash handover. Reuse it when recovering an uncertain record; do not assign a new reference to the same cash.'),
            h('label',{className:'pr-check'},h('input',{type:'checkbox',checked:form.fundsConfirmed,onChange:(e)=>setForm({...form,fundsConfirmed:e.target.checked})}),'I confirm this cash was actually received.'),
            h('button',{className:'pv-primary',disabled:busy},'Review cash record'))),
        command?h('section',{className:'pv-card'},h('h2',{ref:heading,tabIndex:-1},{record:'Confirm cash record',print:'Confirm print attempt',photo:'Confirm receipt photo',approve:'Confirm cash approval'}[command.action]),
          command.action==='record'&&h(React.Fragment,null,h('p',null,`${context?.name || command.command.sourceId} · ${command.command.purpose}`),
            h('p',null,`${peso(command.command.receivedCentavos)} received ${stamp(command.command.receivedAt)}`),h('p',null,`Collector: ${command.command.collector} · Office reference: ${command.command.officeReference}`),
            h('p',{className:'pv-notice'},'This saves cash on hand pending approval. It does not reduce principal yet. Amount and received date cannot be edited after recording.')),
          command.action==='print'&&h('p',null,'Save a print attempt and open the print dialog for this receipt. Cancelling the dialog still leaves an attempt record. Upload a photo of the physical print before approval.'),
          command.action==='photo'&&preview(image,'Photo to save as an immutable revision'),
          command.action==='approve'&&h(React.Fragment,null,h('p',null,`${p.cashReceiptId} · cash received ${peso(p.receivedCentavos)} on ${stamp(p.receivedAt)}`),
            h('p',null,`Principal credit ${peso(p.receivedCentavos-command.command.unappliedCentavos)} · unapplied credit ${peso(command.command.unappliedCentavos)}`),
            h('ul',null,command.command.allocations.map((a)=>h('li',{key:a.itemId},`${a.itemId}: ${peso(a.centavos)}`))),h('p',null,`Reason: ${command.command.reason}`),
            h('p',{className:'pv-notice'},'This posts cash once. Deposit, schedule and settlement updates still require lifecycle review.')),
          uncertain&&h('p',{className:'pv-notice pv-warning'},'Response uncertain. Retry this exact step; do not create another cash record.'),
          h('div',{className:'pv-actions'},h('button',{className:'pv-primary',disabled:busy,onClick:save},uncertain?'Retry same step':'Confirm step'),
            !uncertain&&h('button',{className:'pv-secondary',disabled:busy,onClick:()=>setCommand(null)},'Back'))):
        h('div',{className:'pr-grid'},h('section',{className:'pv-card'},h('h2',null,'Resume cash records'),
          h('form',{onSubmit:(e)=>{e.preventDefault();queue(false,filter);}},h('div',{className:'pv-field'},h('label',{htmlFor:'cash-filter'},'Cash status'),
            h('select',{id:'cash-filter',value:filter,onChange:(e)=>setFilter(e.target.value)},h('option',{value:'pending_verification'},'Pending approval'),h('option',{value:'verified'},'Approved'),h('option',{value:''},'All'))),
            h('button',{className:'pv-secondary',disabled:busy},'Apply cash filter')),
          !rows.length&&h('p',null,'No cash records match this filter.'),h('ul',{className:'pr-queue'},rows.map((r)=>h('li',{key:r.paymentId},button(`${r.sourceId} · ${peso(r.receivedCentavos)} · ${r.status==='verified'?'Approved':'Pending'} · ${r.cashReceiptId}`,()=>loadDetail(r.paymentId))))),
          cursor&&button('Load more cash records',()=>queue(true))),
          detail&&h('section',{className:'pv-card'},h('h2',{ref:heading,tabIndex:-1},s.name),h('p',{className:'pr-meta'},p.cashReceiptId),
            h('ol',{className:'pc-steps','aria-label':'Cash workflow progress'},['Record saved',p.printCount?'Print attempted':'Print needed',p.evidenceRevisionCount?'Photo saved':'Photo needed',p.status==='verified'?'Approved':'Approval pending'].map((v,i)=>h('li',{key:i},`${i+1}. ${v}`))),
            h('p',null,`${peso(p.receivedCentavos)} received ${stamp(p.receivedAt)} · ${s.purpose}`),h('p',null,`Collector: ${s.collector} · Office reference: ${s.officeReference}`),
            detail.reconciliation?.state==='open'&&h('p',{className:'pv-notice'},'Cash on hand is retained in reconciliation. Principal has not been credited by this record.'),
            detail.blocker&&h('p',{className:'pv-notice pv-warning'},detail.blocker),
            h('h3',null,'2. Print receipt'),h('p',null,`${p.printCount} print attempt(s). A print attempt does not prove a physical copy was printed.`),
            button(p.printCount?'Reprint same receipt':'Print receipt',()=>stage('print',{paymentId:p.paymentId,expectedVersion:p.version})),
            h('h3',null,'3. Photograph printed receipt'),p.status!=='verified'&&h(React.Fragment,null,
              h('div',{className:'pv-field'},h('label',{htmlFor:'cash-photo'},'Printed receipt photo'),h('input',{id:'cash-photo',type:'file',accept:'image/jpeg,image/png,image/webp',disabled:busy || !p.printCount,
                onChange:(e)=>{const file=e.target.files[0];setImage('');if(file)run(()=>window.preparePaymentImage(file),setImage);}}),h('small',null,'JPG, PNG or WEBP, up to 5 MB. Inspect the compressed preview; previous photos are retained.')),
              image&&preview(image,'Selected printed receipt photo'),image&&button('Review photo upload',()=>stage('photo',{paymentId:p.paymentId,expectedVersion:p.version,image:image.split(',')[1]}))),
            detail.revisions.length>0&&h(React.Fragment,null,h('div',{className:'pv-field'},h('label',{htmlFor:'cash-revision'},'Saved photo revision'),h('select',{id:'cash-revision',value:revision,onChange:(e)=>{setRevision(e.target.value);setShown(null);setConfirmed(false);}},detail.revisions.map((r)=>h('option',{key:r.revisionId,value:r.revisionId},r.revisionId)))),
              button('Open saved photo',()=>run(()=>api('proof',{paymentId:p.paymentId,revisionId:revision}),(r)=>setShown({revisionId:revision,url:`data:${r.mime};base64,${r.base64}`})))),
            shown&&preview(shown.url,`Saved cash photo ${shown.revisionId}`),h('h3',null,'4. Approve cash'),
            p.status==='verified'?h('p',{className:'pv-notice'},`Approved · ${p.receiptId}. Corrections require a separate audited process.`):
            detail.booking&&h('form',{onSubmit:approve},h('p',null,`Current principal balance ${peso(detail.booking.balanceCentavos)}. Allocate up to this balance; excess stays unapplied.`),
              detail.booking.items.map((i)=>h(React.Fragment,{key:i.itemId},field(`cash-item-${i.itemId}`,`${i.plotId} — remaining ${peso(i.totalCentavos-i.creditCentavos)}`,allocations[i.itemId]||'',(v)=>setAllocations({...allocations,[i.itemId]:v}),{inputMode:'decimal',required:false,placeholder:'0.00'}))),
              field('cash-reason','Approval reason',reason,setReason,{maxLength:1000}),h('label',{className:'pr-check'},h('input',{type:'checkbox',checked:confirmed,onChange:(e)=>setConfirmed(e.target.checked)}),'I reviewed the latest photo and it matches this printed cash receipt.'),
              h('button',{className:'pv-primary',disabled:busy || !p.evidenceRevisionCount || !!detail.blocker},'Review cash approval')))))),
      h('section',{id:'cash-print',className:'pc-print','aria-label':'Cash receipt print copy'},print?h(React.Fragment,null,h('h1',null,'Golden Harmonic Memorial Park'),h('h2',null,'Cash acknowledgement'),
        h('p',{className:'pc-print-status'},print.status==='verified'?'APPROVED — cash verified':'PROVISIONAL — pending verification; no account credit yet'),
        h('p',null,'Internal acknowledgement only. This is not an official tax invoice.'),h('p',null,print.snapshot.cashReceiptId),
        h('dl',null,[['Received from',print.snapshot.name],['Account / reservation',print.snapshot.sourceId],['Purpose',print.snapshot.purpose],['Cash received',peso(print.snapshot.receivedCentavos)],
          ['Actual received time (Philippines)',stamp(print.snapshot.receivedAt)],['Collector',print.snapshot.collector],['Office register',print.snapshot.officeLabel],['Office reference',print.snapshot.officeReference],
          ['Plots',print.snapshot.plotIds.join(', ')],['Recorded time (Philippines)',stamp(print.snapshot.recordedAt)]].map(([k,v])=>h('div',{key:k},h('dt',null,k),h('dd',null,v)))),
        h('p',null,'Received by: ____________________     Customer: ____________________')):h('p',null,'Use Print receipt to load an authorized receipt copy.')));
  }
  ReactDOM.createRoot(document.getElementById('cash-root')).render(h(App));
})();
