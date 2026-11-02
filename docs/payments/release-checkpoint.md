# CP9 — local migration, recovery and release validation

**November 2, 2026 · Asia/Manila.** Starts from CP8 `a28045c`. The user requested CP9. No sanitized legacy export or deployed rules/index files were supplied; implementation therefore uses synthetic records and offline rehearsals. **The local checkpoint is not a production release or a completed live migration.**

Checkpoint subject: **`Payment CP9: add migration recovery rehearsals and cutover guards`**. Resolve its hash with `git log -1 --format='%h %s' --grep='Payment CP9:'`.

## What this checkpoint does

| Capability | Implementation |
|---|---|
| Legacy inventory | Flags ambiguous amounts/dates, duplicate references, missing ownership, provider overlap, pending proof, signed history and status-only credit |
| Migration planning | Requires explicit reviewed source hashes, unchanged contract totals and exact ownership/credit allocation for every plot; creates disabled draft records |
| Offline application | Checks the complete snapshot hash and every target precondition before producing a new JSON snapshot; never connects to Firebase |
| Portable backup | Deterministic per-document hashes and an overall manifest hash; validates bounded plain JSON and duplicate paths |
| Restore rehearsal | Restores only into an empty isolated snapshot or identical prior restoration; rejects newer/changed/partial targets |
| Release data audit | Reconciles booking/item/ledger/receipt/economic identities and plot bindings; flags unresolved money/provider/email cases |
| Legacy cutover guards | Fresh transactional checks on old customer/presale/plot writers, guarded role checks, atomic related plot/commission operations, protected portal routing |
| Reservation numbering | Rejects stale/malformed counters and existing reservation references; create-only destination prevents overwrite |

The CLI has no Firebase adapter, provider client, environment-credential reader, upload, deployment or live-apply mode. It never enables payment flags. Its reports always say `readyForProduction: false`; evidence about deployed security and providers is explicitly `unverified`.

## Run the synthetic rehearsal

The examples in `docs/payments/examples/cp9-*.json` contain **made-up records only**. Never import them into a real project. From the repository root, choose a new output directory:

```powershell
$paymentRehearsal = Join-Path $env:TEMP ('gh-payment-rehearsal-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $paymentRehearsal | Out-Null

npm.cmd run rehearse:payments -- inventory docs/payments/examples/cp9-source.json "$paymentRehearsal/inventory.json"
npm.cmd run rehearse:payments -- plan docs/payments/examples/cp9-source.json docs/payments/examples/cp9-decisions.json "$paymentRehearsal/plan.json"
npm.cmd run rehearse:payments -- apply docs/payments/examples/cp9-source.json "$paymentRehearsal/plan.json" "$paymentRehearsal/draft.json"
npm.cmd run rehearse:payments -- backup docs/payments/examples/cp9-source.json "$paymentRehearsal/backup.json"
npm.cmd run rehearse:payments -- verify "$paymentRehearsal/backup.json"
npm.cmd run rehearse:payments -- restore "$paymentRehearsal/backup.json" docs/payments/examples/cp9-empty-target.json "$paymentRehearsal/restored.json"
npm.cmd run rehearse:payments -- audit "$paymentRehearsal/draft.json" "$paymentRehearsal/audit.json"
```

`audit` returns exit **2** for unresolved local data findings. That is expected for a disabled migration draft. Exit **0** means the requested local operation succeeded, or the local data checks passed; it never authorizes production release. Exit **1** indicates invalid input, conflicts or file errors. Stop and inspect a failed step before continuing. Every output must be a **new** `.json` file; existing files are never overwritten. `--help` lists the commands.

The portable snapshot shape is `{schemaVersion:1, capturedAt:<epoch milliseconds>, documents:[{path,data}]}`. It supports at most 5,000 documents and 16 MiB of plain JSON, with bounded nesting. Firestore timestamps/references must be converted explicitly; this is **not** the native Firestore export format. No tool asserts that a supplied snapshot is complete or consistent with production. Preserve subcollections and immutable evidence when preparing an authorized real export; omission can invalidate reconciliation even if a JSON hash verifies.

Hashes detect changes to supplied bytes/values, not authenticity or authorization. Keep real-data artifacts private and outside Git/web-served directories. The CLI prints only operation results, but artifacts retain their supplied source data. Windows permissions, encryption, off-device backup and retention require an approved operational process; a POSIX mode argument does not establish Windows privacy.

## Migration draft contract and limits

`migration-rehearsal.js` inventories `customers` and `presaleApplications` without combining records by name/email/mobile. Decisions identify the exact source and its content hash, an external review reference, existing total/opening credit and explicit per-plot totals/credits. Selected plots must match all source-owned plot records and any declared plot list. Dual owner bindings, reused plots, existing canonical identities and stale snapshots are rejected.

Supported drafts use a conservative **opening-balance bridge** for simple positive legacy payment arrays:

- Preserve the entire original source, original references, recorded allocations, contacts and accepted plan under `paymentMigrationSnapshots/{bookingId}`. Historical snapshots do not become new customer collections.
- Create one opening ledger row with immutable reviewed item allocations. Booking credit equals historical source credit once; original arrays remain preserved but are never added again by canonical readers.
- Preserve existing monthly amounts and explicit due dates. Do not invent a new deposit deadline, enable lifecycle calculations, infer a new installment amount or change commission clocks.
- Draft bookings have `migrationStatus: draft`, `postingEnabled: false`, `policyStatus: awaiting_review`, `legacyWritesBlocked: false`, `lifecycleEnabled: false`, disabled notifications, and source/plot `paymentMigrationLock: rehearsal_only`. Canonical reads correctly refuse these unreconciled drafts.
- No receipts, provider/economic keys, new money, customer notices or emails are fabricated. Deterministic IDs and full-source preconditions support reproducible reviews; applying twice to an already modified snapshot is refused, rather than silently skipping changed records.

**This is not a live importer.** Historical individual receipts, permanent economic keys, pending/voided cash, provider deposits/fees, refunds/reversals, excess credit, owner corrections and advanced schedule provenance require reviewed adapters and evidence before activation. Unsupported cases remain excluded with findings. Do not change draft flags manually to bypass these missing prerequisites. Replacing a source snapshot with only selected rows can make an apparent balance incomplete; approved export coverage is a separate release gate.

## Release audit

`release-audit.js` verifies canonical source mappings and money invariants, reconciles each item allocation, compares receipt/ledger snapshots while allowing their distinct actor/kind metadata, checks permanent money identities, original opening provenance, current plot bindings and orphan records. It flags pending reconciliation, unmatched/held provider money and uncertain/in-flight email attempts. Nonzero historical openings require explicit item allocation provenance; adjustments/reversals remain reviewed exceptions.

A passing `localDataChecksPassed` applies only to the supplied sample and these checks. It does not certify all application invariants, complete backup coverage, authentication, SDK contention or deployed access rules. The report intentionally has no override that turns `readyForProduction` true.

## Legacy cutover changes

`payment-legacy-guard.js` is loaded by the existing public/admin pages. It re-reads source/plot records inside transactions and rejects present migration/canonical markers, including attempts to set/remove them through the guarded methods. Payment/ownership actions require a current non-disabled admin/superadmin document; buyer legacy proof submission requires the currently linked UID. Disabled users and staff cannot use the guarded payment actions. Browser checks remain compatibility protections, **not a substitute for Firestore rules**.

- Legacy customer plan/payment/owner-link changes, presale edits, old proof confirmation, contact changes and linked plot writes pass through the guard. Migrated/locked portal accounts link to secure payment history instead of displaying balances from old arrays.
- Presale payment/hold updates and cancellation/plot deletion now validate all current source/plot relationships and commit together. A stale/reassigned plot causes the entire operation to fail. Commission creation and source linking also commit together, so a migration race cannot leave a new commission behind.
- Portal Auth-account creation checks the source before the external Auth action and again before linking. This cannot retract an account/reset email if migration starts while the external action is in flight. Quiesce/drain these actions before cutover; a separately reviewed server account-provisioning path remains future work.
- Provisioned presale contact changes increment `accessVersion` in the same transaction, including changes away and back. Missing/untrusted contact provisioning is not silently approved.
- Customer/payment delete-to-trash and restore-from-trash are disabled. An absent target does not prove an old trash snapshot is safe to restore. Inquiry trash remains supported. Use a reviewed server recovery process for financial records.
- Plot assignment refuses to replace an existing plot record. Plot operations also inspect linked source markers even if the plot lacks its own canonical lock.
- `api/presale.js` rejects existing counter-derived reservation IDs and uses `tx.create`; collision changes no source/plot/counter and sends no confirmation. Malformed/exhausted counters require office reconciliation rather than scanning forward or overwriting.
- `api/send-ar.js` refuses canonical/locked sources. Legacy reminder loops skip present migration/canonical markers. Drain already-running reminder/acknowledgement tasks before cutover; an already-started external message cannot be retracted by a later guard.

These guarded code paths do not secure cached old JavaScript, direct SDK writes or unrelated legacy reporting. Existing admin portfolio/sales/sheet previews may still derive from old arrays; use CP8 canonical statements/collections for migrated contracts until those readers are replaced. The legacy order-email endpoint is not a verified-payment acknowledgement and remains outside the canonical outbox. Commission/payout/EOD settings do not become newly approved accounting policy through CP9.

## Real release procedure — still pending

| Gate | Required evidence | Current status |
|---|---|---|
| Deployed baseline | Exact deployed commit, approved project/environment identity, actual composed rules/index files | Not supplied/verified |
| Security | Emulator tests for all roles, direct SDK bypasses, overlapping grants, immutable markers, deletes/restores and contact/role changes | Not run against actual rules; no Java emulator available locally |
| Data | Authorized consistent export, all sources/subcollections/plots/cash/provider identities, accountant-signed reconciliation and exception ownership | Synthetic records only |
| Backup | Native database/evidence/Auth/config recovery coverage, isolated restore, row counts/hash/totals and retention/access controls | Portable JSON rehearsal only |
| Provider | Staging test/live configuration, native raw webhook bytes/signatures, retries/late/unmatched events, fees/settlement evidence | Synthetic tests only |
| Messaging | Verified contacts, sender configuration, realistic queue drainage and investigated ambiguous outcomes | No real email sent |
| Policy | Approved remaining formulas, quote examples, authority and receipt/invoice rules; gated features remain off otherwise | Existing open decisions retained |
| Cutover | Freeze legacy writers/tasks, reconcile final delta, deploy/test rules and readers, staged source activation, monitoring and rollback owner | Not executed |
| Release | Concrete reviewed migration artifact and explicit production change approval | Not requested/performed |

Before a real cutover, freeze/drain **all** legacy mutations and external side effects, capture and reconcile the final snapshot, and test the actual composed rules in an isolated environment. Review old cached clients and every source/plot/role/contact/financial writer, not only this checkout's UI. Use approved project identities; do not infer them from browser config or environment secrets. No replacement root Firebase rules/index configuration was invented in this checkpoint.

After activation, rollback must preserve newly accepted payments, provider inbox/economic keys, pending cash/proof, uncertain email attempts and versions. Stop new collection/dispatch safely, preserve unmatched received-money evidence, capture the current state, investigate external outcomes, and reconcile forward or restore to an isolated environment. **Never restore an old production snapshot or old payment writer over newer receipts.** Turning off a webhook without an inbox/retry/reconciliation plan can lose visibility of already received funds; the rollback owner must coordinate provider retries and intake explicitly.

Firestore Admin/server libraries bypass client rules, so server identity checks remain mandatory. Overlapping matching rule grants can defeat a narrow deny; only the composed rules can be certified. The official emulator has differences from production, so staging validation is still required. Managed Firestore exports/imports are a separate operational capability with their own permissions/billing/consistency considerations, not something this JSON tool reproduces. References: [rule structure](https://firebase.google.com/docs/firestore/security/rules-structure), [emulator connection and limitations](https://firebase.google.com/docs/emulator-suite/connect_firestore), [native export/import](https://firebase.google.com/docs/firestore/manage-data/export-import).

## Validation and handoff

Local validation includes snapshot tampering, restore conflicts with newer payments, deterministic disabled drafts, exact plot coverage, preserved allocation provenance, stale full-source hashes, money/item/receipt discrepancies, unmatched provider funds, current-role/migration races, atomic plot/commission actions, reservation counter collisions and the actual legacy HTTP adapters with synthetic Firebase/provider replacements. The CP9 browser test parses the complete JSX and mounts the real portal component with synthetic data at 320/390/768 px.

Results and final commit are recorded in [checkpoints](checkpoints.md) and the [backup guide](checkpoint-backup-guide.md). Applied skills: local Firebase authentication with delegated rules/cutover review, UI/UX error-recovery guidance and responsive design. No real credentials, production records, live email/payment, deployment or remote push were used. Synthetic JSON backup artifacts are not backups of the user's database.

**Next:** review this local CP9 checkpoint. Remaining work is the authorized real baseline, historical adapters, staging/recovery evidence and policy decisions above; CP0–CP9 source checkpoints do not mean the complete payment system is released.
