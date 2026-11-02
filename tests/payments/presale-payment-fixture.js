'use strict';
const {MemoryFirestore}=require('./memory-firestore');
const {createPresalePaymentService}=require('../../lib/payments/presale-payment');
const {createSubmissionService,MAX_BUDGET}=require('../../lib/payments/submission');
const {createReviewService}=require('../../lib/payments/review');
const env={PAYMENT_ACCESS_ENABLED:'true',PAYMENT_ACCESS_ORIGIN:'https://park.example.test',
  PAYMENT_ACCESS_RATE_SECRET:'synthetic-secret-at-least-thirty-two-characters',BREVO_API_KEY:'synthetic',SENDER_EMAIL:'office@example.test',
  PAYMENT_PRESALE_ENABLED:'true',PAYMENT_SUBMISSIONS_ENABLED:'true',PAYMENT_REVIEW_ENABLED:'true',PAYMENT_PRESALE_GCASH_ACCOUNT_ID:'test-gcash'};
// Injected only in local tests: never the production asset manifest or real receiving instructions.
const qrAssets={gcash:{verified:true,channel:'gcash',accountName:'Synthetic Recipient',imagePath:'/payment-qr/synthetic-gcash.png',
  receivingAccountId:'test-gcash',accountNumber:'',receivingAccountVersion:1}};
function presaleFixture(){
  let time=Date.parse('2026-11-02T04:00:00Z');
  const db=new MemoryFirestore({'paymentReceivingAccounts/test-gcash':{enabled:true,presaleEnabled:true,version:1,channel:'gcash',
    accountName:'Synthetic Recipient',accountNumber:'',label:'Synthetic GCash',instructions:'Test only',qrAssetId:'gcash',qrVerified:true},
    'paymentProofBudget/manual':{usedBytes:0,limitBytes:MAX_BUDGET},'users/admin':{role:'admin'},'users/staff':{role:'staff'}});
  const auth={verifyIdToken:async(uid)=>({uid})};
  const settings={db,auth,env,qrAssets,now:()=>time};
  const core=createPresalePaymentService(settings),submissions=createSubmissionService(settings),review=createReviewService(settings);
  const input={requestId:'a'.repeat(64),plots:[{blockId:'A',lotNo:1,plotCode:'A-0001',typeId:'corner-premium',price:47500,contractBase:47500}],
    total:57000,monthly:2375,spot:47500,listPrice:47500,name:'Synthetic Buyer',address:'Synthetic Address',mobile:'09123456789',mobileKey:'9123456789',
    email:'buyer@example.test',plan:'installment',years:2,method:'gcash',customMonthly:0};
  return {db,auth,core,submissions,review,input,settings,now:()=>time,advance:(ms)=>{time+=ms;}};
}
module.exports={presaleFixture,env,qrAssets};
