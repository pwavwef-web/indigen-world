# Play a mission, share your knowledge: Culture Quest

Status: **Deployed October 1, 2026; public route and release asset verified. Signed-in game verification and Blogger publication pending.**

- Title: Play a mission, share your knowledge: Culture Quest
- Labels: Indigen World, Labs, Contributions, Culture Quest, Feature
- Search description: Explore daily source cards, share usage notes or corrections, and earn game XP while contributing to Indigen World Labs.
- Custom permalink: culture-quest
- Article: `post.html`
- Sharing copy: `share.md`
- Images: `images/quest-mobile.png`, `images/quest-desktop.png`

## Evidence and limits

- Gameplay refinements: daily contribution goal, Discover → Leave a clue → Collect XP step indicator, reversed source/meaning matching at the second stop, optional playback of existing reviewed recordings, selectable writing prompts, minimum-note/evidence readiness hint and a field guide of discovered sources. Warm-up matching applies to word/expression/sentence cards; cultural and literature cards reveal their source instead. The active mission receives focus when navigating stops. In-progress notes, evidence, mission type and chosen prompt remain associated with each stop during this mounted game session. They are not saved to the server or retained through page refresh. The field guide includes saved completed-source cards after reload; unsaved discovery choices remain ephemeral.
- Lifetime stats and badges sit in an expandable explorer passport to keep the daily goal and game nearer the top on mobile. The saved-source field guide was checked after reload with all three completed missions.

- Refined game palette: deep forest map and primary actions, cream source cards, readable green supporting text and gold earned rewards. Completed stops also carry a flag and text, so color is not their only indicator. Screenshots reflect this palette.

- The game presents an animated expedition map with three stops, a source discovery challenge, peeking without penalties, two selectable contribution mission styles, keepsake unlocks and next-stop/completed-trail celebrations. Matching choices use only exact reviewed meanings from that day's cards. A card with ambiguous repeated headwords or fewer than two distinct meanings uses a reveal instead. Guess history is ephemeral browser state; it is not saved or treated as a contribution. Motion respects `prefers-reduced-motion`.

- `/labs/culture-quest` is registered in website routing, metadata and the shared experiment registry. Labs catalogue, homepage previews and admin controls discover it.
- Server-selected daily cards come from the existing rights/review-filtered source sampler (up to 90 eligible results used for selection). Up to three cards are stored as daily snapshots. XP, daily completion and lifetime mission totals are maintained by `labsApi` transactions in owner-only `labsQuests` records. Direct client writes are denied.
- Usage notes and corrections enter `labsFeedback` with source references, source snapshots and evidence. Existing admin review and reporter activity are reused. No automatic dictionary edits, contributor payment credits or external publication.
- One source submission per account per UTC day; concurrent retries cannot create duplicate feedback or XP. Notes require at least 20 trimmed characters and evidence 10. These are basic submission checks, not accuracy verification. XP remains participation progress even if a report is later closed.
- Repeated daily quests may include previously seen sources. Badges use lifetime submitted missions (1, 3, 10); levels advance each 100 XP. No public leaderboard, streak requirement or payment promise.
- Experiment pause, invitation and lifecycle gates are enforced server-side. Signing in is required even if an administrator sets the experiment access to public. Cards retain their source revision for that day; they are snapshots and not a guarantee of current publication status.

## Verification

- `npm run build:functions`: passed with escalation after sandbox filesystem denial.
- `npm run check:website`: passed typecheck, site validation, production build and metadata generation (24 routes).
- Existing Labs policy suite: 9 passed.
- Palette contrast calculation: primary button white/forest 8.33:1; map labels against the brightest specified green 6.21:1; supporting green text on cream 5.74:1; reward text on the darker gold gradient stop 7.67:1. These checks cover those specified color pairs, not a full accessibility audit.
- `npm run test:labs`: backend build and policy tests passed; callable/rules emulator suites could not start because `java -version` is unavailable. New tests cover authenticated access, forged source rejection, other-account isolation, stale days, short notes, concurrent duplicate submissions, queue persistence, pause controls, daily reset with retained XP, and quest rules ownership/direct-write denial. **These integration assertions have not executed.**
- Actual QuestWorkspace component checked in Chromium at 1440, 390 and 360 pixels with simulated callable responses: no horizontal overflow; correct/incorrect/peek discovery; skipping; failed submission retaining entered text; retry completing a mission; next-stop navigation; all-missions completion; first/third mission keepsake celebrations; saved progress after reload; reduced-motion animation suppression. Screenshots are from this isolated local component harness. No live Firebase game flow is claimed.
- Follow-up UI checks covered reversed matching, retaining unfinished notes after switching between map stops, and prompt selection changing writing guidance. Real recording playback is not verified. Website typecheck and production build passed for the refinements.

## Image credits and publishing steps

Credit: Indigen World, local Culture Quest component screenshots, October 1, 2026. The screenshots contain visibly labelled disposable development fixtures and simulated progress, with no private member data.

1. Complete emulator tests on a Java-enabled machine, review the change, deploy the intended `labsApi`, Firestore rules and website build through the existing release workflow, then verify signed-in game submissions, duplicate protection, admin review, member response visibility and daily reset on the released service.
2. Update this release status and article availability only after confirmed deployment evidence.
3. Create a Blogger draft using the metadata above and paste `post.html` in HTML mode.
4. Upload both PNG files to Blogger and replace each local image source with its uploaded URL. Preserve alt text and simulated-development captions; keep the mobile image at a readable width.
5. Chinedum publishes and shares. Replace the published article URL placeholder in `share.md` after publication.

Firebase deployment completed October 1, 2026 from `origin/main` commit `a594902`: `labsApi` (us-central1), Firestore rules and Indigen World Hosting. The custom-domain Culture Quest route returned HTTP 200 with its metadata; served Labs JavaScript SHA-256 matched the release build. Backend build and nine policy tests passed again. Emulator integration tests remain unexecuted because Java is unavailable. Signed-in submissions, review and daily reset remain unverified on production. No Blogger publication or community messages were performed.
