# Dictionary words and contributor training agreement

Prepared 2026-10-02. Implemented locally; deployment and production cleanup pending. No model training or provider upload has been performed.

## Scope

The dictionary contains word entries. Usage sentences may remain examples on a word; a complete expression is not a headword. Mobile, website and standalone dictionary readers exclude `contentKind: expression`, `collectionKind: expressions` and lexical kinds `phrase`, `idiom`, `proverb`. Unknown legacy word records stay readable. Spaces and punctuation alone are not classification evidence.

Publication routing now treats every non-word dictionary contribution as an expression, including older phone contributions. Expression text, alternatives, meaning and usage context remain whole. Sources, reviews and withdrawals remain in the existing submission workflow.

The invited contributor portal requires the versioned `contributor-training-v2` agreement. Invitation and sign-in notices disclose it before work begins. New accounts accept at activation; already activated accounts accept through `acceptContributorTrainingTerms`. The server records `{version, acceptedAt}` on `contributorAccounts/{uid}`. Client writes to this account are already forbidden by Firestore rules. The UI has a leave/sign-out action and starts workspace listeners only after the current version is accepted.

`saveExpressionAnswer` requires the agreement for drafts, skips and submissions. Every new submission records server-derived `permissions.aiTraining: true`, the agreement version and an acceptance snapshot. An explicit `aiTraining: false` from an older client is rejected. The per-submission AI opt-out is removed; the material-rights/publication confirmation remains. The agreement covers all future portal content contributions, not credentials, account contact details, financial documents or support messages. Presently this portal submits expression translations, alternatives and usage notes; listing other contribution types on a profile does not implement their upload workflows.

Agreement acceptance does not rewrite old grants. Old submissions with false or missing training permission remain excluded. A newly submitted revision uses the new agreement and retains lineage to its earlier review round. Community expression forms outside the invited portal retain their own permission model.

## Training eligibility

`onContributorExpressionReviewed` and `export-contributor-training.mjs` use accepted review status (`APPROVED`/`PUBLISHED`), current original publication and training permission, and contributor ownership. Eligibility is independent of dictionary publication, so retiring a mistaken dictionary copy does not remove an approved expression from the dataset.

The projection and export retain complete primary/alternate expressions and usage context, with dialect, literal translation, source submission, contributor, consent version and review time. Pending, rejected, withdrawn and originally unconsented submissions do not enter exports. Withdrawal still deletes the materialized pair; the exporter independently rereads source state to exclude stale pairs. Review and quality checks select usable data; export is not a training job.

## Retiring existing dictionary copies

After deploying the backend changes, inventory with Application Default Credentials:

```powershell
node services/functions/scripts/retire-dictionary-expressions.mjs --project project-kassena-7e026
```

This defaults to dry-run and emits IDs plus whether an eligible training pair can be retained. It does not output expression text or contact information. It identifies expressions using explicit row classification or the linked canonical submission, without guessing from headword length. Untagged rows with no usable lineage require manual classification; they are not removed automatically.

Review and retain that inventory, then apply:

```powershell
node services/functions/scripts/retire-dictionary-expressions.mjs --project project-kassena-7e026 --apply
```

Each transaction rereads the row and source, changes `isPublished` to false, stores a `dictionaryScopeMigration` marker and writes an audit record. It restores an eligible existing portal training pair if needed, using the original grant. Neither dictionary documents nor source submissions/receipts are deleted. No historical consent is changed and no new public expression publication is invented. A second run skips already retired copies.

Recovery: retain the source and audit IDs. After correcting erroneous classification/lineage and verifying current withdrawal state, staff can restore a mistakenly retired word's `isPublished` flag using the existing dictionary editor. Never blindly restore an expression or withdrawn content. The marker records the previous publication flag. The migration leaves old publication pointers intact so normal withdrawal can still reach the historical document.

## Release and verification

Deploy the changed invitation, activation, submission, review trigger and `decideSubmission` functions plus the new acceptance callable before releasing TribeStudio hosting. Also release website and standalone dictionary hosting; deliver the mobile reader in the next app version. No new rule/index is required. Production cleanup is a separate action. Verify both newly invited and existing contributors, latest agreement versions, old-client opt-outs, review/export, cleanup idempotency and withdrawal before announcing availability.

Local evidence: 122 selected backend/helper tests, 64 TribeStudio tests and 31 mobile dictionary tests passed. Functions and TribeStudio builds passed. Website and standalone dictionary checks passed. Integration coverage includes agreement enforcement through actual callables and cleanup/export against Firestore; final emulator outcome is recorded below.

Emulator outcome: all 8 integration tests passed against the Auth, Firestore, Storage and Functions emulators, including actual agreement callables, dictionary cleanup, export and withdrawal. The host Node 24 initially hit `ERR_REQUIRE_ASYNC_MODULE` in firebase-tools. A local-only loader in ignored `.labs-local/emulator-esm-loader.cjs` directed the Functions bundle through the emulator's existing dynamic-import fallback; application runtime configuration and dependencies are unchanged. The successful run log is `.labs-local/contributor-scope-emulators.log`.

Release draft: [Words in the dictionary, expressions for model learning](../../apps/updates-blog/posts/2026-10-02-dictionary-words-and-training/README.md).
