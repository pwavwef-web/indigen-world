# Ten shipping improvements — latest checkpoint 2026-10-09

Branch: `codex/ten-shipping-improvements`; base `8e805e4` (`origin/main`).
Isolated checkout: `C:/Users/DELL/Desktop/indigen-world-ten-shipping`.
The original checkout has 159 pre-existing changed/untracked paths. Do not stage,
reset, or copy those changes into this branch. No production mutations authorized.

| Task | Implementation locations | Checkpoint |
| --- | --- | --- |
| 1. Account-scoped drafts | Studio dictionary/expressions/campaign/knowledge/legacy lexical editors; mobile four forms | Implemented; earlier checks pass; final closing-save regression blocked by shared SDK lock |
| 2. Review queue and evidence | `contributor/review/ReviewDesk.tsx`, review callables | Locally verified; actual Auth/Firestore browser and concurrency |
| 3. Contribution timeline/corrections | contributor ContributionsPage, mobile word corrections, retry receipts | Locally verified; original revision metadata auditable |
| 4. Public reference search/sources | kasem-dictionary App/source drawer and existing book destinations | Locally verified; both-book synthetic SDK browsing and restricted exclusion |
| 5. Bounded grounding candidate index | functions kawuri candidate index, resolvers, backfill, fixtures | Locally verified; 4,105-source retrieval; rollout gated and not performed |
| 6. Ten progress CTA destinations | website progress registry, offline panel, Studio route guards | Locally verified; ten category links, responsive animation and reduced motion |
| 7. Downloads playback | mobile downloads repository/providers, main, music controller | Locally verified; device playback unavailable |
| 8. Low-data preference | mobile media_preferences, Settings, reels/community | Locally verified; zero optional allocations and deliberate video failure path |
| 9. Console consistency/accessibility | existing shared tokens, edited contributor/review/reference screens | Locally verified; three-width screenshots, focus, overflow and modal checks |
| 10. Regression runner/release handoff | scripts, synthetic emulator tests, release post | Handoff ready; final mobile rerun blocked; baseline analyzer warnings and CI billing retained |

Read: root AGENTS, CONTRIBUTING, SECURITY; product boundaries; contributor portal;
progress pipelines; grounded answers; data safety/licensing; repository architecture;
ADRs 0001/0002. No nested AGENTS found in tracked files.

Environment: Node 24.12.0 (Functions requests Node 22); Java 25 installed;
Flutter 3.47.0/Dart3.13.0 match the pin. See the final verification handoff for
toolchain, device and CI limits. The sections below are historical checkpoints;
`ten-improvements-verification.md` and checkpoint 5 are authoritative current status.
GitHub Actions `37818505086` has no steps: annotation explicitly says account locked
due to billing. Local checks remain required; this is not passing CI.

Commands so far: git status/branch/worktree/log/fetch; npm ci --ignore-scripts
(running at first checkpoint); read-only gh runs/jobs/check annotations.

Rollout and rollback details will be added with each verified slice. Do not deploy,
publish, merge, run production backfills, or send external messages.

## Checkpoint 2 (implementation, not release)
Implemented: scoped explicit Studio draft recovery and stable dictionary/expression retries;
review counts/paged queue/source panel; contribution round timeline; public sentences/rules
and source links; opt-in hashed candidate index with resumable dry-run backfill;
jar destination category routing; local Downloads queue/repair/access gates; device low-data mode.
Remaining: mobile contribution recovery audit/integration; reference illustration catalog;
review/browser/cross-account acceptance; CSS and synthetic screenshots; reproducible runner;
release post with images. No deployment or production backfill has occurred.
Checks: Studio typecheck + 68 workflows passed; functions build passed; 30 grounding/corpus unit tests passed.
Dictionary check exposed an outdated static query assertion (repair in progress).
Flutter pub get passed with pinned 3.47.0/Dart3.13.0. Analysis reports baseline knowledge
workspace lints/warnings plus a new errors.add typo and import ordering to repair.
Emulator suite shipping.integration.test.mjs and targeted Flutter tests currently running.
Use isolated worktree above; original 159 paths remain protected. CI billing still blocks jobs.

## Checkpoint 3 — 2026-10-09
All ten areas have implementation changes. Mobile forms now have explicit account
recovery (collection, word queue, grammar annotation and knowledge); legacy lexical
editor also migrated. Original checkout remains untouched. No live changes.
Passed: website/dictionary/shared/admin types and builds, 22 contract fixtures;
15 mobile downloads/preferences/queue tests plus 2 recovery tests; 19/20 emulator
cases (last failure is an archive-before-approval test sequence, now repaired).
Full helper baseline: 637/640 passed; ignored local word seed and ffmpeg-static
binary missing after ignore-scripts install. Generated local ignored seed with
existing builder, rebuilt ffmpeg-static; rerun required. No book ingestion run.
Remaining verification: final Studio assertion/build, mobile widget capture and
analysis, browser recovery/source/responsive capture, final emulator rerun, helper
rerun, low-data request widget proof, reviewer capture, release post and rollout
document. Running sessions 15477 Studio, 65282 analysis, 29775 browser, 95437
Downloads widget. Runner scripts/verify-ten-shipping.mjs records per-check codes;
logs in ignored .tooling/ten-shipping. Need separate results per invocation so
web/emulator invocations do not overwrite summary. Flutter devices: Windows,
Chrome, Edge only; Android/iOS physical playback unverified. Node24 host vs
Functions Node22 target noted. Keep checkpoints; do not deploy/backfill production.


## Checkpoint 4 — resumed after usage reset, 2026-10-09

Preserve the original checkout. Branch/worktree/base remain as above. Last committed
checkpoint: `6a7ef92`. Latest changes are uncommitted, including browser/mobile
regressions, recovery retry refinements and the release post with actual screenshots.

Passed after resume: Studio, dictionary, website, admin and shared builds/types;
22 contract fixtures; functions helper 655/655 (before latest word correction refinement);
main browser three widths/refresh recovery/Unicode/ten signed-out category destinations;
progress browser 320–1440px, all views, motion/focus/popup checks; reviewer browser with
real Auth/Firestore emulators now exits 0 after explicit Firestore termination;
low-data actual media widget test passed (zero optional requests, deliberate video
request, synthetic network failure). Existing mobile repository/recovery/Downloads
checks passed in checkpoint 3. Final Flutter analysis/focused runner still running.

New concrete fixes pending final checks: word queue durable account-scoped retry
receipts (including corrections), recovery entry visible offline, preserve completed
owned uploads; correction revision preconditions and full earlier metadata history;
prefill lexical details on correction; dictionary phone source dialog inert background
and focus wrap. Emulator word test failure was fixture status then expected notification
count (real review adds a notice); fixed to use actual reviewer REQUEST_REVISION and
expect three notices across arrival/review/correction, no retry notice. Rerun required.

Release content: `apps/updates-blog/posts/2026-10-09-reliable-contribution-and-reference-workflows/`
now has `post.html`, `README.md`, `share.md`, real screenshots at three widths and actual
Flutter widget evidence. NOT deployed, published or shared. Review images and finalize
`ten-improvements-verification.md` after final results. Candidate deployment/rollback:
`docs/operations/kawuri-candidate-rollout.md` (flag + readiness gated, no production run).

Current sessions: 2201 web/mobile runner (web passed; Flutter startup/analysis delayed),
20864 focused queue screen test waiting for Flutter lock. Last emulator/browser run
99549 completed: build/functions and all browser groups 0, emulator failed only the
notification assertion now repaired. Avoid repeating unchanged browser checks.
Run `npm run verify:ten-shipping -- --emulator` after latest functions edits; finish
Flutter and full helper checks. Runner strips live credential environment for children.

Security follow-up: an inherited API key accidentally appeared in a diagnostic log
excerpt during shutdown investigation; user notified to rotate it. Local log removed,
runner now allowlists tool environment. Never repeat the key or read raw Firebase
logs with environment context. No key was used or committed. Logs remain ignored.

CI latest main run 37818504989 (8e805e4) has no executed steps and failure; billing
blocker previously verified. Flutter3.47.0/Dart3.13.0 pinned match; no Android/iOS
physical device, some Android SDK licenses unaccepted, no Visual Studio toolchain.
Node24 host vs functions Node22 target remains a disclosed toolchain difference.

## Checkpoint 5 — final review, 2026-10-09

Implementation commits: d6a570b, ebe63cd, 6a7ef92, a635095, 2c1c35e.
Authoritative detailed table, commands, rollout and boundaries:
`docs/operations/ten-improvements-verification.md`.
All ten requested areas have working changes. Original checkout still has 159
pre-existing dirty paths, untouched. No push/PR/deploy/backfill/live writes.
The unused managed worktree at `.codex/worktrees/ten-improvements/indigen-world`
was verified clean at base 8e805e4 and queued for archival; the Desktop isolated
worktree above is the review branch and must be retained.

Passed: Studio, dictionary, website, admin/shared builds/types, 22 contracts,
latest full functions helpers 655/655, shipping emulator21/21. Main browser and
progress animation/layout suite pass; final reviewer+public reader browser exits0
(real SDK requests, synthetic both-book records, stable URLs, restricted refusal,
concurrent verdict/count/queue-position behaviour).
Mobile focused78/78 passed before the final closing-save edge-case refinement.
Final stable full Dart analysis using pinned SDK reports only three existing
experimental audio warnings; targeted changed files have no issues. Intermediate
Flutter analysis during edits included duplicated baseline warnings and test
import-order info; that import was corrected and final Dart analysis verified it.

Latest refinement serializes a closing draft's captured final edit after any
in-flight save. Added fourth recovery test; expanded focused suite now has79 tests.
Flutter test reruns waited more than15 minutes behind another project's shared SDK
startup lock. Only our waiting processes31328/26608 and their children were stopped;
the unrelated owner29672 was preserved. Sessions49366/74911 are now closed exit1,
not passing. Do not stop the other project or bypass the cache lock. Nothing from
this session is still waiting on Flutter; rerun when the SDK is available.
Runner results/logs: ignored `.tooling/ten-shipping/results-mobile.json` and
`flutter-focused.log`. Capture command:
`SHIPPING_EVIDENCE_DIR=<absolute isolated .tooling/ten-shipping/screenshots>` then
`flutter test --no-pub test/features/downloads/downloads_widget_test.dart` in mobile.
After it passes copy `mobile-downloads-test.png` into the release images, inspect
readable text/icons, add its caption/credits to the post and record/commit results. The
unreadable earlier Ahem mobile image was excluded; the post has four actual web
images, and12 width variants. Test uses existing
app theme and SDK Roboto fallback, not a physical-device font claim.

Reproduction: `npm run verify:ten-shipping -- --web --emulator --mobile --browser`.
Prerequisites/exit codes in verification note. Baseline analysis warnings keep
aggregate exit1; GitHub main37818504989 had no steps due account billing. Flutter
pin3.47.0/Dart3.13.0 match; no handset attached, Android licenses partly missing,
no Visual Studio Windows build toolchain. Node24 host versus Functions Node22.
Google OAuth, deployed HTTPS/App Check and physical mobile runtime remain unverified.

Release post with actual web captures is prepared under
`apps/updates-blog/posts/2026-10-09-reliable-contribution-and-reference-workflows/`.
No external publication/sharing. Candidate index is flag+readiness gated; follow
`kawuri-candidate-rollout.md`; no production backfill. Legacy sentence family graph
still safely withholds that source beyond4000 rows. Keep private retry receipts on
rollback. Security follow-up remains key rotation after earlier diagnostic exposure;
no key value in notes/Git, no usage, runner strips live credential environment.

Local implementation/checkpoint work is preserved. Remaining work is the79-test
focused mobile rerun and readable capture, followed by staging/device checks with
their prerequisites. No live deployment, backfill, release or sharing was authorized
at that checkpoint. The following release checkpoint supersedes that restriction.

## Authorized production release checkpoint — 2026-10-09

Owner requested deployment, mobile version bump and signed AAB; explicitly allowed
this reviewed branch without merging. Tracked main-only guard stays unchanged.
Version0.1.31+40 is committed3366d7c. Flutter startup isolation resolved the prior
block: final focused79/79 passed; analysis retains three existing audio warnings.

Functions SDK deployment31795 completed0 at17:32 UTC. All14 scoped endpoints are
ACTIVE onNode22 with source hash616a26e17f7476fd4843e14d2f18bd9d6b62f0e3 and
candidate flagfalse. Read-only live metadata shows required indexesREADY; the
three submission endpoints deny anonymous calls401. No synthetic production writes.
Hosting31584 completed0 at17:47 from6dd6b6a. All three web.app sites return200;
HTML/entry JavaScript match local builds. No rules/index migration was needed.

The first AAB build4963 failed after44m53s at video_thumbnail's removedjcenter()
API. Commit03519b2 keeps version0.5.6 and unmodified runtime in a licensed local
copy, changing Android build compatibility only. Pub resolution changed one source,
no other versions. Retry16001 is currently compiling; native thumbnail compilation
has passed. Do not claim an AAB until the runner succeeds and signing is checked.
An evidence-only font refinement needs final capture after this build.

Current ignored helpers/config/results: `.tooling/ten-shipping/release/`.
After16001 completes: run `node .../verify-aab.mjs` to check version/package/archive
and matching existing upload certificate, then `node .../final-mobile.mjs` for
locked dependencies, analysis, focused79 and readable capture. Inspect image,
copy into post, update release docs with facts, commit handoff and leave clean.
All helpers use the isolated pinned Flutter/JDK21/Gradle cache and sanitized env.
No other project's SDK/process may be stopped. Main merge, Play upload, production
backfill/readiness, Blogger publication/sharing remain outside this release scope.

## Final release checkpoint — 2026-10-09, 18:41 UTC

All requested deployment and AAB preparation completed. Build 67484 exited 0 at
18:23 UTC; independent verification 84357 exited 0 at 18:41 UTC. Version 0.1.31+40,
package com.indigenworld.indigen, min/target 24/36, all three expected ABIs,
102,614,567 bytes. SHA256:
`d912349da654ca7693341308de5bfb18dd9dade727ac1a0bf296691849ca4cab`.
Jarsigner verifies; certificate matches the existing upload keystore.
Canonical AAB is in mobile/build/app/outputs/bundle/productionRelease; an identical
versioned copy is in .tooling/ten-shipping/release/indigen-0.1.31+40.aab.

Final dependency restoration, 79 focused tests and readable Downloads capture
passed. Analysis has exactly the same three baseline experimental audio warnings.
Screenshot inspected and committed in af20200 with the release-post assets.
No release process remains active; all former build/preflight attempts are closed.
Functions and Hosting are verified live as recorded above. Candidate reader stays
disabled, no production backfill or Play upload. Detailed final evidence is in
release-0.1.31-40.md; repeatable checks/table in ten-improvements-verification.md.
Remaining work requires physical device/authenticated runtime verification or
separate authorization for the index/store/community publication rollout.
