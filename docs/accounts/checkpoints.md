# Account checkpoints

Updated November 26, 2026 (Asia/Manila).

Baseline: clean working tree at `efe6311`; the previous remaining-balance and blueprint work is now committed. No root AGENTS.md or account modules found in repository inventory. Firebase Auth, UI/UX and responsive-design skills read. Actual deployed rules and production configuration are not available locally; no Java executable found for Firebase emulator.

| Checkpoint | State | Evidence |
| --- | --- | --- |
| A00 | complete | Baseline inspected; D1-D3 recorded in decisions.md |
| A01 | verified_local | Identity/policy/resolver tests in accounts.test.js |
| A02 | verified_local | Claim/replay/conflict/expiry/contact-race tests; browser interrupted-claim recovery; actual Firebase remains A08 gate |
| A03 | verified_local | Actual manual/cash/gateway domain services create exactly one atomic receipt event; pending/rejected/pre-launch cases do not invite |
| A04 | verified_local | Durable delivery, retries, suppression and worker tested with injected mail/Auth |
| A05 | verified_local | Responsive activation/password/existing-password/recovery UI; browser test passes at 320/390/768/1365px |
| A06a | verified_local | Typed customer/presale lists and history; shared source authorization and revoked legacy fallback checks |
| A06b | verified_local | New guest proof/gateway gate; prior proof correction/idempotent recovery preserved; polling/refresh exposes setup prompt |
| A06c | verified_local | Presale gateway and receipt tests; shared operations/notices/legacy receipt resolver; payment regressions below |
| A07 | verified_local | Office status/resend/revoke and unlinked contact confirmation; commit-time role checks, monotonic version and guest invalidation; no historical campaign |
| A08 | blocked_external | Actual composed Firebase rules/indexes, real Auth SDK/provider behavior, isolated staging and hosting runner evidence unavailable |

## Validation evidence

- Account tests: **18/18 pass** in the final combined run. Independent backend security review found no further concrete authorization issues after earlier findings were corrected. Final delivery hardening additionally preserves queued mail after transient Firestore errors rather than permanently suppressing it.
- `node --test --test-reporter=spec tests/accounts/*.test.js tests/payments/*.test.js`: **251/253 pass**. The expected account-list shape test was updated for the new `kind` field. Two inherited failures remain; details below.
- `node tests/accounts/browser.cjs` with the bundled Playwright module and headless Edge: **pass**. Wrong email, email verification, password setup, interrupted claim/refresh/existing-password recovery, source claim, account session/history, future payment access, public resend, disabled flag; no page errors or overflow at 320/390/768/1365px. Synthetic Firebase identity and memory Firestore, not real Auth certification.
- `node tests/payments/remaining-balance-browser.cjs` using the same runtime: **pass**. Accounts disabled: existing guest email exchange, correct balance, GCash QR, partial proof upload, approval refresh and 375/768/1365px layouts remain working.
- `site.jsx` and `presale.jsx` parse successfully using the locally installed Babel parser; `git diff --check` passes (line-ending notices only).
- Browser activation screenshot was visually inspected. Local artifacts: `%TEMP%/gh-account-activation.png`, `%TEMP%/gh-email-remaining-gcash.png`. They contain synthetic data only and are not required to resume.

Inherited failures (release issues, not hidden or changed to make the suite green):

1. `tests/payments/lifecycle.test.js` "unsupported provenance..." asserts 48 months is unsupported, while the unchanged HEAD `lib/payments/lifecycle-model.js` explicitly supports 48 months. The source/model/fixture assertion predate this account work. Review the existing installment requirements before updating the test.
2. `tests/payments/router.test.js` function-budget assertion sees **25 existing API files**, above its Hobby limit of 12 (and expected count 9). `git ls-tree -r HEAD api` confirms the legacy API helpers/vendor files are already in the baseline. This implementation adds **zero API entry files**; account routes use the shared router. Resolve actual hosting/function consolidation separately before deployment.

The final post-payment path prepares invitations using database work only; Auth and email calls run in the authenticated worker/support resend. Scheduler, indexes, provider domains, actual rules and staging are mandatory release gates in [release.md](release.md). No live configuration, email, migration, account creation, deployment or commit performed. The npm command shim was unavailable in one reviewer runtime; direct Node test commands above were used.
