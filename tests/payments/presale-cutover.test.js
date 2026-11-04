'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {MemoryFirestore}=require('./memory-firestore');

function endpoint(file,db) {
  let sends=0;
  const filename=path.resolve(__dirname,'../../api',file),actualRequire=createRequire(filename);
  const admin={apps:[{}],firestore:()=>db,auth:()=>({verifyIdToken:async()=>({uid:'admin'})})};
  const context={module:{exports:{}},require:(name)=>name==='firebase-admin'?admin:actualRequire(name),
    process:{env:{BREVO_API_KEY:'synthetic',SENDER_EMAIL:'office@example.test'}},Buffer,AbortController,setTimeout,clearTimeout,
    console:{error(){}},fetch:async()=>{sends++;return {ok:true};}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
  const call=async(body)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await context.module.exports({method:'POST',body,headers:{host:'localhost'}},res);return res;};
  return {call,sends:()=>sends};
}
const body={block:'A',lot:1,name:'Synthetic Buyer',address:'Synthetic address',mobile:'09123456789',email:'buyer@example.test',consent:true,method:'cash',plan:'cash'};

test('presale HTTP collision preserves existing source/counter/plots and sends no email',async()=>{
  for(const data of [{canonicalBookingId:'protected'},{status:'new'}]){
    const db=new MemoryFirestore({'presaleApplications/PS-0001':data}),h=endpoint('presale.js',db);
    const r=await h.call(body);assert.equal(r.code,409);assert.equal(h.sends(),0);
    assert.deepEqual(db.read('presaleApplications/PS-0001'),data);assert.equal(db.count('plots'),0);assert.equal(db.count('counters'),0);
  }
});

test('presale HTTP unused identity creates counter/source/plot together',async()=>{
  const db=new MemoryFirestore(),h=endpoint('presale.js',db),r=await h.call(body);
  assert.equal(r.code,200);assert.equal(r.body.ref,'PS-0001');assert.equal(db.read('plots/A_1').presaleRef,'PS-0001');
  assert.equal(db.read('counters/presale').n,1);assert.equal(h.sends(),1);
});

test('legacy acknowledgement endpoint refuses migrated or locked sources before provider send',async()=>{
  for(const marker of [{canonicalBookingId:'b1'},{paymentMigrationLock:'review'}]){
    const records={'users/admin':{role:'admin'},'presaleApplications/PS-0001':{...marker,email:'buyer@example.test',payments:[{amount:5000,date:1}]}};
    const db={collection:col=>({doc:id=>({get:async()=>({exists:!!records[`${col}/${id}`],data:()=>records[`${col}/${id}`]})})})};
    const h=endpoint('send-ar.js',db),r=await h.call({idToken:'fake',ref:'PS-0001',index:0});
    assert.equal(r.code,409);assert.equal(h.sends(),0);
  }
});
