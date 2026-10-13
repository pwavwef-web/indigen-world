# Contribution studio — 13 October 2026

Implemented in the repository; production deployment and a signed-in production
check are pending. This is the contributor portal redesign requested in the
20-change plan. The editor uses Understand → Translate → Context → Check & send.
The home screen uses one composed grid, with a next-action hero, approved-work
vessel, participation, daily work, missions, recognition, review learning,
community progress, practice and activity.

## What each planned change delivers

| Plan | Implementation |
| --- | --- |
| 1–3: sections, visual design, visible controls | Four freely accessible sections; animated navigator, persistent phone source/navigator, sticky actions, theme-aware surfaces, shared blue brand tokens, readable Kasem fields. |
| 4: next useful action | Current assignment retains returned-work priority, then deadline priority; the home hero links directly to the next item. |
| 5: small sessions | Three or five successful submissions per session, a deliberate stopping point, and a new-session action. Skips do not count. Daily batches retain their existing 15 + 15 allocation rules. |
| 6: practice | A guided usage-context exercise using an English prompt, with an explanation of speaker/listener/situation. Practice completion is saved privately; it produces no corpus row or reward. No invented Kasem is used. |
| 7–9: useful metadata | Bounded speaker, listener, situation, tone, literal meaning, language variety, alternative labels and variant explanation. Existing free usage notes remain editable. |
| 10: character support | Existing dictionary spelling assistance is retained; the Kasem character strip appears with translation/context fields and writes into the active field. |
| 11: uncertainty | Optional reasons accompany the existing private skip flow. No translation, consent, submission or reward is created by skipping. |
| 12–13: readiness and duplicates | Transparent presence/save/permission checks and optional context/variety suggestions. Same-assignment Unicode-normalised duplicate hints; explicit exact-publication check returns public content only. Variant decisions stay with reviewers. |
| 14: repair workspace | Original submitted translation and feedback appear beside revision work. Earlier rounds remain immutable. |
| 15–16: missions and badges | Missions link to actual returned work, context-poor drafts and unfinished tasks. Four private badges have visible criteria based on current reviewer-approved work, accepted context and accepted revisions. |
| 17: forgiving goals | Private weekly goal of one to seven participation days; resets each Monday UTC. New submissions and resubmissions count once per day. Existing streak display remains available. |
| 18: improvement | Accepted/decided counts across the previous/latest 14 days, with sample sizes and feedback mentions. Based on up to 500 most recently updated review records; pending rounds excluded. No synthetic quality score. |
| 19: community goals | Real daily approval totals, with an optional admin-set UTC-day target. The control is on the Contributions review desk and the backend requires an admin role. Existing public-visibility preferences apply. |
| 20: outcomes and celebration | Existing review timelines and reward ledger remain the source of outcomes. Dashboard links distinguish review, assessment and points. Session success and newly earned recognition can animate; celebrations are optional. |

## Data and authorisation

`packages/contracts/contributor-details.mjs` validates optional details consistently.
`saveExpressionAnswer` stores them on the assignment item, includes them on the
immutable canonical submission, and passes language variety, literal meaning and
combined usage context through the existing publication/training path. Combined
usage context has a 1,500-character submission limit; longer private drafts can
be saved and shortened. Alternative labels stay aligned after blanks/duplicates
are removed. Old clients that omit details do not clear them. Idempotent retries
compare metadata too, so they cannot overwrite a locked submitted version.

Recovery copies include metadata, are scoped to account/assignment/item and need
explicit restoration. Optional metadata-only work counts as a draft. Save and
submission errors preserve the current editor. Selecting another task remains
blocked while a write is outstanding.

Preferences live in `contributorAccounts/{uid}.journey`. Trusted callables accept
only bounded weekly goal, session size, celebrations and practice completion.
Clients cannot forge participation days or clear completed practice. Submission
and preference transactions both read the account so racing writes preserve
server participation state. No new client Firestore write permission is added.

Recognition is a private presentation of reviewer outcomes. It creates no points,
leaderboard scores, reward eligibility or payment. Financial decisions still use
the existing assessed/legacy policy and ledger. The exact-publication check
queries at most ten matches and returns at most three currently public phrase,
meaning and variety records; it never returns private identities or drafts.

Motion includes staged card entrances, glass-vessel waves and floating labels,
live count/progress transitions, a sliding section indicator, section entrances
and short milestone bursts. The shared Display animation choice and OS reduced
motion preference remain effective. Decorative layers never take pointer or
keyboard input; success text is accessible without animation.

## Verification and release

Run:

```powershell
npm run test:contributor-portal
npm run check --workspace @indigen-world/tribestudio
npx firebase emulators:exec --project demo-indigen-world --only firestore "node --test --test-concurrency=1 firebase/tests/contributorPortal.rules.test.mjs firebase/tests/contributorJourney.integration.test.mjs"
npm run dev --workspace @indigen-world/tribestudio -- --host 127.0.0.1 --port 5204 --strictPort
node apps/tribestudio/scripts/collection-browser.test.mjs
```

The browser script uses real portal components and clearly labelled synthetic
preview data, blocking external requests except the mocked public spelling check.
It covers 1440, 768, 390 and 360 pixels, dark mode, disabled motion, practice,
structured editing, autosave, review/cancel/confirm, and advancing to another task.
Backend tests cover bounds, old-client preservation, alternative alignment,
immutable retry metadata, revision participation and hidden-record filtering.
The emulator runs real transactions including a concurrent preference/submission
race, and the existing contributor isolation/revocation rules tests.

Deploy the changed `saveExpressionAnswer` and `kawuriContributorAssist`, and these five
new callables: `getContributorJourney`, `saveContributorJourney`,
`getContributorCollectionGoal`, `setContributorCollectionGoal`,
`findContributorExpressionMatches`. Deploy TribeStudio hosting together. The
most-recent-rounds query uses the existing submissions authUid + lifecycle.updatedAt
descending index. Verify that index and the existing active-account rules are live.
No backfill, invitation, email, financial-policy change or article publication is
part of preparing the release. After deployment, verify sign-in, cross-device
metadata/preferences, a revision, and a reviewer approval using authorised accounts.

Release handoff:
`apps/updates-blog/posts/2026-10-13-contribution-studio/README.md`.
