# Production release 0.1.31+40 — 2026-10-09

Status: all14 scoped Functions deployed and verified ACTIVE. Hosting and signed
AAB preparation still in progress; no completed Hosting/AAB claimed yet.

The owner explicitly requested deployment, a version-code bump and a new release
AAB. They then authorized deploying the reviewed branch without merging, as a
one-time exception to `scripts/verify-production-main.mjs`. The tracked guard is
unchanged. The temporary ignored Firebase config retains normal web build checks,
headers and rewrites, and selects only the affected Hosting sites.

Source: `codex/ten-shipping-improvements`, isolated Desktop worktree. Version bump
`3366d7c` changes `0.1.30+39` to `0.1.31+40`; screenshot fixture refinement is
`f5c4024`. Original checkout/concurrent work remain protected. No main merge, Play
upload, Blogger publication, production source ingestion or backfill is authorized.

## Verified local release preparation

- Existing production upload signing, Firebase Android package
  `com.indigenworld.indigen` and four AdMob placements resolved through ignored
  local configuration; no passwords/identifiers committed or printed in full.
- Pinned Flutter3.47.0/Dart3.13.0 has an isolated SDK checkout/cache under ignored
  `.tooling/ten-shipping/flutter-release-sdk` because another project's original
  SDK remains locked. A separate Gradle cache avoids the previously corrupt journal.
- Final focused mobile79/79 pass, including in-flight closing-save regression.
  Flutter analysis retains exactly three existing experimental audio warnings.
- The Downloads capture test passed; a label-font refinement needs recapture after
  the AAB build releases this isolated SDK's lock. Physical-device tests unavailable.
- Functions rebuilt successfully. Existing 655 helper/21 emulator/browser results
  are in `ten-improvements-verification.md`. Required public sentence and reviewer
  index definitions were found in live metadata; CLI did not report READY state.

## Deployment scope and safeguards

Project: `project-kassena-7e026`. Functions: submitCollectionContribution,
submitExpression, submitWordTranslation, resolveKnowledgeRecords,
exportKnowledgeRecords, labsApi, kawuriChat, and seven on*Candidate triggers.
Hosting: indigen-world, kasem-dictionary, tribestudio. Backend precedes clients.
Existing Functions environment retained privately; candidate reader explicitly
disabled. No readiness change or production backfill; old retrieval remains active.
The new candidate triggers are transactional/idempotent and have retry enabled;
the CLI's failure-policy confirmation is accepted only for these scoped targets.

Earlier preflight attempts encountered intermittent Google API request failures at Pub/Sub
identity generation, function listing and Secret Manager metadata. Direct authenticated
checks confirmed Pub/Sub/Eventarc identities ready. Deployment completion still needs
fresh live state verification. No permissions, TLS checks or release checks weakened.
The Node22 SDK deployment completed successfully at 17:33 UTC. Live verification
at 17:34 UTC found all14 ACTIVE with the same source hash
`616a26e17f7476fd4843e14d2f18bd9d6b62f0e3`, Node22 and candidate flag false.
Reviewer and sentence indexes are READY. All three submission endpoints returned
401 UNAUTHENTICATED without an account; no production records were created.

The first Hosting predeploy attempt failed before upload because the Windows
hook could not locate npm. The ignored config now uses its absolute npm.cmd path.
The first cold-cache Android build failed at video_thumbnail's removed jcenter()
call after44m53s. Commit03519b2 vendors the same0.5.6 runtime with MIT attribution,
Maven Central/shared AGP compatibility and the same namespace. Pub resolution
changed only that dependency's source; no other package versions changed.

## Resume commands/state

Ignored scripts/logs/config/results: `.tooling/ten-shipping/release/`.
`deploy.mjs functions` / `deploy.mjs hosting` use sanitized environment and explicit
project/targets. `deploy-api.cjs` is a diagnostic SDK deployment with narrow error
messages; do not dump credentials, `.env`, raw debug logs or live function payloads.
`build.mjs` uses the isolated pinned SDK/JDK21 and existing `build:mobile-aab` script.

Current session16001 reruns mobile capture and signed AAB with the compatible
plugin and existing Gradle cache. Sessions4963/61597 ended with the specific
Android/predeploy failures above;31795 Functions deployment ended0. Other
project's original SDK owner29672 must not be stopped. Shell PATH initially
omits Flutter; use the isolated SDK bin and Android Studio JDK bin explicitly.

After successful backend deployment, inspect all14 targets ACTIVE and smoke missing
auth guards without creating records or invoking paid model calls; deploy Hosting,
then compare served asset hashes with local files. After build, verify archive signing
matches the existing upload key, package/version40, ABIs, size and SHA256; retain a
versioned copy of the new AAB. Do not present a stale/debug-signed bundle as a release.
Recapture/inspect mobile image, add image/caption/credits to the grouped release post,
update verified deployment/artifact facts, commit handoff and leave branch clean.

Rollback: previous Hosting releases; compatible old Functions source while retaining
private retry receipts. Candidate flag stays off and no source data is rewritten.
