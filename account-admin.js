'use strict';
(() => {
  const el=id=>document.getElementById(id);let source=null,busy=false,contactVersion=0;
  async function run(work){if(busy)return;busy=true;el('support-error').hidden=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{await work();}catch(e){el('support-error').textContent=e.message;el('support-error').hidden=false;el('support-error').focus();}
    finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  async function refresh(){const r=await AccountAuth.api('admin_status',{source},true);el('support-details').hidden=false;
    el('support-summary').textContent=`Access: ${r.access.replaceAll('_',' ')}. Invitation: ${r.invitation.replaceAll('_',' ')}. Email: ${r.delivery.replaceAll('_',' ')}.`;
    contactVersion=r.contactVersion;el('contact-form').hidden=!r.canConfirmContact;el('contact-email').value=r.email;}
  el('support-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{source={kind:el('support-kind').value,id:el('support-id').value.trim()};if(source.kind==='presale')source.id=source.id.toUpperCase();await refresh();});});
  el('support-resend').addEventListener('click',()=>run(async()=>{await AccountAuth.api('admin_resend',{source},true);el('support-status').textContent='Setup email requested. Review its delivery status below.';await refresh();}));
  el('support-revoke').addEventListener('click',()=>run(async()=>{if(!el('support-confirm').checked)throw Error('Confirm the identity check and revocation first.');
    await AccountAuth.api('admin_revoke',{source,reason:el('support-reason').value},true);el('support-status').textContent='Online account access revoked. Payment records remain intact.';el('support-confirm').checked=false;await refresh();}));
  el('contact-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    await AccountAuth.api('admin_contact',{source,email:el('contact-email').value,expectedVersion:contactVersion,
      reason:el('contact-reason').value,confirmed:el('contact-confirm').checked},true);
    el('contact-confirm').checked=false;el('support-status').textContent='Contact confirmed. Old setup links and guest sessions are invalid. Use Resend setup email to invite this buyer.';await refresh();});});
  run(async()=>{await window.firebaseAuthReady;
    await new Promise(resolve=>{let off;off=window.auth.onAuthStateChanged(()=>{resolve();setTimeout(()=>off?.(),0);});});
    if(!window.auth?.currentUser)throw Error('Sign in through the administration page first.');el('support-status').textContent='Admin session ready. Enter the buyer record to continue.';});
})();
