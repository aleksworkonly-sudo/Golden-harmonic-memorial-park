'use strict';
(() => {
  async function ready(){
    if(!window.auth)throw new Error('Sign-in could not load. Reload this page.');
    await window.firebaseAuthReady;
    await window.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    await new Promise(resolve=>{let off;off=window.auth.onAuthStateChanged(()=>{resolve();setTimeout(()=>off?.(),0);});});
  }
  async function api(action,fields={},authenticated=false){
    const headers={'Content-Type':'application/json'};
    if(authenticated){if(!window.auth?.currentUser)throw new Error('Please sign in again.');headers.Authorization=`Bearer ${await window.auth.currentUser.getIdToken(true)}`;}
    const response=await fetch('/api/account-access',{method:'POST',credentials:'same-origin',headers,body:JSON.stringify({action,...fields})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(body.error || 'Account access is temporarily unavailable.'),{code:body.code});
    return body;
  }
  async function reset(email){
    if(!email || !email.includes('@'))throw new Error('Enter your account email first.');
    try{await window.auth.sendPasswordResetEmail(email.trim());}
    catch(e){if(!['auth/user-not-found','auth/invalid-email'].includes(e.code))throw new Error('Could not send recovery instructions. Try again shortly.');}
    return 'If an account exists, password recovery instructions will be sent. Check your inbox and spam folder.';
  }
  window.AccountAuth={ready,api,reset};
})();
