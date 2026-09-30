# Help the dictionary from wherever you are (Indigen World 0.1.29)

Update post for the connected-contributions work of 2026-09-28: word prompts in Explore,
"Help add this word" from search, topic pages and Kawuri, answering before signing in,
corrections after review, the reviewer's choice of what an answer becomes, credit and
training choices, and Kawuri practice lessons. Release record:
`docs/product/releases/0.1.29+38.md`. How it works: `docs/product/language-loop.md`.

Status: **Draft. Implemented and tested in the repository; the 0.1.29 (38) bundle is built
locally but not uploaded to Google Play, and none of the backend steps has run.** Do not
publish until the checklist under *Before publishing* is done.

- Verified:
  - `flutter analyze lib test`: no issues in this work (the only findings are in another
    session's knowledge-workspace files).
  - `flutter test`: 1,571 passed and 1 skipped (full suite), including 16 new tests — a guest
    writing an answer, signing in, and the answer surviving unsent among them.
  - Backend: 578 function helper tests, 41 emulator end-to-end tests (3 new: request →
    answer → sent back → corrected → approved as a translation pair → published →
    withdrawn; training refused without consent), 205 rules tests (4 new).
- Not verified: nothing has run on a physical phone.

| Field | Value |
|---|---|
| Title | Help the dictionary from wherever you are (Indigen World 0.1.29) |
| Topic | Wherever the dictionary runs out — Explore, search, topic pages, Kawuri — members can answer the missing word, sign in after writing it, follow it through review, correct it when asked, and choose how they are credited and whether it may help train language tools. Reviewers decide what an answer becomes. Kawuri runs practice lessons from verified words. |
| Labels | `Release`, `Feature`, `Mobile app`, `Dictionary`, `Kawuri`, in that order |
| Search description | Indigen World 0.1.29: answer the words the dictionary is missing from Explore, search, topics or Kawuri, and practise verified words with Kawuri. (148 characters) |
| Permalink (custom) | `help-the-dictionary` |
| Reading time | about 6 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The Explore word prompt and a Kawuri lesson, beside the title | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/prompt.jpg` | 1600×1150 | The word prompt over an Explore reel, and three points | `REPLACE-WITH-UPLOADED-prompt.jpg` |
| 3 | `images/answer.jpg` | 1600×1150 | A guest's form, top and bottom (the choices and Sign in to send); the Submitted for review note | `REPLACE-WITH-UPLOADED-answer.jpg` |
| 4 | `images/review.jpg` | 1600×1150 | The review desk's "What should this answer become?" | `REPLACE-WITH-UPLOADED-review.jpg` |
| 5 | `images/lesson.jpg` | 1600×1150 | A Kawuri lesson on *na* (water) and its next steps | `REPLACE-WITH-UPLOADED-lesson.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the new Flutter code with the render check at 1170×2532
  (`screens/`), then framed in phones by `mockups/*.html` and `mockups/render.mjs`. The
  render test itself was temporary and is not in the repository.
- **Real data:** the queue word *girl* and its sentence are a real open word in production
  `wordQueue` (sentence: Tatoeba #44393 by CK, CC BY 2.0 FR — credited on the card and in
  the post). *kunkwolo* (bottle, Paga) and *na* (water, Navrongo) are published dictionary
  entries. **No Kasem was invented for these pictures.**
- **The lesson** shows Kawuri's actual, unedited replies, recorded in
  `screens/lesson-transcript.json`. The run happened on 2026-09-28. It used the lesson's own
  server code (`lessonContextFor` and `askKawuri`, compiled from `services/functions`) with the
  real model (`gemini-2.5-flash` on Vertex AI), and it read the published entry *na* from
  production Firestore without writing anything. The member's answers ("na", "the water is
  hot?", "na") were typed for the test. The second one is deliberately wrong, to show the strict
  check.
- **Sample data — say so if asked:** the review item (a member answering *bottle* with
  *kunkwolo*), its origin and choices, and the answer shown after sending. *bottle* and its
  sentence (Tatoeba #39608 by CK, CC BY 2.0 FR) are a real open queue word.
- **Photograph:** `apps/mobile/assets/places/tono-dam.png`, the irrigation channel below the
  Tono dam, by Apiu Akwojong Ezekiel, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tono_Dam_AWC_Water_for_life_4.png),
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Differences from a phone:** text is drawn in Roboto, and shadows are solid, because the
  test renderer has neither Noto Sans nor blur.
- **Regenerating the figures:** `node apps/updates-blog/posts/2026-09-28-help-the-dictionary/mockups/render.mjs`
  (needs Google Chrome; re-frames the PNGs already in `screens/`).

## Before publishing

1. **Backend first** — the app release depends on it. In this order, each with approval:
   - Firestore rules and indexes (`wordRequests`, `languageResources`, the `wordQueue` topic
     index, the `languageResources` entry index);
   - Functions, explicit list: `requestQueueWord` (new), `submitWordTranslation`,
     `decideSubmission`, `withdrawCollectionContribution`, `kawuriChat`,
     `onCommunityKawuriMention`;
   - Admin hosting (the review desk's new choice).
   Without them: *Help add* cannot ask for a new word, corrections and the reviewer's choice
   are refused, topic pages cannot list requested words, and lessons fall back to plain chat.
2. **Before uploading, decide about the "Build Kasem knowledge" row.** It is another
   session's unfinished knowledge workspace, and it was compiled into the bundle. See
   `docs/product/releases/0.1.29+38.md`; this post does not describe it.
3. **Upload 0.1.29 (38)** to Google Play and check it on a phone: an Explore prompt after a
   few reels; Answer it as a guest, sign in, send; Help add from an empty search; a topic
   page; a lesson from an entry and from a reel; a correction from Your submissions.
4. The *Also in this update* section assumes 0.1.28 never shipped on its own. If the 0.1.28
   post is published first, keep the section; it still reads correctly.
5. Replace `[PUBLISHED_POST_URL]` in `share.md` after publishing.
