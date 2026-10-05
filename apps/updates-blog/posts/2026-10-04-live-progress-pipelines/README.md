# Watch verified contributions flow into the jars

Status: **Implemented and verified locally on 2026-10-04 (branch `claude/progress-pipelines`). Not deployed: the counting functions, the `publicProgress` rule, two Firestore indexes and the website all still need releasing. Blogger article unpublished; publication and sharing remain with Chinedum.**

| Field | Value |
|---|---|
| Title | Watch verified contributions flow into the jars |
| Labels | Public website, Progress, Community, Contributions, TribeStudio, Kasem, Accessibility |
| Search description | Indigen World's progress page now shows TribeStudio as the source of every verified contribution: watch an approval travel through glass pipes into its collection's jar, with exact counts and honest percentages. |
| Custom permalink | live-progress-pipelines |
| Article | post.html |
| Sharing copy | share.md |

## What changed

- **Pump and pipes.** TribeStudio is a real link at the top of `/progress` (pointer, touch and keyboard; opens `https://tribestudio.indigenworld.com/` in a new tab). Measured SVG pipes join it to every jar (one lane per row, an outer trunk between rows) and every tank (one trunk, a branch into each tank's left end). Pipes run only in reserved lanes and gutters, behind the content, with pointer events off. Vessels no longer float, so every inlet stays joined.
- **Live approvals.** A committed approval spins up the pump, sends one bounded pulse along the measured route to its own vessel, then pours in with a ripple and a “+N approved” cue. Counts update at once; only the fill waits for arrival. History is never replayed: the first snapshot sets a cursor, and reconnects, resumed tabs, off-screen vessels, view switches, corrections and backlogs update numbers silently. Busy traffic merges per collection; the effect queue is bounded.
- **Honest connection labels.** Live / Connecting… / Reconnecting… / Offline / Updated hh:mm / Cached hh:mm / Sample data. “Live” requires a subscribed listener whose latest snapshot came from the server.
- **Exact fills and percentages.** Fill = approved ÷ target, clamped to the vessel; no rounding before geometry, no minimum fill. Percentages: “0.18%”, “0.04%”, “<0.01%”, never 0% for positive progress and never 100% before the target. Unreadable counts show “—”, never 0.
- **Blue liquid.** One coherent water-blue family replaces the red→yellow→blue→green ramp (every collection was red/orange at today's levels).
- **Counting fixes** (see below), mobile two-column jars with a compact spine (replacing the jar carousel), the table's short labels on their own line, and a performance fix: the page's animated, blur-filtered background blobs caused multi-second main-thread stalls under software rendering (13 fps, 3.4 s of long tasks in 4 s); they now use gradients (0 long tasks).
- Local pots and the data table keep their layouts and show the same source-backed values; an approval gives them a brief non-travelling highlight.

## Counting rules

Server rules live in `services/functions/src/public-progress.ts` (`countsToward` for a single record, `countPlan` for the matching count queries; they are kept in step). The page's snapshot fallback (`apps/website/src/features/progress/progressData.ts`) mirrors them as far as Security Rules allow.

| Collection | Counts | Change from the deployed page |
|---|---|---|
| Words & Meanings | `dictionaryEntries` with `isPublished` | none |
| Pronunciation Takes | published `dictionaryEntries` with a non-empty `audioUrl` (the documented rule) | the deployed query counted every published word (357); measured 93 on Oct 4 |
| Everyday Expressions | published `expressionEntries` except `expressionKind == 'proverb'` | proverbs no longer counted twice (0 proverbs today, so no visible change) |
| Proverbs & Wisdom | published `expressionEntries` with `expressionKind == 'proverb'` | none |
| Kasem Sentences | `kasemSentences` the public rule serves: `confirmed`, `projectionVersion == 2`, consent unexpired | the deployed query was denied by Security Rules and displayed a fabricated 0 (the true public count is also 0) |
| Grammar Patterns | `grammarRules` with `status == 'published'` | none |
| Stories, Songs, Narrations, Videos | published `publishedContent` of that `collectionKind`, **excluding `publicationRoute == 'open'`** | open posts are unreviewed by design (`open-publishing.ts`); Songs & Lyrics goes from 2 to 0 |

**Flagged, not decided — please confirm:**

1. **Imported dictionary rows count as words.** Of 357 published entries on Oct 4, 136 are review approvals (`collection_…`), 194 have `project…` ids and about 18 auto ids. The existing rule counts all published rows; whether imported reference rows are “verified contributions” is unresolved.
2. **Extra pronunciation takes are not counted.** `decidePronunciationRecording` can approve a second take (`keep_as_additional`) or approve without publication consent; neither adds to the count, because the documented rule counts words with a public recording. Whether each take should count separately is unresolved.
3. **Open posts excluded.** This follows the page's “approved contributions only” promise. The De N Lei seed is also excluded: its own record says its lines “have not been independently reviewed”. Reversing the decision is a one-line change in both rule sets.
4. **The one published story has no review metadata** (no route, no submission link, no lifecycle); it is counted as a legacy staff-placed record. Confirm it was reviewed.
5. **Admin library audiobooks** (`publicationRoute == 'admin'`) count as narrations (none published today).
6. The confirmed targets and the existing “Planned: December 2026 / January 2027” label are unchanged; this work did not set them.

## Data and privacy

- `publicProgress/current` (new; world-readable, `allow write: if false` for every client including admins) holds `{ schemaVersion, revision, updatedAt, categories: { <key>: { total, countedAt, changedAt } }, events: [≤24 × { id, revision, category, delta, total, kind, at }] }`. No record id, contributor, text, media, reviewer or note. Emulator tests assert the field whitelist and that seeded private strings never appear.
- Totals are recounted with server-side `count()` aggregations (one read-only transaction per collection) whenever a write changes whether a record counts; each total keeps the Firestore read time of its count, so redelivered events, concurrent approvals and out-of-order deliveries cannot double count or roll a total back. `reconcilePublicProgress` recounts everything every 15 minutes, silently (no events), which also retires expired sentence consent and repairs any missed trigger.

## Images and credits

Credit: Indigen World. All five images are actual product screenshots captured on October 4, 2026 in headless Chrome. None shows private contributor information.

- `images/approval-travelling-live.jpg` and `images/approval-arriving-live.jpg`: 1440 × 1060, the page running against a local Firestore emulator (`website-emulators` preview) with **labelled test data**; the approval was written, then counted by the real trigger handler and delivered to the page's real snapshot listener.
- `images/pipelines-jars-production-counts.jpg`: 1440 × 1060, local preview reading **real production counts** before release (status “Updated”, pronunciation “—” until its index is deployed).
- `images/pipelines-tanks-sample.jpg` (1440 × 1000) and `images/pipelines-jars-mobile-sample.jpg` (390 × 844): development preview with **sample counts and targets**; the sample notice or “Sample data” label is visible.

Blogger: Insert image → Upload from computer for each image. Replace each relative `src` in `post.html` with its Blogger URL, keep every alt text and caption (including the test-data and sample-data labels), and preview at desktop and phone widths. If the article is published after release, consider replacing the production-counts screenshot with a live capture showing “Live”.

## Verification (all on 2026-10-04)

- `npm run check:website` — TypeScript, site validation, `validate-progress.mjs` (calculations, blue liquid, pump link, network never takes input, Live only when server-confirmed, simulation DEV-only), 15 unit tests (`liquidAppearance.test.mjs`, `progressLive.test.mjs`: formatting, cursor/no-replay, dedupe, batching, corrections, milestones, queue bounds, pipe geometry), production build and prerendering. The production bundle contains no simulation or fixture controls.
- `npm run test:public-progress` — 9 backend unit tests (rules per collection, change detection, stale-count rejection, concurrency, corrections, silent reconcile, bounded ring, payload whitelist).
- `npm run test:public-progress:integration` — 9 Firestore-emulator tests driving the real trigger handlers: exact first projection with no events, one event per approval, redelivery ignored, unapproved drafts and a rolled-back transaction never counted, concurrent approvals counted once each, retraction as a correction, open posts excluded, missed trigger reconciled silently, rules (public read; no client write, admins included), no private data.
- `npm run test:progress:browser` (dev preview, production counts + sample mode) — all views; exact fills; every inlet meets a pipe and no tube crosses text or controls for jars and tanks at 320, 360, 390, 768 and 1440 px; pump link and keyboard focus; a sample approval (count at once, fill held, one pulse, cue on its own jar, exact fill after); popups and focus; Alt+T; pause and reduced motion (static cue, nothing travels).
- `npm run test:progress:live` (Firestore emulator + `website-emulators` preview) — passed three consecutive runs: initial load live with no replay; approval; duplicate delivery; unapproved draft; retraction; burst of three (“+3 approved”); view switch mid-flow; offline → reconnect caught up silently; hidden tab; off-screen vessel; live target change.
- `npm run build:functions` — clean.

## Deployment (not done; needs the owner's go-ahead)

Project `project-kassena-7e026`. Order matters: the page works before the backend (it falls back to labelled snapshots), but Pronunciation shows “—” until its index exists.

1. **Indexes:** `firebase deploy --only firestore:indexes --project project-kassena-7e026`; wait until `dictionaryEntries (isPublished, audioUrl)` and `kasemSentences (status, projectionVersion, expiresAtMillis)` finish building.
2. **Rules:** first confirm the deployed ruleset matches `origin/main`'s `firebase/firestore.rules` (a rules deploy replaces the whole ruleset, and other branches have shipped rules before), then `firebase deploy --only firestore:rules --project project-kassena-7e026`.
3. **Functions** (six creates; each create can take 10+ minutes): delete any stale `services/functions/functions.yaml`, `npm run build:functions`, capture `firebase functions:list`, then `FUNCTIONS_DISCOVERY_TIMEOUT=180 firebase deploy --only functions:onDictionaryEntryProgress,functions:onExpressionEntryProgress,functions:onKasemSentenceProgress,functions:onGrammarRuleProgress,functions:onPublishedContentProgress,functions:reconcilePublicProgress --project project-kassena-7e026`, and diff `functions:list` afterwards.
4. **Initialise:** force-run the `reconcilePublicProgress` Cloud Scheduler job (or wait up to 15 minutes), then check `publicProgress/current` against expectations (words 357+, pronunciation about 93, songs 0, expressions 107+).
5. **Website:** merge to `main`, push, then `npm run deploy:website` (its predeploy checks require a clean tree matching `origin/main`).
6. **Live check:** the public page should read “Live”; approve one real contribution and watch it arrive in the right jar. Only then update this status and the article's Availability section.

## Publishing steps

1. Complete and verify the deployment above; update this status, the article's Availability section and the sharing status with the evidence.
2. Upload the five images, replace the image URLs, and preview the article in Blogger.
3. Set the title, labels, search description and custom permalink above. Chinedum decides when to publish.
4. Replace the published-article URL placeholder in `share.md` before sharing.

Preparing these files does not publish externally or send messages.
