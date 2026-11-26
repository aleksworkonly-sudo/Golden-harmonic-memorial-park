'use strict';
(() => {
  const el=id=>document.getElementById(id),status=el('account-status'),error=el('account-error');
  let actionUrl=location.href,invite=new URL(actionUrl).searchParams.get('invite'),context=null,busy=false;
  // Firebase may wrap the continue URL. Only extract a non-secret invite ID, never an identity.
  try{if(!invite){const next=new URL(actionUrl).searchParams.get('continueUrl');if(next && new URL(next).origin===location.origin)invite=new URL(next).searchParams.get('invite');}}catch(_){}
  const fresh=new URL(actionUrl).searchParams.has('new');
  try{if(fresh)sessionStorage.removeItem('gh-account-invite');
    if(invite && /^[A-Za-z0-9_-]{43}$/.test(invite))sessionStorage.setItem('gh-account-invite',invite);
    else invite=fresh?null:sessionStorage.getItem('gh-account-invite');}catch(_){}
  history.replaceState(null,'',location.pathname);
  const show=id=>{for(const name of ['verify-form','password-form','account-complete','resend-form'])el(name).hidden=name!==id;};
  function failure(e){error.textContent=e.code?.startsWith('auth/')?'This sign-in step could not finish. Check your email/password or request a new setup link.':e.message || 'Connection interrupted. Retry this setup step.';error.hidden=false;error.focus();}
  async function run(work){if(busy)return;busy=true;error.hidden=true;
    document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await work();}catch(e){failure(e);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  async function load(){
    context=await AccountAuth.api('setup_context',{inviteId:invite},true);
    if(context.complete){show('account-complete');status.textContent='Account connected.';el('account-complete').querySelector('h2').focus();return;}
    el('verified-email').textContent=`Verified email: ${context.email}`;
    el('verified-source').textContent=`Connect ${context.source.kind==='presale'?'reservation':'customer account'} ${context.source.id}.`;
    show('password-form');status.textContent='Email verified. Choose how to finish your account.';el('setup-title').focus();
  }
  el('verify-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const email=el('verify-email').value.trim();
    if(window.auth.currentUser)await window.auth.signOut();
    const result=await window.auth.signInWithEmailLink(email,actionUrl);
    actionUrl=null;
    el('password-mode').value=result.additionalUserInfo?.isNewUser?'new':'existing';
    el('password-mode').dispatchEvent(new Event('change'));
    await load();
  });});
  el('password-mode').addEventListener('change',()=>{
    const existing=el('password-mode').value==='existing';
    el('password-label').textContent=existing?'Current password':'New password';el('account-password').autocomplete=existing?'current-password':'new-password';
    el('account-password').minLength=existing?1:8;
  });
  el('show-password').addEventListener('change',()=>el('account-password').type=el('show-password').checked?'text':'password');
  el('password-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!window.auth.currentUser || !context)throw Error('Sign in again to resume setup.');
    const uid=window.auth.currentUser.uid,password=el('account-password').value;
    if(el('password-mode').value==='existing'){
      const signed=await window.auth.signInWithEmailAndPassword(context.email,password);
      if(signed.user.uid!==uid)throw Error('Your signed-in account changed. Reopen your setup link.');
    }else await window.auth.currentUser.updatePassword(password);
    el('account-password').value='';
    await AccountAuth.api('complete_claim',{inviteId:invite,termsAccepted:el('account-terms').checked},true);
    try{sessionStorage.removeItem('gh-account-invite');}catch(_){}
    show('account-complete');status.textContent='Account connected.';el('account-complete').querySelector('h2').focus();
  });});
  el('setup-reset').addEventListener('click',()=>run(async()=>status.textContent=await AccountAuth.reset(context?.email)));
  el('setup-signout').addEventListener('click',()=>run(async()=>{await window.auth.signOut();location.replace('/account-activate.html?new=1');}));
  el('resend-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const kind=el('source-kind').value,id=el('source-id').value.trim();
    const result=await AccountAuth.api('request_setup',{source:{kind,id:kind==='presale'?id.toUpperCase():id},email:el('setup-email').value.trim()});
    status.textContent=result.message;
  });});
  run(async()=>{
    const config=await fetch('/api/account-access',{cache:'no-store'}).then(r=>r.json());
    if(!config.enabled){show(null);status.textContent='Account setup is not enabled yet. Contact the office for payment assistance.';return;}
    await AccountAuth.ready();
    if(invite && window.auth.isSignInWithEmailLink(actionUrl)){
      show('verify-form');status.textContent='Open your buyer account in a few steps.';
      if(window.auth.currentUser){el('switch-notice').hidden=false;el('switch-notice').textContent='Continuing will sign out the current session and verify the email entered below.';}
    }else if(invite && window.auth.currentUser)await load();
    else{show('resend-form');status.textContent='Request a setup link, or sign in if you already activated your account.';}
  });
})();
