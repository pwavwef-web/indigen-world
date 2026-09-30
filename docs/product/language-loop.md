# The language loop: from Explore, search, topics and Kawuri to the word queue

Repository status: implemented and tested 2026-09-28; **backend and admin deployed 2026-09-30**. Android 0.1.29 (38) still awaits Play upload and phone verification. See "Going live".

Before this, every surface ended where the dictionary ran out: a reel with words nobody had
recorded, a search that found nothing, Kawuri saying "the dictionary does not have this word
yet". Each was a dead end standing in front of the one thing that fixes it — the word queue
(`wordQueue`, about 15,000 open English words, each answered in Kasem and checked by a
reviewer). The loop connects them.

## One word, one queue item

A word's queue id is derived from the word itself (`queueWordIdFor`: the seed's own
`wordQueueId`, reproduced on the server and in the app, and tested against every seeded
row). So an Explore prompt, a search for "goat", the Animals topic page and Kawuri all open
the **same** queue item, and answers from every door reach one reviewer. Several people can
answer the same word while it is open.

## The doors

| Door | What the member sees | Where it goes |
| --- | --- | --- |
| **Explore** | Now and then a card over the reel: "Do you know *water* in Kasem?", with the queue's example sentence and its Tatoeba credit. First after 5 reels, then at most every 14, at most 3 a session; gone after 2 reels if ignored. **×** dismisses the word for good on this phone. | `/contribute/word/<id>?origin=explore` |
| **Dictionary search** | When nothing matches an English-looking query: "Looking for the Kasem for the English word …? Help add it." | the word's queue item, or asks for it |
| **Topic pages** | Dictionary → Browse → a topic (the 18 subject fields reviewers file senses under): its verified words, the words people are asking for under it, and "Is a word missing?" | the same, recording the topic on the word |
| **Kawuri** | Under an answer: each verified entry it drew on (opens the entry), and each word it could not verify, with "Help add". | the same |

A word nobody seeded is created by `requestQueueWord` (signed-in; ranked among the common
words; demand counted once per member; the public row never names who asked — that is in
`wordRequests`, readable only by the asker and staff). A word that already has a verified
translation sends the member to the dictionary instead.

## Answering

`/contribute/word/:wordId` opens the word queue on that exact word, prefilled with the word
and its sentence; the queue carries on afterwards. **A guest can write the whole answer
first**; "Sign in to send" signs them in, the answer is still there, and nothing is sent until
they tap Send themselves. After sending: **"Submitted for review"**, the answer, and "Follow
it in Your submissions", where its later status appears.

Two standing choices on the form, kept across words like the dialect:

- **Credit me by name when it is published** (on by default; off = "an Indigen World
  contributor").
- **Also let it help test and train language tools** (off unless the member turns it on;
  never inferred).

The answer carries its provenance: `wordQueueOrigin` (queue, explore, search, topic,
kawuri) and `attribution.preference`.

## The review decision

On the mobile review desk and the admin desk, a word-queue answer shows the sentence it was
asked with, where the member came from, any corrections, and their credit and training
choices. The reviewer decides what it **becomes** (`publishAs` on `decideSubmission`):

| Choice | Written to | Notes |
| --- | --- | --- |
| A dictionary word (default) | `dictionaryEntries` | as before |
| A regional variant | `dictionaryEntries`, with `variantOf` + `variantRegion` | names the published word it varies |
| An expression | `expressionEntries` | idioms the member flagged are published as idioms; source "the member themselves" |
| An example sentence | `languageResources` (`kind: example`, optional `entryId`) | needs the member's Kasem sentence |
| A translation pair | `languageResources` (`kind: translation-pair`) | needs an English sentence (the prompt's, with its Tatoeba credit) and the Kasem |
| Training material | `contributorTrainingPairs` (admin-only), never published | **only with the member's consent** |

Options the backend would refuse are disabled on the desk with the reason. Publishing the
answer as something else later takes the old public record down, so one answer never has
two public homes. Provenance (queue word, submission, contribution, origin, sentence licence)
travels with every record; the reviewer is recorded in the audit log, not on public records.

## Lifecycle

- **Ask for changes** now works for word-queue answers: the member sees the reviewer's note
  in Your submissions, taps **Correct your answer**, and the form opens on the word with their
  earlier answer filled in. The correction rewrites the same contribution (history kept in
  `revisions`) and goes back to the review queue.
- **Reject** as a duplicate records the dictionary word it repeats; the member can open it.
- **Regional variants** are published as their own entries, linked to the word they vary.
- **Withdrawal** reaches every place an answer is published — dictionary, expressions,
  language resources — takes back training consent and deletes any training pair.
- Every public record credits the member only as they allowed, and never by an e-mail
  address.

## Practise with Kawuri

A short lesson from a dictionary entry ("Practise with Kawuri" on the entry) or from an
Explore post (in the reel's context sheet). The server rebuilds the lesson from the archive
on every turn: it teaches **only** published dictionary entries; a post supplies the topic,
and its own Kasem — which no reviewer has checked — is labelled "from the post, not
verified". Three questions, answers checked strictly against the entry, then **next steps**:
save the word, read the entry, answer a word in the queue, ask Kawuri something else.

In ordinary chat Kawuri now says when an answer is waiting for review ("members have sent
translations … not verified yet") — it is never shown those unreviewed translations, so it
cannot repeat them.

## Measurements

Firebase Analytics events (no member ids, no typed text): `loop_prompt_impression`,
`loop_prompt_open`, `loop_prompt_dismiss`, `loop_form_start`, `loop_submit`,
`loop_word_request`, `loop_review_outcome`, `loop_verified_entry_view`,
`loop_lesson_start`, `loop_lesson_complete` — with the origin, the queue word, the
decision and what the answer became where relevant.

## Tests

- `firebase/tests/languageLoop.test.mjs` (16): ids against all seeded rows, requests,
  publish-as rules, consent, credit, resource records, withdrawal targets, Kawuri's
  unverified briefing, lessons.
- `firebase/tests/languageLoop.e2e.test.mjs` (3, emulators): request → answer → sent back →
  corrected in place → approved as a translation pair → published → withdrawn; training
  refused without consent and kept with it.
- `firebase/tests/languageLoop.rules.test.mjs` (4).
- `apps/mobile/test/features/contribute/words/language_loop_test.dart` (16), including a
  guest writing an answer, signing in, and the answer surviving unsent.

## Going live

1. Rules and indexes: `firestore:rules`, `firestore:indexes` (the `wordQueue` topic index
   and the `languageResources` entry index), `storage` unchanged by this work.
2. Functions: `requestQueueWord` (new), `submitWordTranslation`, `decideSubmission`,
   `withdrawCollectionContribution`, `kawuriChat`, `onCommunityKawuriMention` (shares
   Kawuri's code) — explicit list, regenerated manifest.
3. Admin hosting (the desk's new choice), then the mobile release.

### Deployment evidence — 2026-09-30

Rules, indexes and Storage rules deployed successfully (exit 0). The six functions above deployed successfully (exit 0), followed by admin hosting (exit 0). `requestQueueWord`, `submitWordTranslation` and `decideSubmission` returned JSON `UNAUTHENTICATED` / "Sign in is required." to unauthenticated probes. `kawuriChat` returned JSON `INVALID_ARGUMENT` / "Ask a question first.". Live `indigen-admin.web.app` asset `index-DHFfGGn7.js` returned HTTP 200 and contains the review selector. No invoker repair was needed for these four probes.

Deployment source: `deploy/2026-09-29-loop-editor`, main `f1519fe` plus the uncommitted merge of `c463581` and the transplanted language-loop/video-editor changes. No commit or push was performed. Local end-to-end emulator tests were not rerun because of the known Node 24 ESM/top-level-await loader incompatibility; the deployed bundle was rebuilt unpatched and its SHA-256 matches `be7564bf2025e3ce271efe948057cefd9ee4176448871c61e339919be26c2f69`. Mobile Play availability and authenticated production workflows remain unverified.
