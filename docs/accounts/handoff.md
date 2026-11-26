# Current account handoff

Updated November 26, 2026 (Asia/Manila).

- User authorized implementing blueprint.md with local skills.
- Baseline HEAD: efe6311. Working tree initially clean.
- Confirmed D1-D3: post-launch payments only; require accounts for subsequent payments; any positive verified credit qualifies.
- A00 complete. A01-A07 implemented and verified locally; A08 external release evidence remains open. See checkpoints.md and release.md. Do not restart the source implementation.
- Preserve canonical ownerBinding and all financial records. Present revoked grants must override legacy authUid fallback.
- No live configuration, payment, email, deployment or migration performed.
- Tests: 18/18 account tests pass; combined suite 251/253, with inherited unsupported-term and API-budget failures detailed in checkpoints.md. Account browser and existing guest remaining-balance browser both pass. Actual composed Firebase rules inventory/Java emulator runtime unavailable locally.
- New modules under lib/accounts; payment posting records durable events and the future-payment restriction. All history/submission/gateway/operations server and UI adapters use typed customer/presale sources. Source grants preserve canonical financial bindings and receipts.
- Delivery prepares after commit using database work only; no Auth/provider wait on payment responses. Authenticated `/api/account-worker` dispatches and retries. A frequent production runner and tested hosting budget still must be configured. Public setup only queues mail; no live dispatch performed.
- Final delivery fix: only domain validation failures suppress obsolete mail; transient Firestore errors leave it queued for recovery. Integration test covers a database-unavailable error followed by successful retry.
- Office support is `/account-admin.html`, linked from admin sidebar. Unlinked email confirmation is audited and increments accountContactVersion; old invitations and guest sessions stay invalid after changing an email away and back. Linked/revoked ownership transfers and noncanonical legacy reconciliation are deliberately outside this support action. Revocation cannot fall back to legacy authUid.
- UI entry is `/my-payments?mode=account` or `/my-account`; activation/recovery is `/account-activate.html`. Native Firebase email link verifies the mailbox, then buyer chooses/uses a password. Auth-success/claim-failure recovers from the invitation stored in sessionStorage; Firebase action URLs/passwords are never persisted by application code.

## Resume from here

1. Inspect Git status and current instructions; preserve all account edits. No commit was made. Read decisions.md, checkpoints.md, release.md and access-rules-review.md.
2. The next checkpoint is **A08**. Obtain the actual composed Firestore rules/index inventory and isolated Firebase/Auth staging configuration; run real SDK/rules/provider tests. Do not claim that synthetic test fixtures certify those boundaries.
3. Resolve the two inherited regression/deployment failures against current payment/hosting requirements. Account changes added no new API functions.
4. Confirm sender/domain/password policy, terms/privacy content/version and a frequent authenticated account-worker runner with sufficient execution budget. Keep account flags off until all required gates pass.
5. Perform isolated staging for each payment channel, activation, login/reset, reads/payments/corrections, contact drift and revocation. Record evidence and any changes here. Production activation/deployment is separate authorization; no live mail or data mutation has been done.

No unresolved business question blocks local implementation. D1-D3 are confirmed. A08 needs environment evidence, not a new preference decision. Do not remove persisted future-payment gates, delete Auth users, change financial ownerBinding or create synthetic receipts to work around onboarding.
