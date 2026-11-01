import gatewayHttp from '../lib/payments/gateway-http.js';

// Native Web Request preserves original bytes without Node's parsed-body helper.
export const POST = gatewayHttp.createWebhookWebHandler();
