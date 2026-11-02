'use strict';

// Portable JSON rehearsal only: no Firebase initialization, credentials or network.
const { createHash } = require('node:crypto');
const { requireCondition } = require('./errors');
const { timestamp } = require('./calendar');
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENTS = 5000;

function canonicalJSON(value, depth = 0) {
  requireCondition(depth <= 40, 'SNAPSHOT_INVALID', 'Snapshot nesting exceeds the supported limit.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireCondition(Number.isFinite(value), 'SNAPSHOT_INVALID', 'Use finite JSON numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalJSON(v, depth + 1)).join(',') + ']';
  requireCondition(value && Object.getPrototypeOf(value) === Object.prototype,
    'SNAPSHOT_INVALID', 'Use plain JSON; convert Firestore timestamps and references explicitly.');
  return '{' + Object.keys(value).sort().map((key) => {
    requireCondition(!['__proto__', 'constructor', 'prototype'].includes(key), 'SNAPSHOT_INVALID', 'Unsupported JSON key.');
    return JSON.stringify(key) + ':' + canonicalJSON(value[key], depth + 1);
  }).join(',') + '}';
}

const digest = (value) => createHash('sha256').update(canonicalJSON(value)).digest('hex');

function documentPath(path) {
  requireCondition(typeof path === 'string' && path.length <= 1500, 'SNAPSHOT_INVALID', 'Invalid document path.');
  const parts = path.split('/');
  requireCondition(parts.length >= 2 && parts.length % 2 === 0 && parts.every((p) =>
    p && p !== '.' && p !== '..' && !/[\\\x00-\x1f]/.test(p)), 'SNAPSHOT_INVALID', 'Use relative Firestore document paths.');
  return path;
}

function validateSnapshot(input) {
  requireCondition(input?.schemaVersion === 1 && Array.isArray(input.documents) && input.documents.length <= MAX_DOCUMENTS,
    'SNAPSHOT_INVALID', 'Use a version-1 portable snapshot with at most 5000 documents.');
  timestamp(input.capturedAt);
  requireCondition(Buffer.byteLength(canonicalJSON(input)) <= MAX_BYTES, 'SNAPSHOT_TOO_LARGE', 'Snapshot exceeds 16 MiB.');
  const seen = new Set();
  for (const row of input.documents) {
    documentPath(row.path);
    requireCondition(!seen.has(row.path) && row.data && !Array.isArray(row.data) && typeof row.data === 'object',
      'SNAPSHOT_INVALID', 'Duplicate path or invalid document data.');
    seen.add(row.path);
  }
  return { schemaVersion:1, capturedAt:input.capturedAt,
    documents:structuredClone(input.documents).sort((a,b) => a.path.localeCompare(b.path, 'en')) };
}

function sealSnapshot(input) {
  const snapshot = validateSnapshot(input);
  const manifest = snapshot.documents.map(({path,data}) => ({path,sha256:digest(data)}));
  return { format:'payment-rehearsal-backup-v1', snapshot, manifest, sha256:digest({snapshot,manifest}) };
}

function verifyBackup(backup) {
  requireCondition(backup?.format === 'payment-rehearsal-backup-v1', 'BACKUP_INVALID', 'Unsupported backup format.');
  const expected = sealSnapshot(backup.snapshot);
  requireCondition(digest(backup.manifest) === digest(expected.manifest) && backup.sha256 === expected.sha256,
    'BACKUP_INTEGRITY', 'Snapshot or manifest changed; do not restore.');
  return expected.snapshot;
}

function restoreRehearsal(backup, target) {
  const saved = verifyBackup(backup), current = validateSnapshot(target);
  const expected = new Map(saved.documents.map((r) => [r.path,digest(r.data)]));
  // A newer payment, partial state or an extra document must never be deleted by rollback.
  for (const row of current.documents) requireCondition(expected.get(row.path) === digest(row.data),
    'RESTORE_CONFLICT', 'Target contains changed/new records. Preserve it and reconcile forward; do not overwrite.');
  requireCondition(current.documents.length === 0 || current.documents.length === saved.documents.length,
    'RESTORE_CONFLICT', 'Use an empty isolated target or an identical restored snapshot.');
  return structuredClone(saved);
}

module.exports = { MAX_BYTES, MAX_DOCUMENTS, canonicalJSON, digest, documentPath, validateSnapshot, sealSnapshot, verifyBackup, restoreRehearsal };
