'use strict';
const { requireCondition } = require('./errors');
function createActionLink(auth,origin) {
  requireCondition(new URL(origin).protocol==='https:' && new URL(origin).origin===origin,'ACCOUNT_CONFIG','Account origin is invalid.',503);
  return (email,inviteId)=>auth.generateSignInWithEmailLink(email,{handleCodeInApp:true,
    url:`${origin}/account-activate.html?invite=${encodeURIComponent(inviteId)}`});
}
module.exports={createActionLink};
