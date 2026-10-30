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
    if (operator !== '==') throw new Error('Unsupported test query');
    return new Query(this.db, this.collection, { ...this.options, filter: [field, value] });
  }
  orderBy(field, direction) {
    return new Query(this.db, this.collection, { ...this.options,
      order: [...(this.options.order || []), [field, direction]] });
  }
  startAfter(...cursor) { return new Query(this.db, this.collection, { ...this.options, cursor }); }
  limit(count) { return new Query(this.db, this.collection, { ...this.options, limit: count }); }
  doc(id) { return { path: `${this.collection}/${id}` }; }
}

class MemoryFirestore {
  constructor(seed = {}) {
    this.records = new Map(Object.entries(copy(seed)));
    this.versions = new Map();
    this.beforeCommit = null;
    this.failNextCommit = false;
    this.retries = 0;
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
          const { filter, order = [], cursor, limit = Infinity } = reference.options;
          const compare = (a, b) => {
            for (const [field, direction] of order) {
              const diff = a[field] === b[field] ? 0 : a[field] < b[field] ? -1 : 1;
              if (diff) return direction === 'desc' ? -diff : diff;
            }
            return 0;
          };
          let rows = [...this.records].filter(([path, data]) =>
            path.startsWith(`${reference.collection}/`) && (!filter || data[filter[0]] === filter[1]));
          rows.sort((a, b) => compare(a[1], b[1]));
          if (cursor) {
            const anchor = Object.fromEntries(order.map(([field], index) => [field, cursor[index]]));
            rows = rows.filter(([, data]) => compare(data, anchor) > 0);
          }
          return { docs: rows.slice(0, limit).map(([path]) => read(path)) };
        },
        create: (reference, data) => writes.push(['create', reference.path, copy(data)]),
        update: (reference, data) => writes.push(['update', reference.path, copy(data)])
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
        if (type === 'create' && staged.has(path)) throw new Error('Document already exists');
        if (type === 'update' && !staged.has(path)) throw new Error('Document does not exist');
        staged.set(path, type === 'update' ? { ...staged.get(path), ...data } : data);
      }
      for (const [, path] of writes) this.put(path, staged.get(path));
      return copy(result);
    }
    throw new Error('Transaction retry limit exceeded');
  }
}

module.exports = { MemoryFirestore };
