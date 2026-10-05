# Progress pipelines

How the public `/progress` page shows verified totals and plays a real approval
travelling from TribeStudio into its collection's vessel. Prepared 2026-10-04;
release record: `apps/updates-blog/posts/2026-10-04-live-progress-pipelines/`.

## 1. Code map

| Part | Where |
| --- | --- |
| Counting rules, recount, projection, triggers, reconcile | `services/functions/src/public-progress.ts` |
| Public projection rule (`publicProgress/{doc}`: read all, write none) | `firebase/firestore.rules` |
| Indexes for pronunciation and sentence-expiry counts | `firebase/firestore.indexes.json` |
| Subscription, snapshot fallback, target config, device cache | `apps/website/src/features/progress/progressData.ts` |
| Cursor / no-replay model, batching, milestones, effect queue (pure) | `liveProgressModel.ts` |
| Connection state, fallback polling, DEV-only simulation | `useLiveProgress.ts` |
| Pump → travel → arrival sequencing, held fills | `useApprovalFlows.ts` |
| Pipe geometry from measured anchors (pure) | `pipeGeometry.ts`, rendered by `PipeNetwork.tsx` |
| Pump link, status label | `TribePump.tsx`, `ConnectionStatus.tsx` |
| Percent formatting (pure) | `progressFormat.ts` |

## 2. Data contract

`publicProgress/current`, written only by the backend:

```
schemaVersion: 1
revision:      integer, +1 whenever any total changes (the page's cursor)
updatedAt:     time of the last change
categories:    { <categoryKey>: { total, countedAt, changedAt } }
events:        last 24 changes { id: "<revision>.<key>", revision, category, delta, total, kind: approval|correction, at }
```

Category keys: `lexicon, expressions, sentences, literature, music,
audiobooks, video, grammar, proverbs, pronunciation`. Nothing else is ever
written: no record id, contributor, text, media, reviewer or note.

**Exactness.** A write to `dictionaryEntries`, `expressionEntries`,
`kasemSentences`, `grammarRules` or `publishedContent` that changes whether a
record counts (`changedCategories`) recounts just those categories with
`count()` (one read-only transaction per category) and stores each total with
the count's Firestore read time. Older counts are discarded, so redelivery,
concurrency and reordering cannot double count or roll back. Reconcile
(`reconcilePublicProgress`, every 15 min) recounts everything and records no
events: it repairs missed triggers and retires expired sentence consent.

## 3. Counting rules

`countsToward` (one record) and `countPlan` (count queries) must change
together, and the browser fallback in `progressData.ts` mirrors them. Today:
published dictionary entries; published entries with an `audioUrl` for
pronunciation; published expressions except proverbs; proverbs; confirmed
`projectionVersion 2` sentences with unexpired consent; published grammar rules;
published content of each kind **except `publicationRoute: 'open'`**.

Open questions (see the release README): imported dictionary rows counting as
words; extra pronunciation takes; the legacy story record without review
metadata; admin library audiobooks.

## 4. What the page does

- First snapshot = history (cursor set, nothing animated). Later approvals
  animate only while continuously live and visible, if recent, above the cursor
  and positive. Reconnects, resumed tabs (1.5 s grace), off-screen vessels,
  corrections, reconciles and ring overflow update numbers silently.
- Counts update immediately; the fill is held at the old total until the pulse
  arrives, then eases to the exact new value. View switches and motion changes
  cancel effects and show the snapshot.
- “Live” only for a server-confirmed snapshot. Missing or unreadable projection →
  aggregate-count snapshots every 2 minutes, labelled “Updated hh:mm”. Unreadable
  categories show “—”.
- Reduced motion or Pause motion: static cue, nothing travels. Screen readers get
  one polite summary per burst.

## 5. Testing

```
npm run test:public-progress                    # backend unit tests
npm run test:public-progress:integration        # emulator, real trigger handlers
npm test --workspace @indigen-world/website     # includes progressLive.test.mjs
npm run test:progress:browser --workspace @indigen-world/website   # needs a dev preview (PROGRESS_PREVIEW_URL)
npm run test:progress:live --workspace @indigen-world/website      # needs the emulator + website-emulators preview
```

For the live check: `firebase emulators:start --only firestore --project
demo-indigen-world`, then start the `website-emulators` launch configuration
(port 5196; demo credentials, `VITE_USE_EMULATORS=true`) and build the backend.
The development page's Options → Preview sample targets → Simulate an approval
plays a sample approval through the same path; it does not exist in production
builds.

## 6. Deploying

Indexes → rules (confirm the live ruleset matches `main` first) → the six
functions by explicit `--only` list with `FUNCTIONS_DISCOVERY_TIMEOUT=180` →
force-run the reconcile job → website. Full commands and checks: release README.
