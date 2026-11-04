# CP6 — PayMongo checkout and reconciliation

Implemented locally November 1, 2026. **Disabled by default; no real provider calls, payment, deployment, migration or email.** The user confirmed keeping the 2.5% buyer fee. Save point: `Payment CP6: secure PayMongo checkout and reconciliation`.

## Flow and money

The verified account/reservation session requests an approved server offer. One durable intent stores owner, scope/contract/terms versions, explicit item allocations, principal, fee, provider account/environment and quote hash before one external create call. Concurrent clicks reuse the same active intent. A lost response or crash cannot authorize a second create. An admin retrieves the original provider session and validates its binding; explicit provider-confirmed expiry can release the checkout lock. Reservation ownership is independent of checkout expiry.

The buyer reviews principal plus a 2.5% fee (integer-centavo half-up rounding), then follows the saved hosted checkout link. Returning to the site does not prove payment. Required signed original webhook bytes or authenticated provider retrieval enter the same durable inbox and posting transaction. Test/live keys, currency, amount, paid date/status, exact session line items/metadata and stored binding must match. Event IDs and permanent provider payment IDs have different deduplication keys, both scoped by stable provider account/environment. Failed persistence returns 503, never a false acknowledgement.

The ledger credits principal, not buyer fee or provider net. Receipts retain gross received, principal, buyer fee and supplied actual provider fee/net separately. Verified mismatches, pending manual evidence, stale contracts or unmatched sessions stay in reconciliation. Admins can retry validation, confirm distinct money with explicit current allocations/unapplied excess, or link an existing matching manual receipt. Linking adds a provider sidecar without changing the original receipt or crediting twice. Older event rows can remain pending after another delivery resolves the same payment; retry deduplicates them to the existing receipt.

Manual approval refuses an active gateway checkout; after any gateway history, an explicit review acknowledgement is required. These checks do not guarantee detection of fabricated/different identifiers. Reconciliation and retirement of all legacy writers remain essential.

## Configuration and data contract

- Checkout: `PAYMENT_GATEWAY_ENABLED=true` plus complete CP2 configuration. Webhook: separately set `PAYMENT_GATEWAY_WEBHOOK_ENABLED=true`; stopping new checkout need not stop incoming funds. Both default off.
- Server-only `PAYMONGO_ENVIRONMENT=test|live`, stable `PAYMONGO_ACCOUNT_ID`, matching `PAYMONGO_SECRET_KEY`, and `PAYMONGO_WEBHOOK_SECRET_KEY`. Missing/malformed config fails closed. No environment files were read or edited.
- Canonical schema-4 booking must have matching `gatewayEnvironment` and `gatewayAccountId`, approved active policy, current owner/terms, reconciled opening balance and owned plots. No fixture is a production provisioning script.
- `paymentSubmissionScopes.gateway`: enabled, receivingAccountId/version, approved methods, and offers with stable id, purpose, principalCentavos and exact item allocations. Browser-supplied amounts/fees/URLs are rejected.
- Provider receiving account: enabled, version, channel `paymongo`, stable providerAccountId and environment. Existing per-scope active pointer prevents replacement checkout; server offers must be refreshed after balance/terms changes.
- New private collections: `paymentIntents`, `providerEvents`, `providerSessionBindings`, `providerIntentBindings`, `providerReceiptLinks`. Shared economic keys, operations, receipts, ledger, audit and dormant outbox remain server-owned. See [rules/index review](access-rules-review.md).

## Runtime and cutover limits

`api/paymongo-checkout.js` adopts the new gated handler. `api/paymongo-webhook.mjs` replaces the old `.js` file at the same route with a named POST Web Request handler; it reads the original stream before any JSON parsing. Signed replay tolerance is five minutes; legitimate delayed events outside it require authenticated retrieval/recovery. No legacy fallback and no automatic provider POST retry. Provider v1 is retained for the existing integration; provider session creation idempotency is not assumed.

Legacy customer/presale checkout buttons now direct buyers into secure payment access. Newly saved legacy presales still need approved access-version/canonical provisioning before the new checkout works. Existing legacy sessions have no new intent binding: retain and reconcile their paid evidence; do not silently import or drop it. Deploy only with a reviewed transition plan for pending old sessions, canonical mappings and actual legacy writer/rules cutover. `legacyWritesBlocked` alone is not enforcement.

Admin page: `/payment-gateway-admin.html`. Local synthetic preview: `npm.cmd run preview:payments -- --gateway`. Use fake logins. It never contacts PayMongo, sends email or loads production configuration. No public receipt QR was added; the decorative demo QR remains unchanged.

## Verification and release gates

127 unit/HTTP tests and four local Edge browser suites passed, including lost responses, concurrency, fee separation, signature bytes/environment, malformed evidence, duplicates, role/owner races, exact receipt linking, recovery, expiry and responsive screens. Desktop/mobile screenshots inspected. JSX parsed and JS/JSON/whitespace checks completed. The transaction double does not certify Firebase SDK, actual indexes or deployed rules.

Before activation: actual rules/index review and emulator integration; source/contact/canonical provisioning and legacy writer retirement; approved offers; native Vercel route/raw-byte staging verification; authentic PayMongo test-mode lifecycle/signatures/expiry/recovery; operational reconciliation and provider/accounting review. Notifications, schedules, refunds and live activation remain later/gated work.

Sources used for protocol review: [PayMongo signature verification](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), [event/resource structure](https://docs.paymongo.com/docs/developer-tools-webhooks-events), [checkout lifecycle](https://docs.paymongo.com/docs/payment-channels-key-concepts), [Vercel Web Request handlers](https://vercel.com/docs/functions/functions-api-reference).
