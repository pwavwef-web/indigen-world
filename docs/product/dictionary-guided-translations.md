# Dictionary-guided Kasem translations — October 18, 2026

## Outcome and release

Implemented inside the existing TribeStudio assigned sentence editor. Production deployment is pending final release verification; the release post will record the confirmed function revisions and Hosting evidence. No native Flutter or Play Store release is part of this work.

## Existing data inspected before implementation

The existing production Firestore `(default)` database is STANDARD edition in `nam5`. A read-only inspection of published `dictionaryEntries` found 1,554 records. All had `kasemText`, `englishText` and a `partOfSpeech` field, though some classifications explicitly say the source did not specify one. The archive contains multiple schema generations: `headword`, legacy English `translation`, current Kasem `translations`, structured `senses[].definition`, `englishTranslations` and `forms`. The existing `dictionaryRecordFrom` adapter is reused. `translations` is the Kasem side; singular `translation` is a legacy English gloss.

The sample contained 29 tone-marked headwords, 31 records with structured senses, 16 with forms, 704 with audio URLs and one with IPA. Multiple records can share a headword and have different meanings. Real sampled records include `vei`, `véi`, `vèi`, `deém`, `Bakeira`, `sɔŋɔ` and the compound `ampʋlɩ bu`. These spellings were retrieved, not generated. A minimal public-record fixture retains original database identifiers; the full audit output stays in gitignored `data/private/translation-assistance/`.

Publication uses `isPublished`; merged records and explicitly non-public material are excluded. Publication alone does not prove individual speaker verification: source-book imports carry `publicationMode: owner-direct-source`, whereas normal approved contributions can carry `approvedBy`. The UI distinguishes recorded approval, published source records and missing review metadata. Pending nominations stay in `collectionContributions` and canonical `submissions`, then use the existing reviewer-controlled publication process.

The repository's BGL Kasem Orthography (1997) reference documents acute and grave distinctions and says ordinary words do not need every tone marked (`data/orthography-seed/rules.json`, pp. 26–29). The configurable `KASEM_ORTHOGRAPHY` module removes only U+0300/U+0301 in comparison copies. It preserves ɛ/ɔ/ŋ, vowel length, nasalization, macrons, other marks and the raw submitted string. It does not derive an orthography from an AI model.

## Implemented behavior

- Source vocabulary appears beneath the assigned English sentence. Whole English senses and a conservative English inflection mapping find relevant records; substring matching such as “go” inside “goat” is rejected. Multiple spellings and meanings remain separate. Recorded approval ranks first. Source changes discard stale results.
- Clicking a vocabulary choice inserts the exact stored spelling at the saved selection/cursor, opens the translation section and brings the editor into view. Appropriate word-boundary spaces are added without rewriting existing text.
- Tone review uses exact and tone-insensitive in-memory indexes built from the existing paged server dictionary snapshot. It offers only additions compatible with tones already supplied. A correct marked form is left alone. An unmarked exact match still gets alternatives when other documented tone patterns exist.
- Gentle blue dotted underlines are painted over the native textarea; the native editor retains selection, copy/paste, IME and editing history. Click/tap or Alt+Down opens a viewport-bounded, scrollable choice menu. Meanings, available word class, IPA, headword audio and publication/verification labels accompany the spelling. Tone-bearing graphemes are emphasized. Audio is loaded only on demand and is not claimed to be a human recording.
- Selecting a choice replaces one validated UTF-16 range against an unchanged text snapshot. Identical words elsewhere, spaces, punctuation and combining characters stay intact. Native `insertText` transactions support undo/redo in tested Chromium browsers. Unsupported insertion receives a manual-paste instruction rather than a destructive `.value` assignment.
- Dismissal and “Keep my spelling” apply to one occurrence during that editing session. Unaffected decisions follow surrounding edits; editing that occurrence invalidates its decision. Selecting an unmarked form is an explicit choice and does not immediately trigger the same review again.
- Dictionary settings persist locally and independently control suggestions and highlighting. Suggestions default on. Nothing rewrites a sentence without selection.
- The normal check stage and confirmation dialog show dictionary-match, review-suggested and missing-word counts. The explanation says these cannot establish grammar, context or correctness. Unknown and dialectal forms do not block submission.
- Missing words can be nominated with meaning, word class, dialect, source, permission and an editable spelling for known tone marks. The existing idempotent nomination service and reviewer queue are reused. Nominating does not alter the translation, publish a word or award points.
- `saveExpressionAnswer` now stores the exact submitted translation, including decomposed Unicode and whitespace. Blank-only submissions are still rejected. Existing account permissions, immutable review rounds, optimistic revisions, autosave, consent, history, reward and training workflows remain in force.

## Responsiveness and integrity

No new AI request is made. Lookup waits 550 ms after typing; requests coalesce across fields and review components into batches of 80. Client memory holds at most 2,000 term results; known/review matches expire after 60 seconds and missing results after 15. A small 20-source cache avoids repeated sentence requests. Failed requests never become dictionary misses. Old responses are ignored after edits/unmount. Active fields and review summaries retry, including review reconnection handling.

The server shares the existing 60-second, paged dictionary snapshot, capped at 25,000 published records. Incomplete scans are explicitly marked and cannot establish absence. Exact/tone indexes are constructed once per snapshot. Similar-spelling assistance remains a clearly labelled fallback. Source recommendations are bounded to 24, alternatives to 40 per term, and contiguous phrases to six words/160 characters. A stress check completed 16,000 indexed matches against a synthetic 25,000-record index within the three-second test allowance (about 0.4 seconds locally).

## Changed files

- Shared comparison, token ranges and occurrence decisions: `packages/contracts/dictionary-assistance.mjs`, its declaration file, `kasem-spelling.d.ts` and package exports.
- Dictionary record extraction, indexes and authenticated read-only callable: `services/functions/src/dictionary-assistance.ts`, `kasem-spelling.ts`, `index.ts`.
- Exact translation persistence: `services/functions/src/contributor-portal.ts`.
- Native editor, settings, source cards, review and nominations: `apps/tribestudio/src/spelling/{DictionaryAssistance.tsx,KasemField.tsx,WordSubmission.tsx,data.ts,lookup-cache.ts,spelling.css}` and `src/contributor/editor.tsx`.
- Development-only English demonstration task: `apps/tribestudio/src/contributor/ContributorPreview.tsx`.
- Meaningful tests and public fixture: `firebase/tests/dictionaryAssistance.test.mjs`, `fixtures/translation-dictionary.json`, extended `kasemSpelling.integration.test.mjs`, `apps/tribestudio/scripts/dictionary-assistance-browser.test.mjs`, the existing spelling browser regression and workflow component mocks; root npm scripts.
- Read-only inspection tool: `services/functions/scripts/audit-translation-dictionary.mjs`.
- This report and the new dated release post, article images, Blogger instructions and sharing handoff, linked from the release index.

## Validation

Final run status is recorded with the release evidence. Completed checks:

- Functions TypeScript build and bundle; TribeStudio typecheck, design-system validator, all 79 frontend workflow tests and production build.
- 66 backend/unit checks covering dictionary behavior, existing contributor submissions/review/consent, and reward arithmetic; 15 focused assistance/spelling/cache checks (some overlap).
- Five real Firestore emulator checks: auth/bounds/private-data filtering; canonical nominations and duplicate retry protection; pending/approved status; real-schema word/phrase suggestions without side effects; exact-Unicode sentence submission and retry through the normal review queue, with no immediate points.
- All 14 existing rewards emulator checks, including concurrent spending, immutable assessed awards, ambiguous provider outcomes and the real local Python assessment worker.
- Both existing spelling-regression browser scenarios, desktop and 390 px touch mobile.
- Both new browser scenarios: actual dictionary source vocabulary, selection/cursor insertion, tone ambiguity, preserved duplicate meanings, individual replacement before punctuation, undo/redo, retained spelling, settings, IME, delayed response after removal, offline editing, gap nominations and normal reviewed submission. External calls are intercepted; production receives no test contributions.
- Visually inspected raw desktop/mobile captures; release artwork generated from those exact captures.

## Schema, deployment and limits

No collection, schema migration, backfill, index or rule change is required. The new callable and `saveExpressionAnswer` require deployment alongside `hosting:tribestudio`; unrelated sites/functions need no release. Dictionary IDs identify the response choices but are not persisted as extra contribution metadata. This avoids changing existing save and review contracts or duplicating dictionary text.

Coverage and contextual meaning remain dictionary-dependent. Conservative English matching can miss paraphrases and cannot disambiguate every English sense; the contributor chooses. This does not judge Kasem grammar or automatically require tone on every word. Source publication is not independent speaker confirmation. Phrase, result and snapshot bounds are deliberate and flagged where relevant. Per-occurrence session decisions reset on task reload. Native undo/redo is verified in Chromium, not on every browser/keyboard. Audio availability reflects the existing record and may include existing reviewed synthetic audio.

Production verification checks function state, callable authentication and served build assets. It does not create a real signed-in production translation or nomination. The full emulator/browser flows provide the submission evidence. Blogger publication and community sharing remain with Chinedum.
