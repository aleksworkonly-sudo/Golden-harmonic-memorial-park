// /api/paymongo-checkout.js
//
// Vercel serverless function that initializes a PayMongo Checkout Session
// for Golden Harmonic Memorial Park payments:
//  1. Customer Portal: Monthly installments & balance paydowns
//  2. Presale Flow: Plot reservation deposit (₱5,000 per plot)
//
// Required env var: PAYMONGO_SECRET_KEY
// Optional env var: NEXT_PUBLIC_APP_URL

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey || secretKey.includes('your_paymongo_secret_key')) {
    return res.status(500).json({
      error: 'PayMongo secret key is not configured. Please add PAYMONGO_SECRET_KEY in your environment.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      type = 'portal_installment', // 'portal_installment' | 'presale_reservation' | 'custom'
      amount,                       // amount in PHP (e.g. 5000 or 2500)
      description,
      customerId = '',
      customerEmail = '',
      customerName = '',
      customerPhone = '',
      presaleRef = '',
      plotCode = '',
      plots = []
    } = body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount < 50) {
      return res.status(400).json({ error: 'Valid amount is required (minimum ₱50).' });
    }

    // Determine site URL for redirects
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

    // Line item amount in centavos
    const itemCentavos = Math.round(numAmount * 100);

    // Convenience fee passed to buyer (2.5% for online processing)
    const feeCentavos = Math.round(numAmount * 0.025 * 100);
    const feePhp = (feeCentavos / 100).toFixed(2);
    const totalPhp = ((itemCentavos + feeCentavos) / 100).toFixed(2);

    const lineItems = [
      {
        currency: 'PHP',
        amount: itemCentavos,
        name: description || (type === 'presale_reservation' ? 'Plot Reservation Deposit' : 'Cemetery Plan Payment'),
        quantity: 1
      }
    ];

    if (feeCentavos > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: feeCentavos,
        name: 'Payment Processing Fee (2.5%)',
        quantity: 1
      });
    }

    // Redirect URLs
    const successUrl = `${baseUrl}/?payment_status=success&type=${encodeURIComponent(type)}&ref=${encodeURIComponent(presaleRef || customerId)}`;
    const cancelUrl = `${baseUrl}/?payment_status=cancelled&type=${encodeURIComponent(type)}`;

    // Build PayMongo payload
    const payload = {
      data: {
        attributes: {
          billing: {
            name: customerName.trim() || 'Valued Customer',
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined
          },
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          description: description || `Golden Harmonic Memorial Park - ${type}`,
          line_items: lineItems,
          payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay', 'billease', 'dob'],
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            type,
            customerId: String(customerId || ''),
            customerEmail: String(customerEmail || ''),
            customerName: String(customerName || ''),
            presaleRef: String(presaleRef || ''),
            plotCode: String(plotCode || (plots && plots[0] ? plots[0].plotCode : '')),
            rawAmount: String(numAmount),
            feeAmount: String(feePhp),
            totalAmount: String(totalPhp)
          }
        }
      }
    };

    const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
    const pmRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      console.error('[paymongo-checkout] API Error:', pmData);
      const errDetail = (pmData.errors && pmData.errors[0] && pmData.errors[0].detail) || 'Failed to create PayMongo checkout session';
      return res.status(pmRes.status).json({ error: errDetail });
    }

    const session = pmData.data;
    return res.status(200).json({
      ok: true,
      sessionId: session.id,
      checkoutUrl: session.attributes.checkout_url,
      totalAmount: totalPhp,
      feeAmount: feePhp
    });
  } catch (err) {
    console.error('[paymongo-checkout] Internal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
