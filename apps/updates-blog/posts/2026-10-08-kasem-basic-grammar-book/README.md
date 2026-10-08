# Kasem grammar sentences and word forms from the book

Status: **Article unpublished. Production content published and verified October
8, 2026. Web guide/navigation and Kawuri changes implemented; deployment pending.**

| Field | Value |
|---|---|
| Title | Kasem grammar sentences and word forms from the book |
| Labels | `Kasem`, `Dictionary`, `Grammar`, `Learning`, `Kawuri`, `Feature` |
| Search description | Explore nine Kasem grammar chapters, 56 rules, complete source examples, noun and verb tables, and new dictionary words and forms. |
| Suggested permalink | `kasem-basic-grammar-book` |

## What changed

- The entire editable reference: nine chapters, twelve tables and 1,638 source
  blocks, including front matter and documented transcription damage.
- 421 lexical/form records: 412 dictionary source records across 410 distinct
  documents, plus nine expressions. 363 dictionary documents are new; 49 source
  records add book attestations on 47 existing documents.
- 56 grammar summaries covering all chapters; 237 extracted examples, including
  196 clear pairs published for exact lookup and 41 marked uncertain examples.
  57 withheld extraction candidates remain available in the reference.
- Grammar navigation in the dictionary, website and contributor editor, and
  current source-based grammar and example retrieval in Kawuri.

## Images and credits

- `images/grammar-guide-desktop.png` (1440 × 1050): actual grammar guide preview.
- `images/grammar-guide-mobile.png` (390 × 844): actual guide at phone width.
- `images/future-continuous-rule.png` (1008 × 492): actual expanded rule,
  explanation, source examples and citation.
- Credit: Indigen World product screenshots, October 8, 2026, initially captured
  from the local dictionary preview. Source text credit: P. L. Hewer / GILLBT.
- Regenerate using `node scripts/check-grammar-guide.mjs`. Set
  `GRAMMAR_PREVIEW_URL` to the preview or confirmed live origin.
- Blogger: **Insert image → Upload from computer** for all three PNGs. Replace
  relative `src` URLs in `post.html` with the resulting Blogger image URLs;
  retain descriptive alt text, dimensions and captions.

## Publishing and sharing handoff

1. Confirm the release evidence and availability paragraph below.
2. Upload the actual images, replace their URLs and paste `post.html` into
   Blogger HTML view. Apply the title, labels, search description and permalink.
3. Preview the article on phone and desktop. Chinedum can publish it and replace
   the clearly marked article URL placeholder in `share.md`.

The owner's automatic-publication request applies to the project content.
No Blogger publication or external message has been sent.

## Release evidence

- Source import completed: 673 writes across 671 distinct destinations;
  anonymous dictionary client verified all 421 word/form/phrase pairs.
  `dictionaryImports/gillbt-basic-grammar-1983-2014` is published and authorises
  provider retrieval while model-training permission remains false.
- Compiled active production loader: 1,588 words, 281 book examples/expressions,
  84 book rules across both books, including all 196 new grammar examples.
  Future continuous, pronouns and “I didn’t sweep” answers verified.
- 68 relevant backend tests passed. Website typecheck, validation, 15 tests and
  build passed; dictionary checks/build passed; TribeStudio checks, 68 tests and
  build passed. Browser checks verified 56 rules, nine chapters, twelve tables,
  both filters, source row counts, phone width and no JavaScript errors.
- Recovery snapshot retained privately at
  `production-backups/kasem-grammar/2026-10-08T16-51-23-753Z.json`.
- Firebase Hosting and the two Kawuri functions: deployment pending.
- No Android bundle or Google Play rollout is part of this content update.

Reproducible extraction and import notes: [source README](../../../../data/grammar-book-seed/README.md).
