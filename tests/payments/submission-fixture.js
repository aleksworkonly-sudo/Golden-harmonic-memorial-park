'use strict';

const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { MemoryFirestore } = require('./memory-firestore');
const { createSubmissionService, scopeKey, MAX_BUDGET } = require('../../lib/payments/submission');

function fixture() {
  const time = Date.parse('2026-10-31T04:00:00Z');
  const key = scopeKey('customer','c1');
  const guestKey = scopeKey('presale','PS-0001');
  const secret = 'p'.repeat(43);
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const terms = { enabled:true, version:1, openCases:0, day:'2026-10-31', dayCount:0,
    offers:[{ id:'deposit',purpose:'deposit',expectedAmountCentavos:500000,receivingAccountId:'demo-bank',receivingAccountVersion:1 }] };
  const db = new MemoryFirestore({
    'customers/c1':{authUid:'buyer',status:'active',payments:[],plan:{totalPrice:27500}},
    'customers/c2':{authUid:'buyer',status:'active',payments:[],plan:{totalPrice:40000}},
    'presaleApplications/PS-0001':{email:'buyer@example.test',accessVersion:1,status:'new',payments:[],totalPrice:27500},
    [`reservationSessions/${hash(secret)}`]:{ref:'PS-0001',accessVersion:1,contactFingerprint:hash(JSON.stringify(['buyer@example.test','',1])),
      createdAt:time,expiresAt:time+28800000,idleExpiresAt:time+1800000,revokedAt:null},
    [`paymentSubmissionScopes/${key}`]:{...terms,sourceKind:'customer',sourceId:'c1'},
    [`paymentSubmissionScopes/${scopeKey('customer','c2')}`]:{...terms,sourceKind:'customer',sourceId:'c2'},
    [`paymentSubmissionScopes/${guestKey}`]:{...terms,sourceKind:'presale',sourceId:'PS-0001'},
    'paymentReceivingAccounts/demo-bank':{enabled:true,version:1,channel:'bank',label:'Demo bank — sample only',accountName:'SAMPLE RECIPIENT',accountNumber:'DEMO-ACCOUNT',instructions:'Local preview only. Do not transfer money using these sample details.'},
    'paymentProofBudget/manual':{usedBytes:0,limitBytes:MAX_BUDGET}
  });
  const auth = { verifyIdToken:async (token,checkRevoked) => {
    if (checkRevoked !== true) throw new Error('Revocation check required');
    if (token === 'revoked') throw Object.assign(new Error('Revoked'),{code:'auth/id-token-revoked'});
    return {uid:token};
  } };
  const core = createSubmissionService({db,auth,now:() => time});
  const account = {mode:'account',idToken:'buyer',customerId:'c1'};
  const guest = {mode:'reservation',secret};
  const command = async (overrides = {}) => ({requestId:'request-0000000001',offerId:'deposit',scopeVersion:1,
    claimedCentavos:500000,transferDate:'2026-10-30',reference:'000REF-AbC',
    image:(await sharp({create:{width:300,height:200,channels:3,background:'#e8ebda'}}).png().toBuffer()).toString('base64'),...overrides});
  return {db,auth,core,account,guest,key,guestKey,time,command};
}
module.exports = {fixture};
