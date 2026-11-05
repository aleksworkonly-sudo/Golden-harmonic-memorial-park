'use strict';

const { createHash, createHmac } = require('node:crypto');
const { configuration } = require('./access-http');
const { requireCondition } = require('./errors');
const { scopeKey, MAX_BUDGET } = require('./submission');
const { pesosToCentavos, depositForPlots } = require('./money');
const { manilaDate, reservationDeadline } = require('./calendar');
const { reserveReference } = require('./presale-reference');
const { receivingQr } = require('./receiving-qr');

const CREATION_MS = 30 * 60 * 1000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
function enabled(env) {
  return configuration(env).enabled && env.PAYMENT_PRESALE_ENABLED === 'true' &&
    env.PAYMENT_SUBMISSIONS_ENABLED === 'true' && env.PAYMENT_REVIEW_ENABLED === 'true';
}

function createPresalePaymentService({ db, env = process.env, now = () => Date.now(), qrAssets }) {
  const doc = (collection, id) => db.collection(collection).doc(id);
  async function receiving(tx, channel) {
    const id = env[`PAYMENT_PRESALE_${channel.toUpperCase()}_ACCOUNT_ID`];
    if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    const row = await tx.get(doc('paymentReceivingAccounts', id));
    const account = row.exists ? row.data() : null;
    const qr = receivingQr(account, qrAssets, id);
    if (!account || account.enabled !== true || account.presaleEnabled !== true ||
        account.channel !== channel || !qr || !Number.isSafeInteger(account.version) || account.version < 1 ||
        !['label','accountName','accountNumber','instructions'].every((k) => typeof account[k] === 'string' && account[k].length <= 500)) return null;
    return { ...account, id, qr };
  }
  async function availability() {
    if (!enabled(env)) return { gcash:false, maya:false };
    return db.runTransaction(async (tx) => {
      const gcash = await receiving(tx, 'gcash'), maya = await receiving(tx, 'maya');
      const budget = await tx.get(doc('paymentProofBudget', 'manual'));
      const ready = budget.exists && Number.isSafeInteger(budget.data().usedBytes) && budget.data().usedBytes >= 0 &&
        Number.isSafeInteger(budget.data().limitBytes) && budget.data().limitBytes <= MAX_BUDGET &&
        budget.data().limitBytes - budget.data().usedBytes >= 420 * 1024;
      return { gcash:!!gcash && ready, maya:!!maya && ready };
    });
  }
  async function reserve(input, requester = 'unavailable') {
    requireCondition(enabled(env), 'PRESALE_PAYMENT_UNAVAILABLE', 'QR payments are not available yet. Please contact the office or choose another method.', 503);
    requireCondition(['gcash','maya'].includes(input.method) && /^[a-f0-9]{64}$/.test(input.requestId || ''),
      'INVALID_REQUEST', 'Reload the reservation form before continuing.');
    const operationId = hash(input.requestId);
    // A secret capability held only by the submitting tab, never a mobile/email lookup.
    const secret = createHmac('sha256', env.PAYMENT_ACCESS_RATE_SECRET).update(`presale-creation:${input.requestId}`).digest('base64url');
    const sessionRef = doc('reservationSessions', hash(secret));
    const operationRef = doc('presalePaymentRequests', operationId);
    const { requestId, plots, total, monthly:quotedMonthly, spot, listPrice, ...details } = input;
    const monthly=input.plan==='installment'?Math.floor((pesosToCentavos(total)-depositForPlots(plots.length))/(input.years*12))/100:0;
    const bodyHash = hash(JSON.stringify({ ...details, plots:plots.map((p) => [p.blockId,p.lotNo]) }));
    const at = now();
    return db.runTransaction(async (tx) => {
      const previous = await tx.get(operationRef);
      if (previous.exists) {
        const old = previous.data();
        requireCondition(old.bodyHash === bodyHash, 'IDEMPOTENCY_CONFLICT', 'Your earlier reservation request has different details. Recover it before making another.', 409);
        const session = await tx.get(sessionRef), source = await tx.get(doc('presaleApplications', old.result.ref));
        requireCondition(session.exists && session.data().revokedAt === null && session.data().expiresAt > at &&
          source.exists && source.data().accessVersion === 1 && source.data().canonicalBookingId === old.bookingId &&
          session.data().contactFingerprint === hash(JSON.stringify([source.data().email.trim().toLowerCase(),source.data().mobileKey,1])),
        'RESERVATION_RECOVERY_REQUIRED', 'This reservation was already saved. Open My payments using an email verification link; do not reserve again.', 409);
        return { ...old.result, secret, maxAge:Math.floor((session.data().expiresAt-at)/1000), duplicate:true };
      }
      const account = await receiving(tx, input.method);
      requireCondition(account, 'QR_UNAVAILABLE', 'A verified receiving QR is not available for this method. No reservation was created.', 503);
      requireCondition(input.plan !== 'installment' || input.customMonthly === 0 ||
        (input.customMonthly >= monthly && input.customMonthly <= total),
      'INVALID_MONTHLY','Your own monthly amount must be at least the displayed installment and no more than the total.');
      const limitId = createHmac('sha256',env.PAYMENT_ACCESS_RATE_SECRET).update(`presale-holds:${requester}`).digest('hex');
      const limitRef = doc('presaleHoldLimits',limitId), limitRow = await tx.get(limitRef);
      const day = manilaDate(at);
      const count = limitRow.exists && limitRow.data().day === day ? limitRow.data().count : 0;
      requireCondition(Number.isSafeInteger(count) && count >= 0 && count < 5,
        'RESERVATION_LIMIT', 'The daily reservation limit was reached. Please contact the office.', 429);
      const fallback = {regular:30000,premium:42500,'corner-premium':47500};
      const types = [...new Set(plots.map((p)=>p.typeId))];
      const prices = await Promise.all(types.map((id)=>tx.get(doc('products',id))));
      requireCondition(plots.every((p)=>{
        const row = prices[types.indexOf(p.typeId)];
        const stored = row.exists ? Number(row.data().price) : 0;
        return p.price === (stored > 0 ? stored : fallback[p.typeId]);
      }), 'PRICE_CHANGED', 'Plot prices changed. Refresh the plan before reserving.', 409);
      const budget = await tx.get(doc('paymentProofBudget', 'manual'));
      requireCondition(budget.exists && Number.isSafeInteger(budget.data().usedBytes) && budget.data().usedBytes >= 0 &&
        Number.isSafeInteger(budget.data().limitBytes) && budget.data().limitBytes <= MAX_BUDGET && budget.data().limitBytes-budget.data().usedBytes >= 420*1024,
      'STORAGE_UNAVAILABLE', 'Private proof storage is unavailable. Please contact the office.', 503);
      const counter = await tx.get(doc('counters','presale'));
      const plotRows = await Promise.all(plots.map((p) => tx.get(doc('plots',`${p.blockId}_${p.lotNo}`))));
      requireCondition(plotRows.every((r) => !r.exists), 'PLOT_TAKEN', 'A selected plot is no longer available. Refresh the plot selection.', 409);
      const duplicates = await tx.get(db.collection('presaleApplications').where('mobileKey','==',input.mobileKey));
      requireCondition(!duplicates.docs.some((r) => r.data().status !== 'cancelled'), 'EXISTING_RESERVATION',
        'This mobile number already has a reservation. Use My payments or contact the office.', 409);
      const reserved = await reserveReference(tx, db, counter);
      const ref = reserved.id, bookingId = `PRESALE-${ref}`, openingBalanceId = `OPEN-${bookingId}`;
      const totalCentavos = pesosToCentavos(total), deposit = depositForPlots(plots.length);
      requireCondition(totalCentavos >= deposit, 'INVALID_AMOUNT', 'The contract amount needs office review.');
      // Allocate the exact server-calculated total, including its rounding remainder.
      const bases = plots.map((p) => pesosToCentavos(p.contractBase));
      const baseTotal = bases.reduce((n,v) => n + BigInt(v),0n);
      let remainder = totalCentavos;
      const items = plots.map((p,i) => {
        const amount = i === plots.length-1 ? remainder : Number(BigInt(totalCentavos)*BigInt(bases[i])/baseTotal);
        remainder -= amount;
        return { itemId:`item-${i+1}`,plotId:`${p.blockId}_${p.lotNo}`,ownershipVersion:1,totalCentavos:amount,creditCentavos:0 };
      });
      const deadlineDate = reservationDeadline(at), key = scopeKey('presale',ref), first = plots[0];
      const source = { ...details, ref, status:'new', accessVersion:1, canonicalBookingId:bookingId,
        paymentMigrationLock:'canonical', createdAt:at,
        blockId:first.blockId,lotNo:first.lotNo,plotCode:first.plotCode,typeId:first.typeId,
        plots:plots.map(({contractBase,...p})=>p),plotCount:plots.length,totalPrice:total,monthly,spotPrice:spot,listPrice,
        depositPerPlotCentavos:300000,installmentCalculation:'remaining_after_deposit_v1',
        paymentReference:'',paymentConfirmedAt:null,firstPaymentDeadlineDate:deadlineDate };
      const booking = { schemaVersion:4,sourceKind:'presale',sourceId:ref,ownerBinding:'reservation:1',
        migrationStatus:'reconciled',legacyWritesBlocked:true,postingEnabled:true,policyStatus:'approved',status:'active',currency:'PHP',
        version:1,termsVersion:1,totalCentavos,netCreditCentavos:0,balanceCentavos:totalCentavos,unappliedCentavos:0,items,
        openingBalanceId,openingCreditCentavos:0,planLabel:input.plan==='cash'?'Spot cash':`${input.years}-year installment plan`,
        monthlyCentavos:null,deadlineDate,nextDueDate:null,lifecycleEnabled:true,
        lifecycleTerms:{version:1,bookingTermsVersion:1,reservationVerified:true,reservedAt:at,plan:input.plan==='cash'?'spot_cash':'installment',termMonths:input.years*12,
          depositPerPlotCentavos:300000,installmentCalculation:'remaining_after_deposit_v1'},
        notificationContact:{enabled:false},provisionedAt:at,provisioning:'new-presale-deposit-v1' };
      const result = { ok:true,ref,plotCode:first.plotCode,typeId:first.typeId,plots:source.plots,plan:input.plan,years:input.years,
        method:input.method,total,monthly,spot,paymentFlow:'manual_qr',deadlineDate,depositCentavos:deposit };
      tx.set(doc('counters','presale'),{n:reserved.number});
      tx.set(limitRef,{day,count:count+1});
      tx.create(reserved.reference,source);
      items.forEach((item,i) => tx.create(doc('plots',item.plotId),{
        blockId:plots[i].blockId,lotNo:plots[i].lotNo,customerId:'',status:'reserved',hold:true,presaleRef:ref,
        paymentBookingId:bookingId,paymentOwnershipVersion:1,paymentMigrationLock:'canonical',createdAt:at,createdBy:'presale-web'
      }));
      tx.create(doc('bookings',bookingId),booking);
      tx.create(doc('ledgerEntries',openingBalanceId),{bookingId,receiptId:openingBalanceId,recordedAt:at,receivedDate:manilaDate(at),
        kind:'opening_balance',contractCreditCentavos:0,allocations:[],currency:'PHP'});
      tx.create(doc('paymentSubmissionScopes',key),{enabled:true,version:1,sourceKind:'presale',sourceId:ref,bookingId,
        openCases:0,day:manilaDate(at),dayCount:0,qrRequired:true,payerDetailsRequired:true,
        offers:[{id:'deposit',purpose:'deposit',expectedAmountCentavos:deposit,receivingAccountId:account.id,receivingAccountVersion:account.version}]});
      tx.create(sessionRef,{ref,accessVersion:1,contactFingerprint:hash(JSON.stringify([input.email.trim().toLowerCase(),input.mobileKey,1])),
        createdAt:at,expiresAt:at+CREATION_MS,idleExpiresAt:at+CREATION_MS,revokedAt:null,issuanceKind:'presale_creation'});
      tx.create(operationRef,{bodyHash,bookingId,result,createdAt:at});
      tx.create(doc('auditLogs',`presale_${ref}`),{action:'presale_reserved',sourceId:ref,bookingId,createdAt:at,actor:'presale-web'});
      return {...result,secret,maxAge:CREATION_MS/1000};
    });
  }
  return {availability,reserve};
}

module.exports = {createPresalePaymentService,CREATION_MS};
