# Payment implementation — checkpoint and backup guide

Last reviewed: **November 2, 2026 · Asia/Manila**

Repository: `D:\COMMI\Golden-harmonic-memorial-park-main`

Branch: `presale-system`

This document identifies completed work, unfinished work and the information needed to resume. **It is an index and backup procedure, not a backup of the source code, Firebase database, uploaded evidence or credentials.** No backup archive, remote push, deployment or production migration was performed by creating this file.

## Checkpoint inventory

| Checkpoint | Implementation | Status | Saved commit | Recorded validation |
|---|---|---|---|---|
| CP0 | Baseline, scope, policy questions and acceptance criteria | Complete; saved with CP1 | `4102bc3` | Baseline documented |
| CP1 | Integer-centavo money helpers, Manila calendar rules, authorization and isolated transactional posting foundation | Complete | `4102bc3` | 21 tests passed at checkpoint |
| CP2 | Account login, scoped reservation email links, private read-only history and responsive screens | Complete locally; activation disabled | `ddb7a78` | 43 tests and local browser checks passed at checkpoint |
| CP3 | GCash/bank proof submission, capped private Firestore images, immutable corrections, pending status and demo QR | Complete locally; activation disabled | `26f8b3d` | 62 tests and local browser checks passed at checkpoint |
| CP4 | Admin queue, evidence review, correction/rejection/reconciliation, canonical posting and customer ledger view | Complete locally; activation disabled | `f6230ff` | 84 tests and both local browser suites passed |
| CP5 | Admin-only cash: record → print → photograph → approve | Complete locally; activation disabled | `fb8d38a` | 102 tests and all three local browser suites passed |
| CP6 | Secure PayMongo integration, provider validation and shared reconciliation | Complete locally; activation disabled | `4bdd8fa` | 127 tests and all four browser suites passed |
| CP7 | Verified deposits, original deadline, installment timing and retained-hold review | Complete locally; amounts/penalties and activation gated | `64c0d83` | 145 tests and all five browser suites passed |
| CP8 | Notification delivery, reminders, collections/statements, recorded allocations and OCR | Complete locally; dispatch and activation disabled | Resolve `Payment CP8:` by subject | 167 tests and all six browser suites passed; real pinned OCR read a synthetic sample |
| CP9 | Authorized migration, backup/restore, recovery, rules/indexes and release validation | Not started | — | — |

“Complete locally” means the checkpoint's source and local tests were saved. It does not mean the feature is enabled in production. Test counts describe those saved commits, not a guarantee about an uncommitted working tree.

## Completed commit references

```text
4102bc3 Payment CP1: add isolated posting foundation and checkpoint
ddb7a78 Payment CP2: add secure access and read-only payment views
26f8b3d Payment CP3: add private manual proof submissions and demo QR
f6230ff Payment CP4: add admin review and canonical manual posting
fb8d38a Payment CP5: add admin cash record print photo approval
4bdd8fa Payment CP6: secure PayMongo checkout and reconciliation
64c0d83 Payment CP7: track deposits and reservation review
```

The pre-payment baseline is `b5dd24e`. CP0 has no separate commit. To confirm these references in your copy:

```powershell
git status --short
git log --oneline --grep="Payment CP"
git log -1 --format='%h %s' --grep='Payment CP8:'
git show --stat 26f8b3d
```

The latest checkpoint hash is resolved by its unique subject because this guide is included in that same checkpoint commit.

## Latest completed work and next implementation

CP4 adds the admin review API/interface, current transactional role checks, immutable review decisions, reconciliation, principal/item allocations, unapplied excess, permanent receipt deduplication and canonical customer/guest history. It also separates evidence revision counts from administrative case versions. See the [full CP4 contract](review-checkpoint.md).

CP5 adds the four cash steps, immutable pending receipts and photos, cash-on-hand reconciliation, permanent register/reference uniqueness and shared canonical approval. The same admin may record and approve. See the [CP5 contract](cash-checkpoint.md).

CP7 adds verified deposit fulfillment, original deadlines, date-only installment calendars and admin retained-hold review. The user confirmed the deposit-completion receipt date and keeping plots held after an overdue deadline. See the [CP7 contract](lifecycle-checkpoint.md).

CP8 adds private acknowledgements/notices, bounded email delivery/recovery, the confirmed reservation reminders, read-only ledger reports and optional on-device receipt reading. It displays only recorded commission/tax allocations. See the [CP8 contract](operations-checkpoint.md).

The next checkpoint is **CP9: migration, recovery and release validation**, only when requested. Binding installment amounts, penalties, automatic commission/tax calculation, portfolio/settlement exports, cash-intention codes and release/extension/refund workflows remain gated or proposed follow-ups. CP8 does not remove production rules, contact provisioning, dispatch-capacity, migration, legacy-writer cutover or integration gates.

The user confirmed during CP4: **credit the verified actual amount; retain any excess as unapplied credit**. This is the implemented default and is tested. The CP6 2.5% buyer fee is confirmed; other fees, penalty formulas, schedule generation and refunds remain separately gated.

## Files to read before resuming

| File | Purpose |
|---|---|
| [Payment blueprint](../../payment-feature-blueprint.md) | Confirmed business rules, target design, open decisions and acceptance scenarios |
| [Checkpoint implementation log](checkpoints.md) | Detailed CP0–CP8 implementation and handoff records |
| [CP3 implementation contract](submission-checkpoint.md) | Evidence storage, schemas, limits, test results and activation requirements |
| [CP4 implementation contract](review-checkpoint.md) | Admin decisions, canonical money, reconciliation and release gates |
| [CP5 implementation contract](cash-checkpoint.md) | Cash steps, receipt identities, private photos, validation and release gates |
| [CP6 implementation contract](gateway-checkpoint.md) | Authorized checkout, raw-body verification, provider reconciliation and activation gates |
| [CP7 implementation contract](lifecycle-checkpoint.md) | Deposit dates, retained-hold review, schema, tests and remaining policy gates |
| [CP8 implementation contract](operations-checkpoint.md) | Notifications, outbox recovery, reminders, reports, OCR, tests and activation gates |
| [Rules review](access-rules-review.md) | Non-deployable Firestore review fragments and required integration tests |
| This guide | Commit inventory, unfinished checkpoint and backup/restore procedure |

Applicable local skills: `.agents/skills/firebase-auth-basics/SKILL.md` (including its security-rules delegation), `.agents/skills/ui-ux-pro-max/SKILL.md`, and `.agents/skills/responsive-design/SKILL.md`. Use these when continuing the corresponding code or interface work. This guide adds no new Firebase configuration or deployment requirement.

## Back up saved Git checkpoints

Run these yourself when ready. Choose a backup destination outside the repository; this example creates a dated directory:

```powershell
Set-Location -LiteralPath 'D:\COMMI\Golden-harmonic-memorial-park-main'
$checkpointBackup = 'D:\Backups\GH-payments-2026-11-01'
New-Item -ItemType Directory -Path $checkpointBackup -Force
git bundle create "$checkpointBackup\repository.bundle" --all
git bundle verify "$checkpointBackup\repository.bundle"
Copy-Item -LiteralPath 'docs\payments\checkpoint-backup-guide.md' -Destination $checkpointBackup
```

The bundle preserves commits and references available locally, including the saved checkpoints. **It does not include uncommitted edits, untracked files, ignored `.env` files or live Firebase data.** Keep a second copy on your chosen backup device/service; a file on the same disk alone does not protect against disk failure.

## Preserve unfinished changes too

If you start the next checkpoint and have not committed it, save its tracked-file patch as well:

```powershell
git diff HEAD --binary --output="$checkpointBackup\working-tree.patch"
git status --short | Out-File -LiteralPath "$checkpointBackup\working-tree-status.txt" -Encoding utf8
git rev-parse HEAD | Out-File -LiteralPath "$checkpointBackup\base-commit.txt" -Encoding ascii
git ls-files --others --exclude-standard
```

The patch includes staged and unstaged tracked-file changes against HEAD. It **does not include new untracked files**. Review the last command's list and copy the new implementation files into a `new-files` directory with their repository-relative paths preserved. Recheck the list at backup time because continued work can add files. Store credentials separately in your chosen secure credential backup; do not add them to Git to make a checkpoint.

An alternative is to finish and validate the checkpoint, commit its intended files, and regenerate the bundle. A local commit is a saved checkpoint; it is not an off-device backup or a GitHub push.

## Restore into a separate directory

Inspect a completed checkpoint without overwriting the current working copy:

```powershell
git clone 'D:\Backups\GH-payments-2026-11-01\repository.bundle' 'D:\COMMI\GH-payments-restored'
Set-Location -LiteralPath 'D:\COMMI\GH-payments-restored'
git switch --detach 26f8b3d
git status --short
npm.cmd ci
npm.cmd run test:payments
```

For an unfinished-work backup, first check out the exact hash recorded in `base-commit.txt`, then check/apply the patch and restore the reviewed new files to their original relative paths:

```powershell
git apply --check 'D:\Backups\GH-payments-2026-11-01\working-tree.patch'
git apply 'D:\Backups\GH-payments-2026-11-01\working-tree.patch'
git status --short
```

Do this in the separate restored directory. Restoring source does not restore a production database or safely reverse payments already recorded after a deployment. Production rollback and data recovery remain CP9 work.

## Rules to retain across every checkpoint

- Keep PayMongo and manual GCash/bank workflows; only admins confirm manual money or record cash.
- No percentage down payment; the ₱5,000-per-plot reservation deposit counts toward the plan.
- Three months from reservation submission for the deposit; installments begin one month after actual deposit payment. Spot-cash balance remains due by the original deadline.
- No automatic plot release; staff review is required.
- Do not invent post-deposit installment amounts or the basis of the 2% monthly penalty.
- Keep evidence private, preserve corrections, and ensure retries cannot post money twice.
- Keep new activation flags off until their rules, configuration, migration and integration gates are completed. Saving a checkpoint does not authorize a deployment.

## Update this guide when a checkpoint finishes

1. Record the actual commit hash and date.
2. Replace “in progress” only after the feature and its required local checks are complete.
3. Record the actual validation results and remaining production gates.
4. Identify the next checkpoint without marking it implemented.
5. Regenerate and verify the backup bundle; preserve any remaining uncommitted work separately.
