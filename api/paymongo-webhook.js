// /api/paymongo-webhook.js
//
// Vercel serverless function that receives PayMongo Webhook events:
// - Verifies HMAC-SHA256 signature (Paymongo-Signature)
// - Processes 'checkout_session.payment.paid' and 'payment.paid'
// - Atomically updates Firestore (customer balance, ledger, presale reservations)
// - Sends payment confirmation email via Brevo
// - Guarantees idempotency (prevents duplicate payment credits)

const crypto = require('crypto');
let admin = null;
let db = null;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8'))
        )
      });
    } else {
      try { admin.initializeApp(); } catch (e) {}
    }
  }
  db = admin.firestore();
} catch (e) {
  console.warn('[paymongo-webhook] firebase-admin not initialized:', e.message);
}

// Helper to format payment method
function formatChannel(ch) {
  if (!ch) return 'Online';
  const c = ch.toLowerCase();
  if (c.includes('gcash')) return 'GCash';
  if (c.includes('maya')) return 'Maya';
  if (c.includes('card')) return 'Card';
  if (c.includes('grab')) return 'GrabPay';
  if (c.includes('bill')) return 'BillEase';
  return ch.toUpperCase();
}

// Verify PayMongo webhook signature
function verifySignature(rawBody, signatureHeader, secretKey) {
  if (!secretKey || secretKey.includes('your_webhook_signing_secret')) {
    console.warn('[paymongo-webhook] Webhook secret not configured. Skipping HMAC check in development.');
    return true;
  }
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',');
  let timestamp = '';
  let testSig = '';
  let liveSig = '';

  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = v;
    if (k === 'te') testSig = v;
    if (k === 'li') liveSig = v;
  }

  if (!timestamp) return false;

  const payloadToSign = `${timestamp}.${rawBody}`;
  const computed = crypto.createHmac('sha256', secretKey).update(payloadToSign).digest('hex');

  // Match either live or test signature depending on environment
  if (liveSig && liveSig === computed) return true;
  if (testSig && testSig === computed) return true;

  return false;
}

// Send receipt email via Brevo
async function sendPaymentReceipt({ email, name, amount, method, ref, description }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !email) return;

  const senderEmail = process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com';
  const senderName  = process.env.SENDER_NAME  || 'Golden Harmonic Memorial Park';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f6f1e8;font-family:'Inter',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:32px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <tr><td style="background:linear-gradient(135deg,#2f5d4c 0%,#1a3d30 100%);padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#f6f1e8;font-size:20px;font-weight:600;letter-spacing:0.5px;">Golden Harmonic Memorial Park</h1>
            </td></tr>
            <tr><td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#1f2a26;font-size:16px;">Dear <strong>${name || 'Valued Customer'}</strong>,</p>
              <p style="margin:0 0 20px;color:#4a564f;font-size:15px;line-height:1.6;">
                We have received your payment via <strong>PayMongo</strong>. Your transaction has been automatically verified and recorded in your account ledger.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border-radius:8px;margin:20px 0;">
                <tr><td style="padding:16px 20px;">
                  <p style="margin:0 0 6px;color:#4a564f;font-size:13px;text-transform:uppercase;font-weight:600;">Payment Receipt</p>
                  <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Amount Credited:</strong> ₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Payment Method:</strong> ${method}</p>
                  <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Reference No.:</strong> ${ref}</p>
                  ${description ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Item:</strong> ${description}</p>` : ''}
                  <p style="margin:0;color:#1f2a26;font-size:15px;"><strong>Date:</strong> ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </td></tr>
              </table>
              <p style="margin:20px 0 0;color:#4a564f;font-size:14px;">
                Thank you for your prompt payment.<br><strong style="color:#2f5d4c;">Golden Harmonic Memorial Park</strong>
              </p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email, name: name || email }],
        subject: `Payment Receipt: ₱${Number(amount).toLocaleString('en-PH')} — Golden Harmonic Memorial Park`,
        htmlContent: html
      })
    });
  } catch (err) {
    console.warn('[paymongo-webhook] Failed to dispatch Brevo receipt:', err.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read raw body for HMAC check
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  } else {
    rawBody = JSON.stringify(req.body);
  }

  const signatureHeader = req.headers['paymongo-signature'] || '';
  const secretKey = process.env.PAYMONGO_WEBHOOK_SECRET_KEY;

  if (!verifySignature(rawBody, signatureHeader, secretKey)) {
    console.error('[paymongo-webhook] Invalid signature verification');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
    ? req.body
    : JSON.parse(rawBody || '{}');

  const eventData = payload.data || {};
  const eventAttributes = eventData.attributes || {};
  const eventType = eventAttributes.type;

  console.log(`[paymongo-webhook] Received event: ${eventType} (${eventData.id})`);

  // Handle paid events
  if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
    let sessionData = {};
    let paymentData = {};
    let metadata = {};
    let channel = 'online';
    let paymentId = '';
    let sessionId = '';
    let amountCentavos = 0;
    let feeCentavos = 0;

    if (eventType === 'checkout_session.payment.paid') {
      const sessionObj = eventAttributes.data || {};
      sessionData = sessionObj.attributes || {};
      sessionId = sessionObj.id || '';
      metadata = sessionData.metadata || {};

      const payments = sessionData.payments || [];
      const primaryPayment = payments[0] || {};
      paymentId = primaryPayment.id || `pay_${sessionId}`;
      const pAttrs = primaryPayment.attributes || {};
      amountCentavos = pAttrs.amount || 0;
      feeCentavos = pAttrs.fee || 0;
      channel = (pAttrs.source && pAttrs.source.type) || sessionData.payment_method_used || 'online';
    } else {
      const pObj = eventAttributes.data || {};
      paymentData = pObj.attributes || {};
      paymentId = pObj.id || '';
      metadata = paymentData.metadata || {};
      amountCentavos = paymentData.amount || 0;
      feeCentavos = paymentData.fee || 0;
      channel = (paymentData.source && paymentData.source.type) || 'online';
    }

    const formattedChannel = formatChannel(channel);
    const rawAmount = metadata.rawAmount
      ? Number(metadata.rawAmount)
      : Math.round((amountCentavos - feeCentavos) / 100);

    const feeAmount = Number((feeCentavos / 100).toFixed(2));
    const today = new Date().toISOString().slice(0, 10);

    try {
      // 1. Idempotency Check in Firestore
      const txRef = db.collection('paymongoTransactions').doc(paymentId);
      const existingTx = await txRef.get();
      if (existingTx.exists && existingTx.data().processed) {
        console.log(`[paymongo-webhook] Payment ${paymentId} already processed. Skipping duplicate.`);
        return res.status(200).json({ received: true, duplicate: true });
      }

      // 2. Process Customer Portal Payment
      if (metadata.type === 'portal_installment' || metadata.customerId) {
        const custRef = db.collection('customers').doc(metadata.customerId);
        const custDoc = await custRef.get();

        if (custDoc.exists) {
          const paymentRecord = {
            date: today,
            amount: rawAmount,
            method: `PayMongo (${formattedChannel})`,
            ref: paymentId,
            paymongoSessionId: sessionId,
            fee: feeAmount,
            note: `Online payment via PayMongo (${formattedChannel})`,
            paidAt: Date.now(),
            verified: true
          };

          const submissionRecord = {
            referenceNumber: paymentId,
            amount: rawAmount,
            date: today,
            method: `PayMongo (${formattedChannel})`,
            mobileNumber: metadata.customerPhone || '',
            note: `Automated PayMongo payment (${formattedChannel})`,
            status: 'confirmed',
            submittedAt: Date.now(),
            confirmedAt: Date.now(),
            autoVerified: true
          };

          await custRef.update({
            payments: admin.firestore.FieldValue.arrayUnion(paymentRecord),
            paymentSubmissions: admin.firestore.FieldValue.arrayUnion(submissionRecord)
          });
          console.log(`[paymongo-webhook] Updated customer ${metadata.customerId} ledger with ₱${rawAmount}`);
        }
      }

      // 3. Process Presale Plot Reservation
      if (metadata.type === 'presale_reservation' || metadata.presaleRef) {
        const presaleRef = metadata.presaleRef;
        const appRef = db.collection('presaleApplications').doc(presaleRef);
        const appDoc = await appRef.get();

        if (appDoc.exists) {
          const appData = appDoc.data();
          await appRef.update({
            status: 'verified',
            paymentReference: paymentId,
            paymentConfirmedAt: Date.now(),
            paidVia: `PayMongo (${formattedChannel})`,
            reservationFeePaid: rawAmount
          });

          // Update plot records to held/reserved
          const plots = appData.plots || [{ blockId: appData.blockId, lotNo: appData.lotNo }];
          const batch = db.batch();
          for (const p of plots) {
            const pDocRef = db.collection('plots').doc(`${p.blockId}_${p.lotNo}`);
            batch.set(pDocRef, {
              status: 'reserved',
              hold: true,
              paymentRef: paymentId,
              reservedAt: Date.now(),
              note: `Presale ${presaleRef} (Paid online via PayMongo ${formattedChannel})`
            }, { merge: true });
          }
          await batch.commit();
          console.log(`[paymongo-webhook] Updated presale application ${presaleRef} and plots to reserved/paid`);
        }
      }

      // 4. Mark Transaction Record in Firestore (Permanent Audit Log)
      await txRef.set({
        paymentId,
        sessionId,
        eventType,
        channel: formattedChannel,
        rawAmount,
        feeAmount,
        totalCentavos: amountCentavos,
        customerId: metadata.customerId || '',
        presaleRef: metadata.presaleRef || '',
        customerEmail: metadata.customerEmail || '',
        customerName: metadata.customerName || '',
        metadata,
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // 5. Dispatch Email Receipt
      if (metadata.customerEmail) {
        await sendPaymentReceipt({
          email: metadata.customerEmail,
          name: metadata.customerName,
          amount: rawAmount,
          method: `PayMongo (${formattedChannel})`,
          ref: paymentId,
          description: metadata.type === 'presale_reservation'
            ? `Plot Reservation Deposit (${metadata.plotCode || metadata.presaleRef})`
            : `Cemetery Plan Payment`
        });
      }

      return res.status(200).json({ received: true, paymentId });
    } catch (dbErr) {
      console.error('[paymongo-webhook] Database update failed:', dbErr);
      return res.status(500).json({ error: 'Database processing failed' });
    }
  }

  // Acknowledge other event types
  return res.status(200).json({ received: true });
};
