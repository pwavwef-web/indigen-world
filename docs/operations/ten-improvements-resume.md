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
