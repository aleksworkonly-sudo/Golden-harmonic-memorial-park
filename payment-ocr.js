'use strict';
(() => {
  function candidates(text,confidence=0) {
    const result=[]; const add=(field,value)=>{value=value.trim().slice(0,100);if(value && !result.some((r)=>r.field===field && r.value===value) && result.filter((r)=>r.field===field).length<3)result.push({field,value,confidence:Math.round(Math.max(0,Math.min(100,confidence || 0)))});};
    for(const line of String(text || '').slice(0,12000).split(/\r?\n/)) {
      const ref=/(?:reference|ref(?:erence)?\.?\s*(?:no\.?|number)?|transaction\s*(?:id|no\.?))\s*[:#-]?\s+([A-Z0-9][A-Z0-9 -]{3,60})/i.exec(line);if(ref)add('reference',ref[1]);
      const amount=/(?:PHP|₱|amount\s*[:=]?)\s*([\d,]+\.\d{2})/i.exec(line);if(amount)add('amount',amount[1].replaceAll(',',''));
      const date=/\b(20\d{2}-\d{2}-\d{2})\b/.exec(line);if(date && !Number.isNaN(Date.parse(date[1])))add('transferDate',date[1]);
      const recipient=/^(?:recipient|paid to|sent to)\s*[:=-]\s*(.{1,100})$/i.exec(line.trim());if(recipient)add('recipient',recipient[1]);
    }
    return result;
  }
  if(typeof module!=='undefined' && module.exports)module.exports={candidates};
  if(typeof window==='undefined' || !window.React)return;
  let loading;
  function load() {
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';script.crossOrigin='anonymous';
      script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('OCR unavailable'));script.onerror=()=>{loading=null;script.remove();reject(Error('OCR download failed'));};document.head.append(script);});
    return loading;
  }
  const h=React.createElement,{useState,useRef,useEffect}=React;
  function PaymentOCR({image,onApply,onCandidates}) {
    const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[rows,setRows]=useState([]),[message,setMessage]=useState('');const run=useRef(0),worker=useRef(null),timer=useRef(null);
    const stop=()=>{run.current++;clearTimeout(timer.current);worker.current?.terminate().catch(()=>{});worker.current=null;setBusy(false);};
    useEffect(()=>{setRows([]);setMessage('');return()=>{run.current++;clearTimeout(timer.current);worker.current?.terminate().catch(()=>{});worker.current=null;};},[image]);
    async function scan() {
      const ticket=++run.current;setBusy(true);setProgress(0);setMessage('');setRows([]);
      timer.current=setTimeout(()=>{if(ticket===run.current){stop();setMessage('Reading timed out. Your image and typed values are kept; enter details manually.');}},20000);
      try{const lib=await load();if(ticket!==run.current)return;
        const w=await lib.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
          langPath:'https://tessdata.projectnaptha.com/4.0.0',cacheMethod:'none',logger:(m)=>{if(ticket===run.current && m.status==='recognizing text')setProgress(Math.round(m.progress*100));}});
        if(ticket!==run.current){await w.terminate();return;}worker.current=w;
        const {data}=await w.recognize(image);if(ticket!==run.current)return;
        const found=candidates(data.text,data.confidence);setRows(found);onCandidates(found);setMessage(found.length?'Auto-detected — please check each suggestion.':'No clear suggestions found. Enter the details manually.');
      }catch(_){if(ticket===run.current)setMessage('Could not read this image. Your typed values are kept; enter details manually.');}
      finally{if(ticket===run.current)stop();}
    }
    return h('section',{'aria-label':'Optional receipt reader'},h('p',{className:'pv-muted'},'Optional: read this image on your device. The reader downloads language files; it does not send your receipt to an OCR service.'),
      busy?h('div',null,h('p',{role:'status'},`Reading receipt… ${progress}%`),h('button',{type:'button',className:'pv-secondary',onClick:()=>{stop();setMessage('Reading cancelled. Enter details manually.');}},'Cancel reading')):
        h('button',{type:'button',className:'pv-secondary',onClick:scan},'Read receipt image'),
      message && h('p',{role:'status'},message),rows.map((r,i)=>h('div',{key:i,className:'pv-notice'},`${r.field}: ${r.value} (confidence ${r.confidence}%)`,
        r.field==='recipient'?h('small',null,' Compare this recipient with the office receiving instructions.'):
          h('button',{type:'button',className:'pv-secondary',onClick:()=>onApply(r.field,r.value)},`Use ${r.field} suggestion`))));
  }
  window.PaymentOCR=PaymentOCR;
})();
