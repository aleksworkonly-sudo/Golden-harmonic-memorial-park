'use strict';
(() => {
  function usePendingCount(user,enabled) {
    const [state,setState]=React.useState({pending:null,error:''});
    React.useEffect(()=>{
      let active=true,running=false,rerun=false;
      const controller=new AbortController();
      setState({pending:null,error:''});
      if(!enabled || !user)return;
      async function refresh(){
        if(!active || document.hidden)return;
        if(running){rerun=true;return;}
        running=true;
        try{
          const token=await user.getIdToken();
          const response=await fetch('/api/payment-review',{method:'POST',credentials:'same-origin',signal:controller.signal,
            headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'count'})});
          const data=await response.json();
          if(!response.ok)throw Error(data.error || 'Could not load the payment count.');
          if(!Number.isSafeInteger(data.pending) || data.pending<0)throw Error('The payment count is unavailable.');
          if(active && window.auth.currentUser?.uid===user.uid){
            setState({pending:data.pending,error:''});
            window.dispatchEvent(new CustomEvent('payment-queue-count',{detail:{pending:data.pending}}));
          }
        }catch(error){if(active && error.name!=='AbortError')setState({pending:null,error:error.message});}
        finally{running=false;if(active && rerun){rerun=false;refresh();}}
      }
      refresh();
      const timer=setInterval(refresh,30000);
      window.addEventListener('focus',refresh);
      window.addEventListener('payment-records-changed',refresh);
      window.addEventListener('payment-count-refresh',refresh);
      document.addEventListener('visibilitychange',refresh);
      return()=>{active=false;controller.abort();clearInterval(timer);
        window.removeEventListener('focus',refresh);window.removeEventListener('payment-records-changed',refresh);
        window.removeEventListener('payment-count-refresh',refresh);document.removeEventListener('visibilitychange',refresh);};
    },[user?.uid,enabled]);
    return enabled?state:{pending:null,error:''};
  }
  window.AdminPaymentNotifications={usePendingCount};
})();
