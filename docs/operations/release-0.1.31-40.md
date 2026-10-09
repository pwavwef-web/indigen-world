# Production release 0.1.31+40 — 2026-10-09

Status: all 14 scoped Functions deployed and verified ACTIVE; all three Hosting
sites deployed and their served HTML/entry JavaScript verified against local
builds. Signed production AAB built and verified against the existing upload key.
No Play upload, main merge, production backfill or Blogger publication occurred.

## Verified Android artifact

Build completed at 18:23 UTC; independent identity/signing verification completed
at 18:41 UTC on 2026-10-09. Existing `npm run build:mobile-aab` exited 0.

| Fact | Value |
| --- | --- |
| Version | 0.1.31, version code 40 |
| Package | com.indigenworld.indigen |
| Min / target SDK | 24 / 36 |
| ABIs | arm64-v8a, armeabi-v7a, x86_64 |
| Size | 102,614,567 bytes (97.9 MiB) |
| SHA-256 | d912349da654ca7693341308de5bfb18dd9dade727ac1a0bf296691849ca4cab |
| Signing | jarsigner verified; certificate matches existing upload keystore |
| Certificate SHA-256 | 2796c47004b28bdfaca8ef1704fc4d97bedb11158d831a065edbacceddeaa23f |

Canonical output: `apps/mobile/build/app/outputs/bundle/productionRelease/app-production-release.aab`.
Versioned identical copy: `.tooling/ten-shipping/release/indigen-0.1.31+40.aab`.
Both are ignored artifacts in the isolated Desktop worktree; neither was committed.

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
- Final focused mobile 79/79 pass, including in-flight closing-save regression.
  Flutter analysis retains exactly three existing experimental audio warnings.
- The final Downloads capture test passed and its readable title/body/actions
  were inspected. The post contains this actual asset with test-font/synthetic
  fixture credits. Physical-device tests unavailable.
- Functions rebuilt successfully. Existing 655 helper/21 emulator/browser results
  are in `ten-improvements-verification.md`. Required public sentence and reviewer
  index definitions were found in live metadata, and direct live API verification
  confirmed READY before client deployment.

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
checks confirmed Pub/Sub/Eventarc identities ready. No permissions, TLS checks or
release checks weakened. Node 22 SDK deployment completed at 17:32 UTC. Live
verification at 17:34 UTC found all 14 ACTIVE with the same source hash
`616a26e17f7476fd4843e14d2f18bd9d6b62f0e3`, Node22 and candidate flag false.
Reviewer and sentence indexes are READY. All three submission endpoints returned
401 UNAUTHENTICATED without an account; no production records were created.

The first Hosting predeploy attempts failed before upload because the Windows
cross-env hook treated command arguments as a filename. Three ignored .cmd
wrappers now call the same existing package checks using the absolute npm path.
No checks were skipped. Hosting completed17:47 UTC from6dd6b6a, and verification
at17:48 UTC confirmed200 and byte-identical HTML/entry JavaScript on
https://indigen-world.web.app, https://kasem-dictionary.web.app and
https://tribestudio.web.app. Responses include HSTS and nosniff. Root cache headers
remain the existing3600s on website/dictionary and no-store on Studio.
The first cold-cache Android build failed at video_thumbnail's removed jcenter()
call after44m53s. Commit03519b2 vendors the same0.5.6 runtime with MIT attribution,
Maven Central/shared AGP compatibility and the same namespace. Pub resolution
changed only that dependency's source; no other package versions changed.
The second Android attempt exited1 after13m07s: the SQLite3.5.1 native hook
rejected a truncated Android x64 download. A fresh official GitHub release asset
was1808568 bytes and matched the package-pinned SHA256
`949965f0eba976f707ae364cdcb42c342b5f0626081f8d7f0378fb7b52848772`.
Only that verified binary was cached in this worktree; the bad temporary file was
removed. Package checksums, architectures and native asset protections remain intact.

## Resume commands/state

Ignored scripts/logs/config/results: `.tooling/ten-shipping/release/`.
`deploy.mjs functions` / `deploy.mjs hosting` use sanitized environment and explicit
project/targets. `deploy-api.cjs` is a diagnostic SDK deployment with narrow error
messages; do not dump credentials, `.env`, raw debug logs or live function payloads.
`build.mjs` uses the isolated pinned SDK/JDK21 and existing `build:mobile-aab` script.

Final session 98719 completed: locked restoration 0, analysis 1 (same three baseline
warnings), focused 79/79 with exit 0, capture 0. Build session 67484 and independent
artifact verification 84357 completed with exit 0. No release process remains active.
Other projects' original SDK/processes were preserved. Ignore the superseded failed
build/preflight sessions; their exact failures and repairs are documented above.

Repeat local checks with `npm run verify:ten-shipping -- --web --emulator --mobile --browser`.
Prerequisites and per-step exit codes are in `ten-improvements-verification.md`.
Repeat the AAB with `npm run build:mobile-aab`: pinned Flutter 3.47.0 on PATH,
Android SDK/NDK from the existing project pins, JDK 21, ignored production Firebase,
signing and AdMob configuration. Exit 0 confirms the build; nonzero is a failure.
The existing script prints artifact identity/hash/signature facts. Also compare the
public bundle certificate with the upload keystore before uploading to Play.

Physical-device audio, real Google sign-in return and authorized production
reviewer/App Check workflows remain unverified. The index reader is disabled pending
the separately authorized dry run/backfill/readiness sequence. GitHub Actions billing
blocked prior CI; unstarted jobs are not passing. AAB generation is not a Play release.

Rollback: previous Hosting releases; compatible old Functions source while retaining
private retry receipts. Candidate flag stays off and no source data is rewritten.
