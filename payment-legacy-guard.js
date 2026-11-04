'use strict';
((root) => {
  const protectedFields = ['canonicalBookingId','paymentMigrationLock','paymentBookingId','paymentOwnershipVersion'];
  const financialFields = ['payments','paymentSubmissions','plan','authUid','agentId','agentCommission','agentCommissionId'];
  const blocked = (data) => data && Object.keys(data).some((k) => protectedFields.includes(k.split('.')[0]));
  const assertLegacy = (data) => { if (blocked(data)) throw Error('This record uses protected payment processing. Open Payment operations; legacy edits are blocked.'); };
  const id = (value) => { if (typeof value !== 'string' || !value || /[\/\\]/.test(value)) throw Error('Invalid record identity.');return value; };

  function createGuard({db,currentUser}) {
    const ref = (collection,key) => db.collection(collection).doc(id(key));
    async function role(tx,adminOnly = false) {
      const uid = currentUser()?.uid;if (!uid) throw Error('Please sign in again.');
      const row = await tx.get(ref('users',uid));
      if (!row.exists || row.data().disabled === true || !(adminOnly ? ['admin','superadmin'] : ['staff','admin','superadmin']).includes(row.data().role)) throw Error('Only an admin may change payment or ownership records.');
    }
    async function read(tx,collection,key) {
      if (!['customers','presaleApplications','plots'].includes(collection)) throw Error('Unsupported legacy payment record.');
      const row = await tx.get(ref(collection,key));
      if (row.exists) assertLegacy(row.data());
      if (collection === 'plots' && row.exists) {
        const p = row.data();
        for (const [col,sourceId] of [['customers',p.customerId],['presaleApplications',p.presaleRef]]) {
          if (sourceId) {const source = await tx.get(ref(col,sourceId));if (!source.exists) throw Error('Plot owner needs office review.');assertLegacy(source.data());}
        }
      }
      return row;
    }
    async function update(collection,key,patch,{ownerSubmission = false} = {}) {
      assertLegacy(patch);
      return db.runTransaction(async(tx) => {
        const row = await read(tx,collection,key);if (!row.exists) throw Error('Record no longer exists.');
        if (ownerSubmission) {
          const uid = currentUser()?.uid;
          if (!uid || collection !== 'customers' || Object.keys(patch).some((k) => k !== 'paymentSubmissions') || row.data().authUid !== uid) throw Error('You cannot submit for this account.');
        } else await role(tx,Object.keys(patch).some((k) => financialFields.includes(k.split('.')[0])) || ['paid','cancelled','released'].includes(patch.status));
        const change = {...patch};
        if (collection === 'presaleApplications' && ['email','mobile','mobileKey'].some((k) => Object.hasOwn(patch,k) && patch[k] !== row.data()[k])) {
          const version = row.data().accessVersion;
          if (version !== undefined) {
            if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) throw Error('Contact access version needs office review.');
            change.accessVersion = version + 1;
          }
        }
        if (Object.keys(patch).some((k) => k.split('.')[0] === 'accessVersion')) throw Error('Access versions are managed with verified contact changes.');
        tx.update(ref(collection,key),change);
      });
    }
    async function setPlot(key,data) {
      assertLegacy(data);
      return db.runTransaction(async(tx) => {
        await role(tx,true);const row = await read(tx,'plots',key);
        if (row.exists) throw Error('This plot already has a record. Reconcile its assignment before replacing it.');
        for (const [col,sourceId] of [['customers',data.customerId],['presaleApplications',data.presaleRef]]) {
          if (sourceId) {const source = await read(tx,col,sourceId);if (!source.exists) throw Error('Plot owner is missing.');}
        }
        tx.set(ref('plots',key),data);
      });
    }
    async function removePlot(key) {
      return db.runTransaction(async(tx) => {await role(tx,true);const row = await read(tx,'plots',key);if (!row.exists) throw Error('Plot no longer exists.');tx.delete(ref('plots',key));});
    }
    async function updatePresaleWithPlots(key,patch,mode) {
      assertLegacy(patch);
      if (!['release_hold','cancel'].includes(mode)) throw Error('Unsupported legacy plot action.');
      return db.runTransaction(async(tx) => {
        await role(tx,true);const source = await read(tx,'presaleApplications',key);
        if (!source.exists) throw Error('Reservation no longer exists.');
        const data = source.data(), items = Array.isArray(data.plots) && data.plots.length ? data.plots : [{blockId:data.blockId,lotNo:data.lotNo}];
        if (items.length > 100) throw Error('Plot list needs office review.');
        const keys = items.map(p=>id(`${p.blockId}_${p.lotNo}`));
        if (new Set(keys).size !== keys.length) throw Error('Plot list needs office review.');
        for (const plotId of keys) {
          const row = await read(tx,'plots',plotId);
          if (!row.exists || row.data().presaleRef !== key || row.data().customerId) throw Error('Plot assignment changed. No reservation or plot was changed.');
        }
        tx.update(ref('presaleApplications',key),patch);
        for (const plotId of keys) {
          if (mode === 'cancel') tx.delete(ref('plots',plotId));
          else tx.update(ref('plots',plotId),{hold:false});
        }
      });
    }
    async function attachCommission(key,data,patch) {
      assertLegacy(patch);const commission = db.collection('agentCommissions').doc();
      return db.runTransaction(async(tx) => {
        await role(tx,true);const source = await read(tx,'presaleApplications',key);
        if (!source.exists) throw Error('Reservation no longer exists.');
        tx.set(commission,data);tx.update(ref('presaleApplications',key),{...patch,agentCommissionId:commission.id});
      });
    }
    async function assertCurrent(collection,key) {
      return db.runTransaction(async(tx) => {await role(tx,true);const row = await read(tx,collection,key);if (!row.exists) throw Error('Record no longer exists.');});
    }
    // Financial trash restore cannot prove absence of a deleted canonical binding. Use a reviewed server restore instead.
    function assertTrashCollection(collection) {
      if (!['inquiries'].includes(collection)) throw Error('Customer and payment records require a reviewed backup/restore process; legacy trash actions are disabled.');
    }
    return {update,setPlot,removePlot,updatePresaleWithPlots,attachCommission,assertCurrent,assertLegacy,read,role,assertTrashCollection};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createGuard,assertLegacy};
  if (root) root.paymentLegacyGuard = createGuard({db:root.db,currentUser:() => root.auth?.currentUser});
})(typeof window === 'undefined' ? null : window);
