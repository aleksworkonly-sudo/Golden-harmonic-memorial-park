// /api/send-email.js
//
// Vercel serverless function that sends transactional emails via Brevo
// (formerly Sendinblue). The front-end calls this endpoint instead of
// the old client-side EmailJS approach, keeping the API key secure.
//
// Required env var:  BREVO_API_KEY
// Optional env var:  SENDER_EMAIL  (defaults to noreply@goldenharmonic.com)
//                    SENDER_NAME   (defaults to Golden Harmonic Memorial Park)

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// ─── Branded HTML email builder ────────────────────────────────────
function buildInquiryHtml({ first_name, last_name, interest, plan_name, plan_price }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f1e8;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2f5d4c 0%,#1a3d30 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#f6f1e8;font-size:22px;font-weight:600;letter-spacing:0.5px;">Golden Harmonic Memorial Park</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#1f2a26;font-size:16px;line-height:1.6;">
            Hi <strong>${first_name || 'there'}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">
            Thank you for your inquiry! We've received your request and our team will be in touch with you shortly.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border-radius:8px;padding:20px;margin:24px 0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#4a564f;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your Inquiry Details</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Name:</strong> ${first_name || ''} ${last_name || ''}</p>
              ${interest ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Interest:</strong> ${interest}</p>` : ''}
              ${plan_name ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Plan:</strong> ${plan_name}</p>` : ''}
              ${plan_price ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Price:</strong> ${plan_price}</p>` : ''}
            </td></tr>
          </table>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">
            We'll send you a brochure with more details soon. If you have any questions in the meantime, feel free to reach out to us.
          </p>
          <p style="margin:24px 0 0;color:#4a564f;font-size:14px;">
            Warm regards,<br><strong style="color:#2f5d4c;">Golden Harmonic Memorial Park</strong>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9f7f2;padding:20px 40px;text-align:center;border-top:1px solid #e8e0d0;">
          <p style="margin:0;color:#8a7f6f;font-size:12px;">
            &copy; ${new Date().getFullYear()} Golden Harmonic Memorial Park &bull; Palawan, Philippines
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildOrderHtml({ first_name, last_name, plan_name, plan_price, payment_term, payment_method }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f1e8;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2f5d4c 0%,#1a3d30 100%);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#f6f1e8;font-size:22px;font-weight:600;letter-spacing:0.5px;">Golden Harmonic Memorial Park</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#1f2a26;font-size:16px;line-height:1.6;">
            Hi <strong>${first_name || 'there'}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">
            Thank you for your reservation! We've received your order and our team will reach out to confirm payment details.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border-radius:8px;margin:24px 0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 8px;color:#4a564f;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Order Summary</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Name:</strong> ${first_name || ''} ${last_name || ''}</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Items:</strong> ${plan_name || '—'}</p>
              <p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Total:</strong> ${plan_price || '—'}</p>
              ${payment_term ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Payment Term:</strong> ${payment_term}</p>` : ''}
              ${payment_method ? `<p style="margin:0 0 4px;color:#1f2a26;font-size:15px;"><strong>Payment Method:</strong> ${payment_method}</p>` : ''}
            </td></tr>
          </table>
          <p style="margin:0 0 16px;color:#4a564f;font-size:15px;line-height:1.6;">
            Our team will contact you shortly with the next steps. Thank you for choosing Golden Harmonic Memorial Park.
          </p>
          <p style="margin:24px 0 0;color:#4a564f;font-size:14px;">
            Warm regards,<br><strong style="color:#2f5d4c;">Golden Harmonic Memorial Park</strong>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9f7f2;padding:20px 40px;text-align:center;border-top:1px solid #e8e0d0;">
          <p style="margin:0;color:#8a7f6f;font-size:12px;">
            &copy; ${new Date().getFullYear()} Golden Harmonic Memorial Park &bull; Palawan, Philippines
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Handler ───────────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS headers (the front-end is on the same Vercel deployment, but
  // just in case it's accessed from a custom domain or preview deploy)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('[send-email] BREVO_API_KEY env var is not set');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  const senderEmail = process.env.SENDER_EMAIL || 'noreply@goldenharmonic.com';
  const senderName  = process.env.SENDER_NAME  || 'Golden Harmonic Memorial Park';

  const {
    type,           // 'inquiry' | 'order'
    to_email,
    first_name,
    last_name,
    interest,
    phone,
    plan_name,
    plan_price,
    payment_term,
    payment_method
  } = req.body || {};

  if (!to_email) {
    return res.status(400).json({ error: 'to_email is required' });
  }

  // Build HTML body based on email type
  const isOrder = type === 'order';
  const subject = isOrder
    ? `Order Confirmation — Golden Harmonic Memorial Park`
    : `Thank you for your inquiry — Golden Harmonic Memorial Park`;

  const htmlContent = isOrder
    ? buildOrderHtml({ first_name, last_name, plan_name, plan_price, payment_term, payment_method })
    : buildInquiryHtml({ first_name, last_name, interest, plan_name, plan_price });

  try {
    const brevoRes = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to_email, name: `${first_name || ''} ${last_name || ''}`.trim() || to_email }],
        subject,
        htmlContent
      })
    });

    if (!brevoRes.ok) {
      const errorText = await brevoRes.text();
      console.error(`[send-email] Brevo ${brevoRes.status}: ${errorText}`);
      return res.status(brevoRes.status).json({ error: `Brevo error: ${errorText}` });
    }

    const result = await brevoRes.json();
    return res.status(200).json({ success: true, messageId: result.messageId });
  } catch (err) {
    console.error('[send-email] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
