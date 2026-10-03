# Kawuri corpus operations

## Default deployment state

Absent `knowledgePolicies/current`, policy is closed. Capture and private review preparation work, sentence submissions are blocked, scoped review grants are ineffective, and reference/retrieval/export responses contain no new corpus releases. Do not manufacture governance approval to populate an empty reference view.

Firestore corpus collections remain server-only through the existing default-deny rules. New Storage originals use `knowledgeAudio`. Deploy the new indexes for progress counts together with the backend before the portal. `KNOWLEDGE_WORKSPACE_WRITES=false` pauses ordinary saves/reviews/releases; withdrawal and revocation remain available.

## Policy and role administration

The `configureKnowledgeGovernance` callable requires a `super_admin` claim and a decision reference in `reason`. It records immutable policy versions, grant history and governance events. The `policy` action accepts an approved policy with version, approvedCategories, sentenceEnabled, reviewerQuorum (1–20), all seven requiredChecks, and approved destinations. Required checks are original, meaning, context, provenance, rights, relationships and audio. Enabling sentences additionally requires the explicitly approved sentencePrefix (distinct from the nine existing prefixes) and sentenceSchemaVersion. Do not treat the test fixture policy or its synthetic prefix as a production recommendation.

The `grant` action accepts an account UID and an explicit active flag, category list, scope list (language, culture, curation, release), future expiry and qualification evidence reference. A grant is bound to the current policy version. A new policy requires renewed grants. Administrative account access is not itself a linguistic qualification. Grants can be deactivated without deleting their evidence history. Keep evidence references private; collect no unnecessary contact information.

Reviewer scope grants currently cover a category rather than individual task assignments. Reviewers confirm the checklist within their scope. The approved operational procedure must define qualification checks, assignment, conflicts, appeals and escalation before enabling grants. The software disallows self-authentication.

## Clean release preparation

Install the lockfile dependencies with `npm ci` and build `npm run build:web-ui` before portal checks. The Hosting predeploy hook builds console-ui and runs the production-main gate plus TribeStudio checks. Deploy from a clean checkout matching `origin/main`. When the multi-site Firebase configuration invokes unrelated Hosting hooks, use a temporary configuration containing only the existing TribeStudio Hosting entry, preserving its predeploy commands, headers and rewrites. Deploy the corpus backend, Storage rules and indexes before releasing the portal. Verify both domains and callable gates; record evidence in the dated release post.

## Verification commands

1. `npm run test:contracts`
2. `npm run build:functions`
3. `node --test firebase/tests/knowledgeCorpus.test.mjs`
4. `node scripts/test-knowledge.mjs` — uses the demo-only Firestore emulator on port 8187; tests callable handlers and security rules, never production data.
5. `npm run check:tribestudio`
6. For visual inspection, start TribeStudio in development and open `/contributor/preview/corpus`. This route is development-only and labels all data as synthetic. Check 360, 768 and 1440 px, keyboard navigation, form errors, source glyphs and submission receipt. For the automated browser check, start Vite on port 5189, set PLAYWRIGHT_MODULE_PATH to the installed Playwright package.json and optionally BROWSER_EXECUTABLE to a browser executable, then run `node apps/tribestudio/scripts/knowledge-browser.mjs` from the repository root. The preview deliberately disables uploads, authentication and release; test those against emulators/designated staging records.

Runtime checks include missing source/rights states, unknown protected fields, stale concurrent writes, idempotency, no automatic Gold, scoped review, forbidden direct reads/writes, exact typed release, reviewer revocation, withdrawal, invalid relationships and held-out-family separation. Tests use synthetic strings, not purported verified Kasem examples or private recordings.

## Migration and rollback

1. Export legacy records, revisions, media metadata and the revocation ledger into a restricted location. Keep exports out of Git. Preserve existing stable IDs and original media generations.
2. Run `node scripts/audit-knowledge-migration.mjs input.json report.json`. The output path must be new and different from the input. This is a local dry run; it reports every ID, checksum, category, unresolved rights and missing relationship. It does not connect to production or update data.
3. Require `inputCount === accountedCount`, explain every quarantine/missing link, reconcile source/media checksums, and approve mappings. Legacy approval never automatically becomes qualified Gold. Expressions and sentences retain their category. Ambiguous data stays quarantined.
4. Pilot each approved category with actual contributors and qualified reviewers, including regional variants and unknown/no-equivalent states. Approve evaluation coverage and unknown-answer targets before corpus grounding is expanded.
5. Before any future migration write, take a restorable snapshot, rehearse restore, replay revocations, and compare consumer results. No bulk migration writer is included because mapping, retention and governance are unresolved.
6. On regression, pause writes, revoke affected releases, and redeploy a verified safe commit. Do not roll back to the old automatic-Gold or legacy-Labs release paths while leaving corpus releases enabled. Preserve the revocation ledger across restore; re-enable consumers only after rights and exact-revision checks pass.

## Support and limitations

Investigate a receipt by stable ID and revision. Inspect append-only events, review rationale, current policy/grants and media generation before changing anything. A stale edit is a recoverable conflict: reopen the latest record and reapply intended changes. Do not overwrite submitted snapshots or original recordings.

Track backlog, returns, missing provenance, rights denials, duplicate/variant warnings, unavailable media and stale relationships by category. Baselines and alert thresholds need pilot evidence. Count volume does not establish linguistic quality.

Revocation cases identify affected records/destinations and preserve historical export manifests for investigation. Operations must reconcile previously exported copies and any models outside the live consumer path. No automatic training, model unlearning, retention deletion, full-text index or alias merge is claimed in this release. Local browser draft storage is not enabled; saved drafts are server-side, unsaved offline text stays only in the open editor.
