'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {queryChecks,checkQueries,requiredIndexes}=require('../../scripts/payments/check-readiness.cjs');

test('index export covers the default queue, filter combinations and customer history separately',()=>{
  const {indexes}=requiredIndexes();
  const fields=index=>index.fields.map(field=>`${field.fieldPath}:${field.order}`).join(',');
  const payments=indexes.filter(index=>index.collectionGroup==='payments');
  assert.ok(payments.some(index=>fields(index)==='schemaVersion:ASCENDING,status:ASCENDING,submittedAt:ASCENDING,paymentId:ASCENDING'));
  assert.ok(payments.some(index=>fields(index)==='submissionScope:ASCENDING,submittedAt:DESCENDING,paymentId:DESCENDING'));
  assert.equal(payments.filter(index=>index.fields[0].fieldPath==='schemaVersion').length,8);
  assert.equal(indexes.length,queryChecks().length);
  for(const index of indexes){
    assert.equal(index.queryScope,'COLLECTION');
    assert.equal(new Set(index.fields.map(field=>field.fieldPath)).size,index.fields.length);
  }
  assert.equal(Object.hasOwn(requiredIndexes(),'fieldOverrides'),false);
});

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
