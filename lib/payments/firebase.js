'use strict';

// No initialization at import time: tests never need credentials or a live Firebase project.
function getFirebaseServices(admin = require('firebase-admin'), env = process.env) {
  if (!admin.apps.length) {
    if (!env.FIREBASE_SERVICE_ACCOUNT_B64) throw new Error('Firebase service account is not configured.');
    const account = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(account) });
  }
  // Initialization must happen before auth(), including a fresh function instance.
  return { db: admin.firestore(), auth: admin.auth() };
}

module.exports = { getFirebaseServices };
