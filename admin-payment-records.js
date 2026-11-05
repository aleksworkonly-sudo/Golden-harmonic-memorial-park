'use strict';
(() => {
  async function hydrate(rows,kind) {
    const result=new Array(rows.length);let next=0;
    await Promise.all(Array.from({length:Math.min(3,rows.length)},async()=>{
      while(next<rows.length){
        const i=next++,row=rows[i];
        if(!row.canonicalBookingId){result[i]=row;continue;}
        const user=window.auth.currentUser;
        if(!user)throw Error('Sign in to load verified payment records.');
        const token=await user.getIdToken();
        const response=await fetch('/api/payment-review',{method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
          body:JSON.stringify({action:'record',kind,id:row._id})});
        const data=await response.json();
        if(!response.ok)throw Error(data.error || 'Verified payment records could not load.');
        if(window.auth.currentUser?.uid!==user.uid)throw Error('Your sign-in changed. Reload the records.');
        result[i]={...row,payments:data.payments,verifiedLedger:data,
          ...(kind==='presale'?{totalPrice:data.total,...(data.monthly!=null?{monthly:data.monthly}:{} )}:{} )};
      }
    }));
    return result;
  }
  function useRows(raw,kind){
    const [state,setState]=React.useState({raw:null,rows:null,error:''});
    const [revision,setRevision]=React.useState(0);
    const retry=()=>setRevision(n=>n+1);
    React.useEffect(()=>{
      window.addEventListener('payment-records-changed',retry);
      window.addEventListener('focus',retry);
      return()=>{window.removeEventListener('payment-records-changed',retry);window.removeEventListener('focus',retry);};
    },[]);
    React.useEffect(()=>{
      let active=true;
      setState({raw,rows:null,error:''});
      if(raw)hydrate(raw,kind).then(rows=>{if(active)setState({raw,rows,error:''});})
        .catch(error=>{if(active)setState({raw,rows:null,error:error.message});});
      return()=>{active=false;};
    },[raw,kind,revision]);
    return {rows:state.raw===raw?state.rows:null,error:state.error,retry};
  }
  function ErrorNotice({error,retry}){
    return React.createElement('div',{role:'alert',className:'pv-notice pv-error'},
      'Verified records could not load. Reports are paused to avoid showing incomplete balances. ',error,' ',
      React.createElement('button',{type:'button',className:'btn btn-outline',onClick:retry},'Retry records'));
  }
  window.AdminPaymentRecords={hydrate,useRows,ErrorNotice};
})();
