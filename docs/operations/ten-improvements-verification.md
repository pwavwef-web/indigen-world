# Ten shipping improvements: reviewer and local verification handoff

Prepared 2026-10-09. Branch `codex/ten-shipping-improvements`, isolated checkout
`C:/Users/DELL/Desktop/indigen-world-ten-shipping`, based on `origin/main` `8e805e4`.
The original checkout retains its 159 pre-existing dirty/untracked paths. No live
writes, deployment, mobile release, merge or production backfill occurred.

## Resulting behaviour and implementation checklist

| Task | Actual implementation locations and behaviour | Verification | Status |
| --- | --- | --- | --- |
| 1. Draft recovery | Studio `src/drafts`, creator Dictionary/Expressions/SubmissionNew, knowledge and legacy lexicon editors; mobile collection/word/grammar/knowledge sessions. Account-scoped explicit recovery, saving/error/retry indicators, disposal/sign-out protection and durable submission IDs. Uploaded owned references survive; unfinished files require reselecting. | Studio workflow tests, browser refresh/Unicode/consent reset; emulator retry failure/concurrent retry/cross-account checks; mobile regressions below. | Implemented; final closing-save regression blocked by shared SDK lock |
| 2. Validator queue | `ReviewDesk.tsx` uses authorized subscriptions, oldest-first queue, status totals, loaded category/search filters, 60–300 bounded loading, arrow navigation and a source/permissions/history panel. Counts refresh on queue changes; concurrent decisions lock stale controls. | Real Auth/Firestore reviewer browser, keyboard and three widths; actual decision transactions, required reasons, self-review and unauthorized rules denial in emulators. | Locally verified; HTTPS/App Check transport not exercised |
| 3. My contributions | `contributor/timeline.ts`, ContributionsPage and established correction editors show actual stored rounds/feedback. Mobile word corrections prefill lexical metadata, retain publication choice and owned uploads, check revision count, retain earlier metadata in history. | Timeline workflow/browser checks; author correction through actual rules, resubmission and authorized approval with audit; queue correction/retry emulator and Flutter form tests. | Locally verified |
| 4. Public reference | Existing kasem-dictionary categories include words, whole expressions, sentences, rules and 19 already-public illustrations. Stable record URLs, source drawer and existing book-guide anchors; honest absent metadata, original Unicode. Expiring sentence permissions are queried separately and refreshed. | Reader types/build and publication/source tests; real Firestore client fixture browsing is recorded below; restricted fixtures denied. | Locally verified; staging/live smoke test outstanding |
| 5. Grounding retrieval | `kawuri-candidate-index.ts`, fresh-source resolver, seven source triggers and dry-run/resumable backfill. Hashed exact/normalized selectors are candidates only; originals and current eligibility are re-read server-side. Flag plus readiness gating retains old retrieval during rollout. | 4,105-source emulator corpus; eligible exact match beyond old cap; stale/withdrawn/restricted/poisoned/held-out refusal; revision/grant/rights/family checks; 400-candidate limit and backfill cursor tests. | Locally verified; rollout not performed |
| 6. Ten category CTAs | Existing progress configuration retained. Studio knowledge route, dictionary/expression/campaign category preselection and safe sign-in return fixed. When totals are unavailable, ten genuine destinations remain available. Counting/targets and anonymous public events remain unchanged. | All ten signed-out routes retain category query; existing access guards/workflows; progress browser at 320–1440px, all views, reduced motion/pause/focus/modal checks. | Locally verified; real Google sign-in return not exercised |
| 7. Downloads | Existing Downloads repository/main provider/queue wiring. Direct track play, local-file lookup after restart, repair/remove and queue controls. Partial/corrupt/missing files and quota are handled; current account/entitlement gates playback and expiry pauses local audio. | Synthetic local HTTP/file/database repository and queue tests, entitlement tests and actual Downloads widget capture. | Locally verified; physical-device audio outstanding |
| 8. Low-data preference | Device-scoped Settings preference; no optional video autoplay, adjacent preload or poster decoder; existing thumbnails and tap-to-open full images; audio loads on deliberate playback. Explicit video opening remains supported with bounded initialization/error cleanup. | Real media widget test: zero optional full image/video allocations, one deliberate video request, synthetic network failure; preference persistence and autoplay tests. | Locally verified; constrained physical-network test outstanding |
| 9. Console consistency | Existing Studio shared tokens/components, clear blue recovery/timeline/evidence hierarchy, 44px actions, responsive source layout, focus styles and reduced-motion transitions. Phone reference dialog makes background inert, wraps focus and restores results focus. | Phone/tablet/desktop screenshots, no horizontal document overflow, keyboard search/queue, modal return/wrap and reduced-motion checks. Palette spot checks use existing accessible Studio fill/text/slate tokens; not a full WCAG audit. | Locally verified |
| 10. Checks and handoff | `scripts/verify-ten-shipping.mjs`, synthetic shipping integration/browser fixtures, focused Flutter tests, this document, resume checkpoints and dated release post with actual assets. | Existing web/shared/admin checks and 655 helper tests pass; 21 emulator checks pass; browser suites and earlier focused Flutter tests pass. Analyzer retains three baseline warnings. | Implemented; final mobile rerun blocked; analyzer/CI limits recorded |

## Repeatable local command

From the repository root:

```sh
npm run verify:ten-shipping -- --web --emulator --mobile --browser
```

Prerequisites: install the locked npm dependencies (`npm ci`), the pinned Flutter
3.47.0 from `apps/mobile/.fvmrc`, Java suitable for the installed Firebase CLI,
and Chrome/Edge (or `CHROMIUM_EXECUTABLE` pointing to Chromium). Flutter dependency
restoration uses `flutter pub get --enforce-lockfile`; no package upgrade is needed.
For the pre-existing full helper suite, ffmpeg-static's installer must have completed
(`npm rebuild ffmpeg-static` if dependencies were installed with ignore-scripts).
Its word-seed tests require the established ignored local English source inputs
`data/word-seed/1000-english-words.docx` and `15000-english-words-with-sentences.txt`,
and the ignored output of `node services/functions/scripts/build-word-queue.mjs`.
If these licensed supplied inputs are unavailable, that helper prerequisite is
blocked; the new synthetic emulator checks do not need them. Never commit raw
source inputs or run a seed/import against production for verification.

Use individual groups to narrow a rerun: `--web`, `--emulator`, `--mobile`,
`--browser`, or `--review-browser`. The last also checks the public reader with
published synthetic source-book fixtures. The runner continues independent groups,
records every child exit code and does not treat skipped/failed prerequisites as
passing. Overall exit 0 means all selected commands passed; exit 1 means at least
one failed; per-step 2 identifies a launch/prerequisite block (some external CLIs
also return 2 on errors, so inspect its log). Unknown options reject immediately.

Logs and timestamped per-group results are in ignored `.tooling/ten-shipping`.
The runner strips provider keys/tokens/cloud credential variables from child
processes. Emulators bind loopback, use explicit `demo-` projects and synthetic
records only. Browser screenshots block external requests. Browser preview servers
are started/reused on 5199–5201; authenticated fixture previews use 5203–5204.
Emulator configs reserve 8288/9288 and 8388/9388/9389 plus their local hubs.

## Commands and material results

| Command/check | Material result |
| --- | --- |
| `npm ci --ignore-scripts` | Passed; installer-specific ffmpeg prerequisite repaired separately. Existing npm audit reports 43 vulnerabilities; no broad upgrades made. |
| Root `check:tribestudio` | Types, publication/workflow/PWA/video unit checks and production build passed; rerun after queue-count change passed. |
| Root `check:kasena-dictionary`, `check:website` | Types, package checks and production builds passed; dictionary rerun after emulator opt-in passed. |
| `build:web-ui`, `build:console-ui`, `test:contracts`, `typecheck:admin`, `build:admin` | Passed; 22 contract fixtures valid. |
| `test:function-helpers` | Latest full rerun: 655/655 passed, including real local FFmpeg renders. Initial missing ignored seed/FFmpeg failures were local setup prerequisites, repaired. |
| `verify:ten-shipping -- --emulator` | Functions build and 21/21 isolated shipping checks passed, process exit 0. |
| `verify:ten-shipping -- --browser` / `--review-browser` | Recovery/timeline/source/modals/ten routes and existing progress motion/layout suite passed. Latest reviewer/public-source run exits 0: actual Auth/Firestore SDK queue, concurrent decision/position/count refresh; anonymous both-book fixtures, stable URLs/anchors and whole expressions/sentences/rules. Earlier reviewer shutdown timeout was fixed by terminating Firestore explicitly; not counted as a successful old run. |
| `flutter --version`, locked dependency restoration | Flutter3.47.0/Dart3.13.0 match pin. An incomplete global Pub cache temporarily blocked analysis/compilation; locked SDK/app dependencies restored without upgrades. |
| `flutter analyze --no-pub`; final `dart analyze` using pinned SDK | Stable analysis exits 1: exactly three existing `experimental_member_use` warnings for StreamAudioSource/StreamAudioResponse in knowledge_workspace_screen.dart (currently lines 1074/1079/1082). The same source is in base 8e805e4; no new errors or warnings and no suppressions. An intermediate Flutter run during edits duplicated the baseline diagnostics and caught a test import-order info; import fixed, final full Dart analysis confirms only three baseline warnings. Final targeted analysis of recovery/session and screenshot test exits 0. |
| Focused Flutter tests | Earlier 78/78 passed. Final 79-test suite and readable capture waited over 15 minutes behind another project's Flutter SDK startup lock, then only our two waiting test commands were terminated (exit1). The other project was preserved. The added in-flight closing-save regression and capture refinement are not claimed passed; final changed files have clean targeted analysis. |
| `flutter doctor -v` | Android SDK36.1 present but some licenses unaccepted; no Android/iOS physical device attached. Windows/Chrome/Edge available; Visual Studio Windows build toolchain absent. No APK/device build or playback pass claimed. |
| `gh run list/view`, annotations for main run `37818504989` | Job has no steps; annotation says account locked due billing. Unstarted CI is not passing; no account/billing changes attempted. |
| `git diff --check`, release assets/captions validation | Passed; all four embedded web images exist with descriptive alt text/captions. No release post publication or sharing. Mobile recapture blocked as described above. |

Node host is 24.12.0, while Functions builds target Node22. Local handler tests run
on the host; Node22 staging HTTPS/App Check smoke tests remain a deployment handoff.
Browser guards and client SDK requests are exercised, but the fixture reviewer
verdict uses the real trusted handler `.run` rather than the deployed transport.
Real Google OAuth, platform audio/notification behaviour, device account changes,
network throttling on a handset and mobile-store builds remain unverified.
Palette spot checks: white on Studio action blue `#2c66f5` is 4.85:1;
`#2459e6` on `#f6f7fb` is 5.38:1; slate `#5d667b` on that surface is 5.37:1.
These checks support the affected text/action treatments, not a full contrast audit.

## Rollout and rollback (not performed)

1. Deploy backward-compatible submission functions (retry receipts/correction
   preconditions) before shipping the new contribution clients. Receipts are
   private under existing default-deny rules; no permission relaxation or data
   rewrite is needed. Retain receipts during rollback so ambiguous retries do not
   create another record. Existing audit/revision records remain intact.
2. Review `firebase/firestore.indexes.json`: the status/created-time reviewer index
   and sentence status/projection/expiry index already exist. Ensure these indexes
   are ready before client rollout. No new composite index was invented here.
3. Grounding is a separate gated rollout: follow `kawuri-candidate-rollout.md`.
   Candidate triggers precede a reviewed dry run and resumable backfill; readiness
   precedes enabling `KAWURI_CANDIDATE_INDEX`. This branch has not enabled either.
4. Deploy web clients after compatible functions/index readiness, verify signed-in
   recovery/review/correction and current public sources in staging, then prepare a
   mobile build after device tests. No database schema migration is needed for
   Downloads/preferences; current subscription authority remains required.
5. Roll back web/mobile clients if necessary while keeping compatible server retry
   support. Disable the candidate flag/readiness to return grounding to its original
   reader. Sources and permissions remain authoritative throughout.

Candidate retrieval admits at most 12 selectors and four pages of 100 candidates,
with one-page lookahead and fresh source batches of 100. It reports truncation;
it is not a promise of exhaustive fuzzy search. The existing legacy sentence
family computation still withholds that source beyond 4,000 rows rather than use
an unsafe partial graph. Other indexed sources are independent. Practice's existing
reader is unchanged. No permission-sensitive eligibility cache was introduced.

## Screenshots and community handoff

`apps/updates-blog/posts/2026-10-09-reliable-contribution-and-reference-workflows/`
contains `post.html`, `README.md`, `share.md` and phone/tablet/desktop screenshots
of recovery, history, reviewer evidence and public reference. The earlier mobile
widget render used Flutter's block-glyph Ahem font and was unsuitable for sharing;
the readable recapture could not run while the shared SDK lock was held.
The grammar figure is an existing public source illustration with its original
attribution/context. Screenshots are implementation evidence, not proof of a live
release. Blogger upload/replacement steps and credits are in the post README.
The prepared mobile capture test uses the real app palette with SDK Roboto as a
readable test font fallback; both that capture and physical rendering are unverified.

Remaining local verification: after the other project's Flutter command releases
the SDK lock, run `npm run verify:ten-shipping -- --mobile`. The expected baseline
analysis warnings still yield aggregate exit1; inspect `flutter-focused` separately.
Then set `SHIPPING_EVIDENCE_DIR` to the absolute ignored screenshot directory and
run the Downloads widget test to capture/inspect an image before adding it to the post.

No PR was opened or branch pushed in this session. Checkpoints are local commits;
`ten-improvements-resume.md` preserves the audit and any remaining work.
