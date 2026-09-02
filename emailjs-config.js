// emailjs-config.js
//
// PLACEHOLDER — you need to fill these in from your own EmailJS account
// (emailjs.com). This powers the automatic "Brochure on its way" email
// sent to customers when they submit the price-list form.
//
// Where to find each value:
//   PUBLIC_KEY  → Account → General → Public Key
//   SERVICE_ID  → Email Services → (your connected service) → Service ID
//   TEMPLATE_ID → Email Templates → (your template) → Template ID

window.EMAILJS_CONFIG = {
  PUBLIC_KEY:  "jzX1DClL1H1hQWFGT",
  SERVICE_ID:  "service_wdr2i7a",
  TEMPLATE_ID: "template_q0lutxf"
};

if (window.emailjs && window.EMAILJS_CONFIG.PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
  emailjs.init({ publicKey: window.EMAILJS_CONFIG.PUBLIC_KEY });
}
