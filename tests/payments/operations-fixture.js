'use strict';
const { lifecycleFixture } = require('./lifecycle-fixture');
const { createOutboxService } = require('../../lib/payments/outbox');
const { createReportService } = require('../../lib/payments/reports');
function operationsFixture() {
  const f=lifecycleFixture(),clock={time:f.time},sent=[];
  for(const id of ['c1','PS-0001']){const path=`bookings/booking-${id}`,b=f.db.read(path),sourcePath=id==='c1'?'customers/c1':'presaleApplications/PS-0001';
    f.db.put(sourcePath,{...f.db.read(sourcePath),email:'buyer@example.test'});
    f.db.put(path,{...b,lifecycleTerms:{...b.lifecycleTerms,reservedAt:Date.parse('2026-08-03T04:00:00Z')},notificationContact:{enabled:true,verified:true,version:1,email:'buyer@example.test',ownerBinding:b.ownerBinding}});}
  const state={outcome:'accepted'},send=async(message)=>{sent.push(message);return {state:state.outcome,...(state.outcome==='accepted'?{messageId:`message-${sent.length}`}:{})};};
  const outbox=createOutboxService({db:f.db,auth:f.auth,origin:'https://park.example.test',now:()=>clock.time,send});
  const reports=createReportService({db:f.db,auth:f.auth,now:()=>clock.time});
  const paid=async()=>{const p=await f.submit();return f.review.decide('admin',f.decision(p));};
  return {...f,clock,sent,state,send,outbox,reports,paid};
}
module.exports={operationsFixture};
