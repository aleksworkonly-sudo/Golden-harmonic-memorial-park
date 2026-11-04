'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {queryChecks,checkQueries}=require('../../scripts/payments/check-readiness.cjs');

test('readiness probes are bounded reads, continue after missing indexes, and never expose returned documents',async()=>{
  const queried=[];
  const db={collection(collection){
    const shape={collection,filters:[],order:[]};
    const query={
      where(...args){shape.filters.push(args);return query;},
      orderBy(...args){shape.order.push(args);return query;},
      limit(value){shape.limit=value;return query;},
      async get(){
        queried.push(shape);
        if(collection==='payments' && shape.filters[0][0]==='submissionScope'){
          throw Object.assign(new Error('The query requires an index. PRIVATE_PROJECT_URL'),{code:9});
        }
        return {get docs(){throw Error('Readiness check must not inspect customer data');}};
      }
    };
    return query;
  }};
  const results=await checkQueries(db);
  assert.equal(results.length,queryChecks().length);
  assert.equal(results[0].status,'index_required');
  assert.ok(results.slice(1).every(result=>result.status==='ready'));
  assert.ok(queried.every(query=>query.limit===1));
  assert.equal(JSON.stringify(results).includes('PRIVATE'),false);
});
