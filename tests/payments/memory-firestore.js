'use strict';

// Transaction test double: optimistic read-version retries and atomic staged commits.
// This verifies domain behavior, not Firestore rules, indexes or SDK/emulator compatibility.
const copy = (value) => structuredClone(value);
const snapshot = (path, value) => ({ id: path.split('/').pop(), exists: value !== undefined,
  data: () => copy(value) });

class Query {
  constructor(db, collection, options = {}) {
    Object.assign(this, { db, collection, options });
  }
  where(field, operator, value) {
    if (!['==','>=','<=','<','>'].includes(operator)) throw new Error('Unsupported test query');
    return new Query(this.db, this.collection, { ...this.options, filters:[...(this.options.filters || []), [field, operator, value]] });
  }
  orderBy(field, direction) {
    return new Query(this.db, this.collection, { ...this.options,
      order: [...(this.options.order || []), [String(field), direction]] });
  }
  startAfter(...cursor) { return new Query(this.db, this.collection, { ...this.options, cursor }); }
  limit(count) { return new Query(this.db, this.collection, { ...this.options, limit: count }); }
  doc(id = `auto-${++this.db.nextId}`) { return { id, path: `${this.collection}/${id}` }; }
}

class MemoryFirestore {
  constructor(seed = {}) {
    this.records = new Map(Object.entries(copy(seed)));
    this.versions = new Map();
    this.beforeCommit = null;
    this.failNextCommit = false;
    this.retries = 0;
    this.nextId = 0;
  }
  collection(name) { return new Query(this, name); }
  read(path) { return copy(this.records.get(path)); }
  put(path, value) {
    this.records.set(path, copy(value));
    this.versions.set(path, (this.versions.get(path) || 0) + 1);
  }
  count(collection) { return [...this.records.keys()].filter((key) => key.startsWith(`${collection}/`)).length; }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map();
      const writes = [];
      const read = (path) => {
        reads.set(path, this.versions.get(path) || 0);
        return snapshot(path, this.records.get(path));
      };
      const tx = {
        get: async (reference) => {
          if (writes.length) throw new Error('Read after write in transaction');
          if (!(reference instanceof Query)) return read(reference.path);
          const { filters = [], order = [], cursor, limit = Infinity } = reference.options;
          const compare = (a, b) => {
            for (const [field, direction] of order) {
              const diff = a[field] === b[field] ? 0 : a[field] < b[field] ? -1 : 1;
              if (diff) return direction === 'desc' ? -diff : diff;
            }
            return 0;
          };
          let rows = [...this.records].filter(([path, data]) =>
            path.startsWith(`${reference.collection}/`) && path.split('/').length === reference.collection.split('/').length + 1 &&
            filters.every(([field,operator,value])=>({ '==':()=>data[field]===value, '>=':()=>data[field]>=value,
              '<=':()=>data[field]<=value, '<':()=>data[field]<value, '>':()=>data[field]>value })[operator]()));
          const orderedValue = ([path, data]) => ({ ...data, __name__:path.split('/').pop() });
          rows.sort((a, b) => compare(orderedValue(a), orderedValue(b)));
          if (cursor) {
            const anchor = Object.fromEntries(order.map(([field], index) => [field, cursor[index]]));
            rows = rows.filter((row) => compare(orderedValue(row), anchor) > 0);
          }
          return { docs: rows.slice(0, limit).map(([path]) => read(path)) };
        },
        create: (reference, data) => writes.push(['create', reference.path, copy(data)]),
        update: (reference, data) => writes.push(['update', reference.path, copy(data)]),
        set: (reference, data) => writes.push(['set', reference.path, copy(data)]),
        delete: (reference) => writes.push(['delete', reference.path])
      };
      const result = await callback(tx);
      if (this.beforeCommit) {
        const hook = this.beforeCommit;
        this.beforeCommit = null;
        await hook(this);
      }
      if ([...reads].some(([path, version]) => (this.versions.get(path) || 0) !== version)) {
        this.retries++;
        continue;
      }
      if (this.failNextCommit) {
        this.failNextCommit = false;
        throw new Error('Simulated commit failure');
      }
      const staged = new Map(this.records);
      for (const [type, path, data] of writes) {
        if (type === 'delete') { staged.delete(path); continue; }
        if (type === 'create' && staged.has(path)) throw new Error('Document already exists');
        if (type === 'update' && !staged.has(path)) throw new Error('Document does not exist');
        staged.set(path, type === 'update' ? { ...staged.get(path), ...data } : data);
      }
      for (const [, path] of writes) {
        if (staged.has(path)) this.put(path, staged.get(path));
        else { this.records.delete(path); this.versions.set(path,(this.versions.get(path) || 0)+1); }
      }
      return copy(result);
    }
    throw new Error('Transaction retry limit exceeded');
  }
}

module.exports = { MemoryFirestore };
