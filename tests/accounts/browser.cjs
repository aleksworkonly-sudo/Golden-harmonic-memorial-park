'use strict';
// Synthetic browser integration: actual pages/domain services, fake Firebase identity and email delivery.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PAYMENT_PLAYWRIGHT_MODULE || 'playwright');
const {accountFixture}=require('./fixture');
const {createAccessService}=require('../../lib/payments/access');
const root=path.resolve(__dirname,'../..');
(async()=>{
  const f=await accountFixture(),invite=await f.issue();
  let failClaimOnce=true,accountsEnabled=true;
  const access=createAccessService({db:f.db,auth:f.auth,now:f.now,rateSecret:'test-only-secret-at-least-32-characters'});
  const browserAuth=`(()=>{let user=null;const listeners=[];function emit(){listeners.forEach(f=>f(user));}
    function makeUser(){return {uid:'buyer',email:${JSON.stringify(f.input.email)},getIdToken:async()=> 'buyer',updatePassword:async()=>{}};}
    if(sessionStorage.getItem('test-logged-in'))user=makeUser();
    window.auth={get currentUser(){return user;},setPersistence:async()=>{},onAuthStateChanged(f){listeners.push(f);setTimeout(()=>f(user),0);return ()=>{};},
      isSignInWithEmailLink:url=>!!url && url.includes('oobCode='),signInWithEmailLink:async(email)=>{if(email!==${JSON.stringify(f.input.email)})throw Error('Email does not match.');user=makeUser();sessionStorage.setItem('test-logged-in','1');emit();return {user,additionalUserInfo:{isNewUser:true}};},
      signInWithEmailAndPassword:async()=>{user=makeUser();sessionStorage.setItem('test-logged-in','1');emit();return {user};},
      sendPasswordResetEmail:async()=>{},signOut:async()=>{user=null;sessionStorage.removeItem('test-logged-in');emit();}};
    window.firebase={auth:{Auth:{Persistence:{SESSION:'session'}}}};})();`;
  const files=new Set(['account-activate.html','account-activate.js','account-auth.js','account.css','payment-view.css','payment-view.js','payment-submit.js','payment-gateway.js','payment-communications.js','payment-lifecycle.js','payment-operations.css','favicon-32.png']);
  const server=http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.slice(1);
    if(file.startsWith('api/')){
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET')return res.end(JSON.stringify({enabled:file==='api/account-access'?accountsEnabled:['api/payment-access','api/payment-submission'].includes(file)}));
      try{
        let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw),token=String(req.headers.authorization || '').replace('Bearer ','');let result;
        if(file==='api/account-access'){
          if(b.action==='setup_context')result=await f.claims.context(token,b.inviteId);
          else if(b.action==='complete_claim'){
            if(failClaimOnce){failClaimOnce=false;throw Error('Connection interrupted. Retry this setup step.');}
            result=await f.claims.complete(token,b.inviteId,b.termsAccepted);
          }
          else if(b.action==='request_setup'){await f.invitations.issue(b.source,{expectedEmail:b.email});result={message:'If eligible, a setup email will be sent.'};}
          else throw Error('Unexpected account action');
        }else if(file==='api/payment-access'){
          if(b.action==='account_list')result={accounts:await access.accountList({idToken:token})};
          else if(b.action==='account_summary')result={summary:await access.accountSummary({idToken:token,source:b.source,customerId:b.customerId})};
          else throw Error('Unexpected access action');
        }else if(file==='api/payment-submission'){
          const c={mode:'account',idToken:token,source:b.source,customerId:b.customerId};
          if(b.action==='context')result=await f.submissions.context(c);
          else if(b.action==='list')result=await f.submissions.list(c);
          else throw Error('Unexpected submission action');
        }else throw Error('Unexpected API');
        return res.end(JSON.stringify(result));
      }catch(e){res.statusCode=e.status || 500;return res.end(JSON.stringify({code:e.code,error:e.message}));}
    }
    if(file==='__firebase.js'){res.setHeader('Content-Type','application/javascript');return res.end(browserAuth);}
    if(['__react.js','__react-dom.js'].includes(file)){const name=file==='__react.js'?'react':'react-dom';res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(root,'node_modules/.review-qa/node_modules',name,'umd',name+'.production.min.js')));}
    if(file==='my-payments' || file==='account-activate.html'){
      let html=fs.readFileSync(path.join(root,file==='my-payments'?'my-payments.html':file),'utf8')
        .replace(/<script\b[^>]*src="https:[^"]*"[^>]*><\/script>/g,'')
        .replace(/<script src="\/(firebase-config|payment-ocr).js" defer><\/script>/g,'')
        .replace('</title>','</title><script src="/__firebase.js" defer></script>'+(file==='my-payments'?'<script src="/__react.js" defer></script><script src="/__react-dom.js" defer></script>':''));
      res.setHeader('Content-Type','text/html');return res.end(html);
    }
    if(files.has(file)){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');return res.end(fs.readFileSync(path.join(root,file)));}
    res.statusCode=404;res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/account-activate.html?invite=${invite.inviteId}&oobCode=synthetic`);
    await page.getByLabel('Buyer email',{exact:true}).fill('wrong@example.test');
    await page.getByRole('button',{name:'Verify email and continue'}).click();
    await page.getByRole('alert').waitFor();assert.equal(f.db.count('portalAccess'),0);
    await page.getByLabel('Buyer email',{exact:true}).fill(f.input.email);
    await page.getByRole('button',{name:'Verify email and continue'}).click();
    await page.getByRole('heading',{name:'Finish setting up your account'}).waitFor();
    assert.equal(new URL(page.url()).search,'');
    await page.getByLabel('New password',{exact:true}).fill('Synthetic-pass-123');
    await page.getByLabel('Show password').check();assert.equal(await page.locator('#account-password').getAttribute('type'),'text');
    await page.locator('#account-terms').check();
    for(const width of [320,390,768,1365]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.setViewportSize({width:390,height:900});
    const screenshot=path.join(os.tmpdir(),'gh-account-activation.png');await page.screenshot({path:screenshot,fullPage:true});
    await page.getByRole('button',{name:'Activate my account',exact:true}).click();
    await page.getByRole('alert').waitFor();assert.equal(f.db.count('portalAccess'),0);
    await page.reload();await page.getByRole('heading',{name:'Finish setting up your account'}).waitFor();
    await page.getByLabel('Password choice').selectOption('existing');
    await page.getByLabel('Current password',{exact:true}).fill('Synthetic-pass-123');await page.locator('#account-terms').check();
    await page.getByRole('button',{name:'Activate my account',exact:true}).click();await page.getByRole('heading',{name:'Your account is ready'}).waitFor();
    assert.equal(f.db.count('portalAccess'),1);assert.equal(f.db.count('receipts'),1);
    await page.getByRole('link',{name:'Open My Account'}).click();await page.getByRole('button',{name:new RegExp('Reservation '+f.source.id)}).click();
    await page.getByRole('heading',{name:'Recorded payment history'}).waitFor();assert.match(await page.locator('.pv-stats').innerText(),/19,000/);
    await page.getByRole('button',{name:'Pay remaining balance / submit proof',exact:true}).waitFor();
    await page.goto(`${origin}/account-activate.html?new=1`);
    await page.getByLabel('Reservation or customer reference').fill(f.source.id);await page.getByLabel('Registered buyer email').fill(f.input.email);
    await page.getByRole('button',{name:'Send setup link'}).click();await page.getByText('If eligible, a setup email will be sent.').waitFor();
    accountsEnabled=false;await page.reload();await page.getByText('Account setup is not enabled yet.',{exact:false}).waitFor();
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,screenshot,checks:'wrong email, verification, password, interrupted claim recovery, existing-password resume, presale history, future payment access, resend, disabled flag, 320/390/768/1365 layouts'}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
