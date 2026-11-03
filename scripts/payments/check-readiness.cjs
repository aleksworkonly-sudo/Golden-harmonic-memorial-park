'use strict';

// Read-only query/index probes. No reservations, sessions, evidence, or money writes.
// Usage: node scripts/payments/check-readiness.cjs --describe
//        node scripts/payments/check-readiness.cjs
// Live mode requires FIREBASE_SERVICE_ACCOUNT_B64 in the current environment.
const { getFirebaseServices } = require('../../lib/payments/firebase');
const SENTINEL = '__payment_readiness_probe__';
const asc = field => [field, 'asc'];
const desc = field => [field, 'desc'];

function queryChecks() {
  const checks = [
    { id:'customer-submissions', collection:'payments', filters:[['submissionScope','==',SENTINEL]], order:[desc('submittedAt'),desc('paymentId')] },
    { id:'customer-ledger', collection:'ledgerEntries', filters:[['bookingId','==',SENTINEL]], order:[desc('recordedAt'),desc('receiptId')] },
    { id:'statement-ledger', collection:'ledgerEntries', filters:[['bookingId','==',SENTINEL]], order:[asc('recordedAt'),asc('receiptId')] }
  ];
  // Every optional equality-filter combination used by manual review. Cash
  // review uses a subset of these same field shapes with schemaVersion 5.
  const filters=['status','channel','sourceId'];
  for(let mask=0;mask<8;mask++){
    const selected=filters.filter((_,i)=>mask & (1<<i));
    checks.push({id:`admin-review-${selected.join('-') || 'all'}`,collection:'payments',
      filters:[['schemaVersion','==',3],...selected.map(field=>[field,'==',SENTINEL])],order:[asc('submittedAt'),asc('paymentId')]});
  }
  checks.push(
    {id:'provider-customer-history',collection:'paymentIntents',filters:[['submissionScope','==',SENTINEL]],order:[desc('createdAt'),desc('intentId')]},
    {id:'provider-admin-attempts',collection:'paymentIntents',filters:[['providerAccountId','==',SENTINEL],['environment','==','test']],order:[desc('createdAt'),desc('intentId')]},
    {id:'provider-admin-events',collection:'providerEvents',filters:[['providerAccountId','==',SENTINEL],['environment','==','test']],order:[desc('createdAt'),desc('eventKey')]},
    {id:'notifications',collection:'notifications',filters:[['submissionScope','==',SENTINEL]],order:[desc('createdAt'),desc('__name__')]},
    {id:'outbox-ready',collection:'emailOutbox',filters:[['state','==','ready'],['nextAttemptAt','<=',0]],order:[asc('nextAttemptAt')]},
    {id:'outbox-expired',collection:'emailOutbox',filters:[['state','==','sending'],['leaseUntil','<=',0]],order:[asc('leaseUntil')]},
    {id:'collection-report',collection:'ledgerEntries',filters:[['receivedDate','>=','1900-01-01'],['receivedDate','<=','1900-01-02']],order:[asc('receivedDate'),asc('receiptId')]}
  );
  return checks;
}

async function checkQueries(db) {
  const results=[];
  for(const check of queryChecks()){
    try {
      let query=db.collection(check.collection);
      for(const [field,operator,value] of check.filters) query=query.where(field,operator,value);
      for(const [field,direction] of check.order) query=query.orderBy(field,direction);
      await query.limit(1).get(); // Discard results; never print customer records.
      results.push({check:check.id,status:'ready'});
    } catch(error) {
      const missing=[9,'9','failed-precondition','FAILED_PRECONDITION'].includes(error?.code) && /requires an index|index.*(?:building|not ready)/i.test(error.message || '');
      results.push({check:check.id,status:missing?'index_required':'failed'});
    }
  }
  return results;
}

if(require.main===module){
  if(process.argv.includes('--describe')) console.log(JSON.stringify(queryChecks(),null,2));
  else if(!process.env.FIREBASE_SERVICE_ACCOUNT_B64){
    console.error('Cannot check live indexes: FIREBASE_SERVICE_ACCOUNT_B64 is missing. Use --describe to list required queries.');
    process.exitCode=1;
  }else{
    Promise.resolve().then(()=>checkQueries(getFirebaseServices().db)).then(results=>{
      console.log(JSON.stringify(results,null,2));
      if(results.some(result=>result.status!=='ready')) process.exitCode=1;
    }).catch(()=>{console.error('Could not initialize the read-only payment query check. Verify the server Firebase configuration.');process.exitCode=1;});
  }
}
module.exports={queryChecks,checkQueries};
