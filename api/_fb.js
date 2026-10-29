// Shared Firebase Admin helpers for the cash-receipt endpoints.
const admin = require('firebase-admin');
function getDb() {
  if (!admin.apps.length) {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not set in environment variables');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  }
  return admin.firestore();
}
// Returns { uid, email, name, role } for a Firebase idToken, or throws {status,message}.
async function staffFromToken(idToken, db) {
  let dec;
  try { dec = await admin.auth().verifyIdToken(String(idToken || '')); }
  catch (e) { const err = new Error('Please log in again.'); err.status = 401; throw err; }
  const u = await db.collection('users').doc(dec.uid).get();
  const d = u.exists ? u.data() : null;
  if (!d || !['staff', 'admin', 'superadmin'].includes(d.role)) { const err = new Error('Only staff can do this.'); err.status = 403; throw err; }
  return { uid: dec.uid, email: d.email || dec.email || '', name: d.name || d.displayName || d.email || dec.email || 'Staff', role: d.role };
}
async function uidFromToken(idToken) {
  try { return (await admin.auth().verifyIdToken(String(idToken || ''))).uid; }
  catch (e) { const err = new Error('Please log in again.'); err.status = 401; throw err; }
}
const parseBody = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}));
module.exports = { getDb, staffFromToken, uidFromToken, parseBody };
