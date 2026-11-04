'use strict';
const { authenticate, requireAdmin, documentId } = require('./auth');
const { readContract, identity, owner } = require('./operations-access');
const { requireCondition } = require('./errors');
const { centavos, addCentavos, pesosToCentavos } = require('./money');
const { parseDate } = require('./calendar');
const { readLifecycle } = require('./lifecycle-model');

const receiptView = (r) => ({ receiptId:r.receiptId, bookingId:r.bookingId, receivedDate:r.receivedDate,
  recordedAt:r.recordedAt, channel:r.channel, creditCentavos:r.contractCreditCentavos, unappliedCentavos:r.unappliedCentavos,
  grossCentavos:r.receivedCentavos, buyerFeeCentavos:r.buyerFeeCentavos || 0, providerFeeCentavos:r.providerFeeCentavos ?? null,
  balanceAfterCentavos:r.balanceAfterCentavos, allocations:r.allocations,
  notice:'Payment acknowledgement. This is not an official tax invoice.' });
const csvCell = (v) => `"${String(v ?? '').replace(/^[\s]*[=+@-]/, (m) => "'"+m).replace(/"/g,'""')}"`;
function csv(rows) {
  const fields=['receiptId','bookingId','receivedDate','channel','creditCentavos','unappliedCentavos','grossCentavos','buyerFeeCentavos','providerFeeCentavos','linkedProviderGrossCentavos','linkedBuyerFeeCentavos'];
  return '\uFEFF'+[fields.join(','),...rows.map((r)=>fields.map((f)=>csvCell(r[f])).join(','))].join('\r\n');
}
function recordedAllocations(booking,source) {
  const stored=booking.recordedAllocationSnapshot;
  if(stored){requireCondition(Array.isArray(stored.rows) && stored.rows.length<=500,'REPORT_REVIEW','Recorded allocation snapshot needs review.',409);
    return {source:'Reconciled allocation snapshot',rows:stored.rows.map((r)=>{requireCondition(r && typeof r.reference==='string' && r.reference.length<=128,'REPORT_REVIEW','Allocation reference needs review.',409);
      const row={reference:r.reference};for(const key of ['agentCentavos','brokerCentavos','companyCentavos','vatCentavos'])row[key]=r[key]===null || r[key]===undefined?null:centavos(r[key]);return row;})};}
  const payments=Array.isArray(source.payments)?source.payments:[];requireCondition(payments.length<=500,'REPORT_TOO_LARGE','Historical allocations need a dedicated export.',409);
  return {source:'Recorded legacy allocation snapshots; not added to canonical collections',rows:payments.filter((p)=>p && p.alloc).map((p)=>({reference:String(p.ref || 'Recorded payment').slice(0,128),
    agentCentavos:p.alloc.agent===undefined?null:pesosToCentavos(p.alloc.agent),brokerCentavos:p.alloc.broker===undefined?null:pesosToCentavos(p.alloc.broker),
    companyCentavos:p.alloc.company===undefined?null:pesosToCentavos(p.alloc.company),vatCentavos:p.alloc.vat===undefined?null:pesosToCentavos(p.alloc.vat)}))};
}
function createReportService({ db, auth, now=()=>Date.now() }) {
  async function receipt(credentials,id) {
    const who=await identity(auth,credentials); documentId(id);
    return db.runTransaction(async(tx)=>{
      const o=await owner(tx,db,who,now()), row=await tx.get(db.collection('receipts').doc(id));
      requireCondition(row.exists,'NOT_FOUND','Receipt not found.',404); const r=row.data();
      if(o)requireCondition(r.submissionScope===o.key && r.bookingId===o.source.canonicalBookingId,'FORBIDDEN','You cannot access this receipt.',403);
      const c=await readContract(tx,db,r.bookingId);
      requireCondition(!r.ownerBinding || r.ownerBinding===c.booking.ownerBinding,'BOOKING_REVIEW','Historical receipt ownership requires office review.',409);
      o?.renew(); return receiptView(r);
    });
  }
  async function statement(token,bookingId) {
    const who=await authenticate(auth,token); const at=now();
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,who); const c=await readContract(tx,db,bookingId),b=c.booking;
      const entries=(await tx.get(db.collection('ledgerEntries').where('bookingId','==',bookingId).orderBy('recordedAt','asc').orderBy('receiptId','asc').limit(501))).docs.map((d)=>d.data());
      requireCondition(entries.length<=500,'REPORT_TOO_LARGE','This contract needs a dedicated historical export.',409);
      let credit=0; for(const e of entries){ requireCondition(['receipt','opening_balance','reversal','adjustment'].includes(e.kind) && Number.isSafeInteger(e.contractCreditCentavos),'REPORT_REVIEW','Ledger entry needs reconciliation.',409); credit+=e.contractCreditCentavos; requireCondition(Number.isSafeInteger(credit),'REPORT_REVIEW','Ledger total is outside supported bounds.',409); }
      requireCondition(credit===b.netCreditCentavos,'REPORT_REVIEW','Ledger and contract balance disagree.',409);
      const lifecycle=await readLifecycle(tx,db,b,bookingId,at);
      return { bookingId,asOf:at,version:b.version,totalCentavos:b.totalCentavos,creditCentavos:credit,balanceCentavos:b.balanceCentavos,
        unappliedCentavos:b.unappliedCentavos,items:b.items,lifecycle,
        entries:entries.map((e)=>e.kind==='receipt'?{...receiptView(e),kind:e.kind}:{receiptId:e.receiptId,kind:e.kind,creditCentavos:e.contractCreditCentavos,receivedDate:e.receivedDate}),
        allocationSnapshot:recordedAllocations(b,c.source),
        allocationNotice:'Recorded allocation snapshot only. No new commission, tax or payout calculation.' };
    });
  }
  async function collections(token,input) {
    requireCondition(input && Object.keys(input).every((k)=>['from','to'].includes(k)),'INVALID_COMMAND','Use a date range.');
    parseDate(input.from);parseDate(input.to); requireCondition(input.from<=input.to,'INVALID_DATE','End date must follow start date.');
    const who=await authenticate(auth,token),at=now();
    return db.runTransaction(async(tx)=>{
      await requireAdmin(tx,db,who);
      const entries=(await tx.get(db.collection('ledgerEntries').where('receivedDate','>=',input.from).where('receivedDate','<=',input.to)
        .orderBy('receivedDate','asc').orderBy('receiptId','asc').limit(501))).docs.map((d)=>d.data());
      requireCondition(entries.length<=500,'REPORT_TOO_LARGE','Narrow the date range; this report exceeds 500 entries.',409);
      requireCondition(entries.every((e)=>['receipt','opening_balance'].includes(e.kind)),'REPORT_REVIEW','This range includes adjustments/reversals requiring a reviewed export.',409);
      const rows=entries.filter((e)=>e.kind==='receipt').map(receiptView),byChannel={};
      for(const r of rows){const link=await tx.get(db.collection('providerReceiptLinks').doc(documentId(r.receiptId)));
        if(link.exists){r.linkedProviderGrossCentavos=centavos(link.data().grossCentavos);r.linkedBuyerFeeCentavos=centavos(link.data().buyerFeeCentavos);}}
      for(const r of rows){for(const n of ['creditCentavos','unappliedCentavos','grossCentavos','buyerFeeCentavos'])centavos(r[n]);
        requireCondition(addCentavos(r.creditCentavos,r.unappliedCentavos,r.buyerFeeCentavos)===r.grossCentavos,'REPORT_REVIEW','Receipt gross and principal disagree.',409);
        requireCondition(['cash','bank','gcash','maya','paymongo'].includes(r.channel),'REPORT_REVIEW','Collection channel needs review.',409);
        const t=byChannel[r.channel] || {creditCentavos:0,unappliedCentavos:0,grossCentavos:0,buyerFeeCentavos:0};
        for(const k of Object.keys(t))t[k]=addCentavos(t[k],r[k]);byChannel[r.channel]=t; }
      return {asOf:at,...input,rows,byChannel,csv:csv(rows),notice:'Verified receipts only; opening balances, internal deposits and agent payouts are not collections. Provider fees are separate from principal. Recorded-date availability is as of this read.'};
    });
  }
  async function notices(credentials,cursor=null) {
    const who=await identity(auth,credentials);requireCondition(who.mode!=='admin','INVALID_COMMAND','Use customer access.');
    return db.runTransaction(async(tx)=>{
      const o=await owner(tx,db,who,now());
      let q=db.collection('notifications').where('submissionScope','==',o.key).orderBy('createdAt','desc').orderBy(require('firebase-admin/firestore').FieldPath.documentId(),'desc');
      if(cursor){let c;try{if(typeof cursor==='string' && cursor.length<700)c=JSON.parse(Buffer.from(cursor,'base64url').toString());}catch(_){}
        requireCondition(c && c.scope===o.key && Number.isSafeInteger(c.at),'INVALID_CURSOR','Reload updates.');documentId(c.id);q=q.startAfter(c.at,c.id);}
      const docs=(await tx.get(q.limit(21))).docs,rows=[];
      for(const d of docs.slice(0,20)){const n=d.data();let valid=n.ownerBinding===o.binding;
        if(!valid && n.paymentId){const p=await tx.get(db.collection('payments').doc(documentId(n.paymentId)));valid=p.exists && p.data().ownerBinding===o.binding && p.data().bookingId===o.source.canonicalBookingId;}
        if(!valid && n.receiptId){const r=await tx.get(db.collection('receipts').doc(documentId(n.receiptId)));valid=r.exists && r.data().bookingId===o.source.canonicalBookingId;}
        if(valid)rows.push({id:d.id,type:n.type || n.state || 'pending',title:n.title || 'Payment status updated',buyerNote:n.buyerNote || '',createdAt:n.createdAt,receiptId:n.receiptId || null});}
      o.renew();return {rows,nextCursor:docs.length>20?Buffer.from(JSON.stringify({scope:o.key,at:docs[19].data().createdAt,id:docs[19].id})).toString('base64url'):null};
    });
  }
  return {receipt,statement,collections,notices};
}
module.exports={createReportService,receiptView,csv};
