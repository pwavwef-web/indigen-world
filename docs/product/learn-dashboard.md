# Learn dashboard

Status: built, tested and **deployed on 2026-09-14** (functions, Firestore rules and indexes, Storage rules, admin console). The app part ships in 0.1.21 (30), which was built the same day but is not yet on Google Play. See the deploy record at the end and `docs/product/releases/0.1.21+30.md`.

The Learn tab opens on a dashboard that follows the reference design. The trail of lesson buttons that used to fill the tab is still there, inside **Course**.

## What is on the screen, and where it comes from

| Section | Data | Action |
|---|---|---|
| Header: streak, XP, today's goal | `learnProgress` (device + `learnProgress/{uid}`); XP adds `contributorScores` points at draw time, as before | Streak → streak sheet (and today's spark claim). XP → progress and achievements. Goal → today's goal, then continue |
| Header: dictionary, avatar | — | Dictionary collection screen. The avatar is the shell's existing profile orb |
| Learning Kasem ▾ | `learnCourses` (published), bundled Kasem otherwise | Course picker, remembered on the device (`learn.courseId`) |
| Course | `courseOutlineProvider` | Course outline: summary, every unit's trail, units in preparation |
| Today's lesson | First unfinished lesson on the path; `lessonSteps` for "n of m activities" | Start or Continue, resuming at the saved question. After the day's goal the eyebrow reads "Up next · Goal met". Once every lesson is done, it offers Review words. With no lessons, it says they are on their way |
| Review words | Published dictionary + `reviewCards` (Leitner boxes, due in 0/1/2/4/8/16 days) | Spaced-repetition session |
| Listen | Entries with a real `audioUrl` | A quiz only if there are at least four recordings; below that, listen-and-repeat, and it says why. No synthetic audio anywhere |
| Speak | Today's word or any published word | Record, replay and send to a person (`submitPronunciationRecording`). Optional: say the meaning in English, transcribed on Vertex and marked experimental |
| Word of the day | `dailyWords/{yyyy-MM-dd}` when an admin picked one, otherwise the date's walk through the published dictionary | Opens the full entry. Play uses the real recording. Without one it shows "Pronunciation unavailable" and offers to record, never TTS |
| This week | `activeDays` | Mon–Sun ticks, a 3-day goal, one motivational line |
| Explore next | Units after the current one | Open or resume. Locked units name the unit to finish and how many lessons are left; in-preparation units say so |
| Kawuri AI | Current course, unit, lesson (with its verified prompt → answer pairs) and today's word | Opens Kawuri with a learning card: Explain this word, Give me an example, Quiz me, Help me practise |

The header, rail and Kawuri button hide on a downward scroll and return on an upward one, at the top or at the end. They use the shell's `shellChromeVisibilityProvider` with the Community feed's 14 px dead zone. Pull to refresh re-reads lessons, units, courses, progress and the daily pick. If the lesson stream fails, the dashboard keeps the cached copy and shows a retry notice. A skeleton shows while the first lessons load.

## Data model

### Progress (`learnProgress/{uid}`, mirrored on the device)

The existing fields stay: `completedLessons`, `lessonXp`, `sparkXp`, `lastStreakClaim` and `xp`. New fields:

| Field | Shape | Notes |
|---|---|---|
| `activeDays` | `["2026-09-14", …]` | Day keys in the **phone's local timezone**. A set, so no duplicate can inflate a streak. Kept 400 days; rules cap it at 800 |
| `dayLessons` | `{day: [lessonId]}` | Last 21 days, for today's goal |
| `lessonSteps` | `{lessonId: answered}` | Saved as each answer is checked; cleared on completion |
| `practiceDays` | `{review\|listen\|speak: [day]}` | 5 XP per kind per day. Never pruned, because XP is counted from it |
| `reviewCards` | `{entryId: {box, due, last, reviews}}` | Merge keeps the later answer. Rules cap it at 3000 |
| `streakDays`, `longestStreak` | int | **Derived** from `activeDays` and written for readers |

- A streak is the run of consecutive active days ending today, or ending yesterday while today is unclaimed.
- Old progress is backfilled once: the stored spark counter becomes the same run of days, so nobody loses a streak.
- Writes use `mergeFields`, so pruned days really leave the document.
- A race was fixed along the way: two updates in the same frame now both land (`_latest()`).

### Course catalogue

- `learnCourses/{id}`: `title`, `languageName`, `languageCode`, `order`, `published`.
- `learnUnits/{id}`: `courseId`, `order`, `title`, `subtitle`, `published`, plus `imageUrl` and `imageAttribution` written by an approval.
- Lessons gain optional `courseId` (default `kasem`), `description`, `imageUrl` and `imageAttribution`, and join units by `unitOrder`.
- Until units are published, the app draws the bundled Kasem outline: Start a conversation, Family & people, Food & home, Around town. Units 2–4 have no lessons and show as **in preparation**, never with an invented lesson count.
- Once real lessons are published without unit documents, only their own units are shown. The bundled plan still lends its pictures.

### Pronunciation recordings (`pronunciationRecordings/{id}`)

- Created by `submitPronunciationRecording` from the learner's private `creator-submissions/{uid}/…` upload.
- Fields: `entryId`, `headword`, `meaning`, `uid`, `storagePath`, `durationMs`, `publishConsent`, `automatedAssessment: 'none'`, `status`.
- `decidePronunciationRecording` requires a validator:
  - reject needs a note;
  - approve attaches the sound to the entry only if the learner consented **and** the entry has no `audioUrl`;
  - if the entry already has audio, the recording is kept as an additional published file, and a published recording is never replaced;
  - without consent it is approved as feedback only.
- A dedicated path was needed because approving a dictionary-kind contribution publishes a new entry, which would have duplicated the word.

### Illustrations (`learnIllustrations/{id}`)

Every record keeps:

- the prompt, the composed prompt (with the house style), style and mode;
- aspect ratio, image size, quality tier, and the model that actually drew it;
- target, draft storage path, creator uid/name and timestamps;
- the review decision, note, public URL and attribution.

Status flow: `generating → draft | failed`, then `draft → approved | rejected`.

## Nano Banana illustration desk

**Where and who.** Server: `learn-illustration-policy.ts` (pure, tested) and `learn-illustrations.ts` (callables). Admin console: Learning › Illustrations.
- Editors (validator, reviewer) and admins can generate.
- Only admins approve.
- The mobile app never calls either function.

**Models.**
- Standard: `VERTEX_IMAGE_MODEL`, default `gemini-3.1-flash-image` (Nano Banana 2), with `gemini-2.5-flash-image` as fallback.
- Best quality: `VERTEX_IMAGE_PRO_MODEL`, default `gemini-3-pro-image` (Nano Banana Pro), falling back to Nano Banana 2 rather than 2.5.
- Both IDs answered live on `project-kassena-7e026` on 2026-09-14, on the `global` endpoint.

**Requests.**
- Text-to-image; up to 3 reference images (uploaded to `learn-illustrations/references/{uid}/…`); editing an existing illustration.
- Aspect ratios 1:1, 4:3, 16:9 and 9:16. Sizes 1K/2K on standard, 1K/2K/4K on best. `imageSize` is sent only to Gemini 3 models.
- The course house style (`COURSE_STYLE`) keeps units consistent: palette, painterly hand, Kassena homeland, and no text, masks, shrines, rituals or real people.

**Safeguards.**
- Every request passes the platform screen first, and is rate-limited to 30 an hour per person.
- A billable attempt is written to `auditLogs`.

**Storage.**
- Drafts go to `learn-illustrations/drafts/{id}/…` (staff read only).
- Approval copies the file to `published-media/learn-illustrations/{id}.{ext}` and writes `imageUrl` and `imageAttribution` onto the target unit, lesson or course. The target document must already exist.

### The four bundled illustrations

`apps/mobile/assets/learn/` (about 270 KB WebP, total) holds the hero and three unit cards. Provenance is in `assets/learn/illustrations.json`.
- They were generated on 2026-09-14 by running this same service code (the policy's house style, then `generateImage`) against Vertex: the hero with Nano Banana Pro at 2K, the unit cards with Nano Banana 2 at 1K.
- They are AI-generated and were drafts until the project owner's review. Asked whether the four worked, the owner replied "do" on 2026-09-14, which was recorded as approval (`approvalStatus: approved`). The app credits them as "AI illustration (Nano Banana on Vertex AI)".
- To replace one properly: generate it at the desk, approve it onto the published unit, and the network image wins over the bundled asset.

## Kawuri from Learn

`KawuriFab(learningContext:)` passes a `KawuriLearningContext` (course, unit, lesson, the lesson's prompt → answer pairs, and today's word with meaning, part of speech, example and source) into `KawuriScreen`.

**How it travels.** The context rides as `learn.*` message options, and `KawuriService._routedPrompt` appends a block that:
- labels them VERIFIED COURSE CONTENT and VERIFIED DICTIONARY RECORD;
- instructs the model to prefer them and not to invent Kasem;
- has it say when something is unverified;
- has it suggest corrections for community review rather than state them as fact.

**Deployed today.** This works with the deployed `kawuriChat` and needs no server change. The server's own dictionary lookup still runs on the question text. Kawuri writes nothing.

**Opening from a lesson.** An unrelated open conversation is moved into history first.

## Deploy record (done 2026-09-14)

All to `project-kassena-7e026`, by explicit `--only` lists.

1. **Functions: done.**
   - 4 new: `generateLearnIllustration`, `reviewLearnIllustration`, `submitPronunciationRecording`, `decidePronunciationRecording`.
   - 15 updated: the ten Kawuri media functions and the five Studio video functions, which share `studio-video-policy.ts`.
   - Afterwards 100 functions were live, and the live list equalled the exports.
2. **Firestore rules and indexes: done.** The rules add `learnCourses`, `learnUnits`, `dailyWords`, `learnIllustrations`, `pronunciationRecordings` and the `learnProgress` bounds. All 5 new indexes are READY.
3. **Storage rules: done.** `learn-illustrations/drafts` and `references`.
4. **Admin hosting: done.** https://indigen-admin.web.app, deployed from uncommitted work through a temporary admin-only config.
5. **Mobile build: done, not uploaded.** 0.1.21 (30), SHA-256 `73f85d40…`. The asset folder `assets/learn/` is registered in `pubspec.yaml` and was confirmed inside the bundle.

**Still to do:**

- Upload 0.1.21 (30) to Google Play.
- Publish the update post (`apps/updates-blog/posts/2026-09-14-learn-dashboard/`) once the rollout has started.
- Commit and push the work.
- Publish real lessons from the admin console.

## Not done, and why

- **Kasem speech scoring.** Deliberately absent. A person reviews Kasem recordings.
- **English STT** in Speak uses the existing `transcribeKawuriAudio` allowance.
- **The Veo `allow_all` path** is implemented with a fallback but was not exercised live. A test video costs money and was not authorised.
- **Word-of-the-day pictures** come only from `dailyWords` documents. The dictionary has no image field, and nothing is generated per word on page load.
- **Only 1 of 342 published entries has a recording** (measured 2026-09-14). Listen therefore runs in listen-and-repeat mode until at least four recordings exist.
- **No lessons are published in production** (`learnLessons` is empty). The dashboard runs on the bundled preview unit until they are.
- **New strings are English-only** (the dashboard and practice screens). Existing localised strings were reused where they existed.
