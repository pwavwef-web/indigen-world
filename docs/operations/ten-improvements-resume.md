# Ten shipping improvements — 2026-10-08

Branch: `codex/ten-shipping-improvements`; base `8e805e4` (`origin/main`).
Isolated checkout: `C:/Users/DELL/Desktop/indigen-world-ten-shipping`.
The original checkout has 159 pre-existing changed/untracked paths. Do not stage,
reset, or copy those changes into this branch. No production mutations authorized.

| Task | Implementation locations | Checkpoint |
| --- | --- | --- |
| 1. Account-scoped drafts | Studio dictionary/expressions/campaign/knowledge editors; mobile contribution stores | In progress: audit |
| 2. Review queue and evidence | `contributor/review/ReviewDesk.tsx`, review callables | Pending |
| 3. Contribution timeline/corrections | contributor ContributionsPage, expressions receipts | Pending |
| 4. Public reference search/sources | kasem-dictionary App, website DictionaryPage | Pending |
| 5. Bounded grounding candidate index | functions kawuri-grounding, knowledge resolver, emulator fixtures | Pending |
| 6. Ten progress CTA destinations | website progress registry, Studio route guards | Pending |
| 7. Downloads playback | mobile downloads repository/providers, music controller | Pending |
| 8. Low-data preference | mobile media_preferences, Settings, reels/community | Pending |
| 9. Console consistency/accessibility | shared tokens, edited contributor/review screens | Pending |
| 10. Regression runner/release handoff | scripts, synthetic emulator tests, release post | Pending |

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
