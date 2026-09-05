# Kasem evidence: collection, review and dataset releases

Implemented 2026-09-05. This extends the existing Flutter contribution and review desk, Firebase callables, private evidence storage, and Kawuri retrieval. Production deployment, migration, speaker collection and model training are separate operational steps. All automated fixtures are synthetic; passing software tests does not validate a linguistic claim.

## Contributor and reviewer workflow

Open **Contribute → Teach a sentence**. Choose a sentence, comparison, or answer correction. Provide the Kasem sentence and natural English meaning, describe the situation, and record dialect and source where known. A literal paraphrase is optional. Optional annotations address word/phrase spans and can retain unknown functions, alternative hypotheses, scope, or dictionary sense references. No English equivalent is required for `mo` or another unexplained particle.

Each contribution has one to six examples; comparisons have exactly two examples in the same context. Drafts are saved locally per account. Pending audio must be reattached after restoring a draft. Existing per-example context, dialect and sources survive revision unless the contributor changes their shared fields. **My sentences** provides revision and withdrawal.

Permission choices start unchecked. Source confirmation and community review are required for new submissions. Public display, AI-provider retrieval, model training, evaluation and recording storage are separate choices. Expiry is optional. Review approval cannot grant any of these permissions. Audio is for review; this implementation does not create speech-training datasets.

The **Review desk → Sentences** queue supports status and text filtering by dialect, construction and context. Validators attest that they can judge the dialect, then assess meaning, grammar, naturalness and context independently for each example. Every dimension permits abstention. Annotation/explanation approval is separate. Two different, non-author reviewers must agree on all positive dimensions before an example is eligible. Disagreement remains visible and blocks that example. One approved example does not approve the other examples in its note. Negative preference candidates never become ordinary translation targets.

**Grammar evidence** lets validators propose scoped claims from current reviewed evidence, inspect the supporting sentences, and independently support or dispute the claim. Two supporters are needed; the claim author cannot supply an independent vote. An administrator can retire a claim through `decideGrammarClaim`. A changed claim requires a new proposal linked to current evidence. The former blanket `mo` indefinite rule and generated indefinite noun forms are withheld; no replacement universal rule has been asserted.

## Records and access

| Collection | Purpose |
| --- | --- |
| `kasemEvidence` | Private source records, permissions, current revision and review history. |
| `kasemEvidence/{id}/revisions` | Immutable submitted text and metadata for each revision. |
| `kasemEvidence/{id}/reviews` | Immutable reviewer/revision events. |
| `grammarNotes` | Owner/staff workflow projection; independent reviewers do not receive others' judgments. |
| `kasemSentences` | Limited, approved public projection when publication permission is active. |
| `grammarClaims`, `kasemClaimReviews` | Versioned scoped claims, independent decisions and audit events. |
| `grammarRules` | Curated public seed rules and private projections of reviewed claims; provider use rechecks evidence permissions. |
| `kasemDatasetReleases` | Release checksums, included evidence/claims and lifecycle status. |
| `kasemWithdrawals`, `kasemModelRuns` | Withdrawal records and model/release preflight registry. |

Record identity is an attestation ID, not a hash of its sentence. Similar spellings and different dialects do not overwrite each other. NFC display normalization preserves original strings. Contracts live in `packages/contracts/schemas/kasem-*.schema.json`.

Recordings use `grammarAudio/{owner}/{unique-file}`. Direct reads are owner-only and uploads cannot overwrite an existing object. Reviewers use `readGrammarAudio`, which checks their role, exact revision, active audio permission and the stored object generation before returning bytes. It does not issue a public download URL. Replacing a deleted recording cannot silently replace the recording attached to an earlier revision.

Kawuri reads current permissions and review state for each lookup. Related wording is not an exact translation. Context limits and approved annotations are carried into the briefing; missing annotations must not be invented. Held-out evidence groups, including newly added related variants, are excluded from retrieval. The in-memory retrieval path fails closed above 3,000 evidence notes; add a paginated permission-aware index before exceeding that pilot limit.

## Local verification

From the repository root:

```powershell
npm.cmd run test:contracts
npm.cmd run test:function-helpers
npm.cmd run test:kasem-evidence:integration
```

The integration command uses demo Firebase Auth, Firestore and Storage emulators. It exercises submission, concurrent independent review, revision, public/private access, grammar support, registered export, preflight, withdrawal and immutable audio. It does not contact a production project.

From `apps/mobile`:

```powershell
flutter test test/features/validate/kasem_evidence_workflow_test.dart test/features/validate/grammar_note_test.dart test/domain/dictionary_entry_test.dart
```

## Deployment and legacy migration

1. Deploy the changed Firestore/Storage rules and updated functions together with the new mobile workflow. Callables include `submitGrammarNote`, `decideGrammarNote`, `reviseGrammarNote`, `withdrawGrammarNote`, `grammarQualityReport`, `readGrammarAudio`, `submitGrammarClaim`, `decideGrammarClaim` and the updated `rateKawuriAnswer`. Deploy the changed `askKawuri` retrieval path as well.
2. During a controlled rollout, `KASEM_EVIDENCE_WRITES=false` pauses collection/review and `KASEM_EVIDENCE_RETRIEVAL=false` withholds evidence retrieval. Withdrawal remains available. These are functions environment variables; changing them requires the normal functions deployment workflow.
3. Run a private legacy inventory with an explicitly selected project and appropriate operator credentials:

```powershell
npm.cmd run build:functions
npm.cmd run kasem:dataset -- migrate --project YOUR_PROJECT_ID
npm.cmd run kasem:dataset -- migrate --project YOUR_PROJECT_ID --commit
```

Migration defaults to dry-run, is additive and idempotent, and archives original records. Failed conversions are counted and return a nonzero exit code; inspect the source records rather than shortening them. Old counters do not become independent reviews, and old approvals do not become consent. Migrated records need their owner's permission revision and fresh independent review before use. Older clients can submit legacy notes into the permission queue, but cannot perform the new review through the old boolean-approval API. Upgrade reviewer clients before rollout.

The public rules withhold legacy sentence documents that lack the v2 projection marker. The runtime also withholds the old blanket indefinite claim. Keep the audited grammar seed definitions when applying seeds; do not restore the previous `mo` rule as a rollback.

## Private reports and reproducible exports

Use a private directory outside the repository. `--synthetic` permits repository output only for synthetic fixtures. No command sends examples to an AI provider or starts a model job.

```powershell
npm.cmd run kasem:dataset -- report --firestore --project YOUR_PROJECT_ID
npm.cmd run kasem:dataset -- export --firestore --project YOUR_PROJECT_ID --commit --release kasem-pilot-v1 --output C:\KasemPrivate\kasem-pilot-v1 --seed pilot-v1
```

For a saved private snapshot, replace `--firestore --project ... --commit` with `--input C:\KasemPrivate\snapshot.json`. Add `--claims C:\KasemPrivate\claims.json` for offline grammar claims. Pin `--as-of` to a full ISO timestamp to reproduce an offline snapshot. Offline artifacts are not registered as ready model releases.

The exporter writes translation, preference, grammar and evaluation JSONL for train/validation/test, plus a restricted manifest. Grammar rows contain either independently approved resolved annotations or separately supported scoped claims; they are distinguishable by the `annotations` and `claim` fields. Evaluation items retain accepted natural alternatives. Models receive task content, not consent records or reviewer identities. The manifest retains restricted lineage and source/permission/content hashes.

The default split is 80/10/10, configurable with `--train-percent` and `--validation-percent`. Connected sources, explicit families, matching surfaces and similar English formulations stay together. Existing partition assignments, including training assignments, persist across releases. A newly discovered bridge between incompatible prior partitions blocks export. Curators should review coverage and plan deliberate held-outs before a pilot; percentage allocation alone does not guarantee balanced dialect or construction coverage.

Firestore export registers the release, locks partitions transactionally, checks current evidence and writes immutable files before marking it ready. Interrupted or invalidated releases cannot pass preflight. Output directories must be new. Keep failed artifacts quarantined and rerun under a new release ID after resolving the cause; do not manually mark an incomplete release ready.

Immediately before using a release:

```powershell
npm.cmd run kasem:dataset -- verify --project YOUR_PROJECT_ID --manifest C:\KasemPrivate\kasem-pilot-v1\manifest.json --run experiment-v1 --model PINNED_MODEL_ID --prompt PROMPT_VERSION --commit
```

Verification checks file hashes, registered manifest, current permissions, revisions, reviews and claim status. It registers a preflight record; it does not train a model. Later evidence revision, review changes, withdrawal or claim disputes invalidate affected releases. Expiry is rechecked at use. The model/release link supports subsequent remediation; withdrawing data cannot undo an already completed training run.

## Blinded evaluation

Prepare private predictions with `id`, `variant`, `input` (`english`, `dialect`, `context`), `response`, and `construction`. Use evaluation item IDs from the held-out release. Capture the pinned model and prompt versions alongside the run. Then:

```powershell
npm.cmd run kasem:dataset -- blind --input C:\KasemPrivate\predictions.json --output C:\KasemPrivate\blind-v1
npm.cmd run kasem:dataset -- evaluate --input C:\KasemPrivate\judgments.json --key C:\KasemPrivate\blind-v1\private-key.json --output C:\KasemPrivate\evaluation-v1
```

Share only `reviewer-tasks.json` with the reviewers. Retain `private-key.json` privately. A private `--seed` makes task order reproducible. Each judgment provides `taskId`, pseudonymous `reviewer`, and separate booleans for `meaning`, `grammar`, `naturalness`, `contextFit`, and `appropriateAbstention`. Duplicate reviewer/item/variant judgments are rejected. Results provide counts per model variant, dialect and construction; keep denominators and reviewer disagreements visible when interpreting them.

Next operational step: collect a small consented speaker pilot, review coverage and disagreements, and choose linguistic evaluation thresholds with those reviewers. No automatic lexical harvesting is performed from sentence glosses; uncertain particles and suggested sense links remain evidence for review.
