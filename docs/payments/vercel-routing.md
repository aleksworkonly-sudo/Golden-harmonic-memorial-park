# Vercel Hobby deployment fix

The deployment of CP9 (`ddcd40d`) exceeded Vercel Hobby's 12-function limit.
This repository uses plain Node API files, so each supported file under `api/`
is a separate deployment entry point. Feature flags do not remove those files
from the build. See [Vercel's Node runtime documentation](https://vercel.com/docs/functions/runtimes/node-js).

## Deployment layout

Seven payment endpoints now share `api/payments.js`, which delegates through
`lib/payments/router.js` to the same existing HTTP handlers:

- `/api/payment-access`
- `/api/payment-submission`
- `/api/payment-review`
- `/api/payment-cash`
- `/api/payment-lifecycle`
- `/api/payment-operations`
- `/api/payment-messaging-worker`

Explicit `vercel.json` rewrites preserve these URLs, including their `.js`
aliases. The router selects a handler using the incoming pathname; it does not
trust query parameters or forwarding headers as route selectors. Direct requests
to `/api/payments` return a private 404. The original request, body, headers and
response are passed to the selected handler without wrapping or reserializing.

`lib/presale-reminders.js` is the relocated reminder helper. Its caller remains
`api/send-reminders.js`, and both cron URLs and schedules remain unchanged.

There are **nine function entry points**: the shared payment router, PayMongo
checkout, the native PayMongo webhook, presale, retired presale tracking, agent
commission email, acknowledgement email, general email and reminders. Keep
shared modules outside `api/`. Adding new API files must keep the total at 12
or fewer unless the hosting plan changes.

## Preserved behavior

No frontend, styles, QR asset, business policy, database schema, feature flag,
environment variable or provider URL changed. The existing handlers still own
origin checks, account/guest/admin authorization, worker-secret checks, body
limits, rate limits, cookie creation and financial transactions. The native
`api/paymongo-webhook.mjs` remains separate and unchanged, preserving raw request
bytes for signature verification. This packaging change does not activate any
payment checkpoint or close the production gates in the CP9 release document.

## Validation and release

`npm run test:payments` passes **196 tests**, including route/handler parity,
disabled flags, method/origin/body rejection, route-injection rejection, guest
link exchange/history/logout and the function-budget/configuration regression
check. These are local tests; real money, email and production Firebase are not
used. Historical checkpoint test counts remain the counts at their original
commits.

A local **Vercel CLI 65.4.0** build of an isolated copy with synthetic project
settings succeeded. The generated output contains **nine `.func` directories**
and all **14 payment rewrites**. Another **42 checks** loaded the packaged
payment handler and exercised GET/POST/DELETE across both URL forms with flags
off. The first build attempt encountered a local Node compiler memory error;
the successful retry used one build worker and disabled JIT. This is packaging
evidence, not a hosted end-to-end check. `vercel dev` required authentication
and was not used to certify hosted routing.

Commit the routing changes together, including removed wrappers, rewrites and
the moved helper, then deploy that revision. Redeploying `ddcd40d` still uses the
old function layout. On the deployment preview, check enabled/disabled status
at the existing public payment URLs and confirm the generated function count.
Do not enable payment flags merely to verify routing. No remote push or hosted
deployment was performed for this fix.
