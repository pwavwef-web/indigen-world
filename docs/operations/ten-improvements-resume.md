# Ten shipping improvements — 2026-10-08

Branch: `codex/ten-shipping-improvements`; base `8e805e4` (`origin/main`).
Isolated checkout: `C:/Users/DELL/Desktop/indigen-world-ten-shipping`.
The original checkout has 159 pre-existing changed/untracked paths. Do not stage,
reset, or copy those changes into this branch. No production mutations authorized.

| Task | Implementation locations | Checkpoint |
| --- | --- | --- |
| 1. Account-scoped drafts | Studio dictionary/expressions/campaign/knowledge editors; mobile contribution stores | Implemented in Studio, remaining mobile form audit |
| 2. Review queue and evidence | `contributor/review/ReviewDesk.tsx`, review callables | In progress; acceptance checks pending |
| 3. Contribution timeline/corrections | contributor ContributionsPage, expressions receipts | In progress; acceptance checks pending |
| 4. Public reference search/sources | kasem-dictionary App, website DictionaryPage | In progress; acceptance checks pending |
| 5. Bounded grounding candidate index | functions kawuri-grounding, knowledge resolver, emulator fixtures | In progress; acceptance checks pending |
| 6. Ten progress CTA destinations | website progress registry, Studio route guards | In progress; acceptance checks pending |
| 7. Downloads playback | mobile downloads repository/providers, music controller | In progress; acceptance checks pending |
| 8. Low-data preference | mobile media_preferences, Settings, reels/community | In progress; acceptance checks pending |
| 9. Console consistency/accessibility | shared tokens, edited contributor/review screens | In progress; acceptance checks pending |
| 10. Regression runner/release handoff | scripts, synthetic emulator tests, release post | In progress; acceptance checks pending |

Read: root AGENTS, CONTRIBUTING, SECURITY; product boundaries; contributor portal;
progress pipelines; grounded answers; data safety/licensing; repository architecture;
ADRs 0001/0002. No nested AGENTS found in tracked files.

Environment: Node 24.12.0 (Functions requests Node 22); Java 25 installed;
Flutter pin is 3.47.0. SDK availability/version needs verification.
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
