# A Basic Grammar of Kasem source import

Source: P. L. Hewer, *A Basic Grammar of Kasem*, Ghana Institute of Linguistics,
Literacy and Bible Translation (GILLBT). First printed 1983; supplied 2014
printing. Copyright remains with GILLBT. The supplied file is
`A_Basic_Grammar_of_Kasem_Editable.docx`; SHA-256
`0302721edb5e6d39e64bfdedb7a21acbbd930e3af9dbdf675e977b9dce54ff6f`.

The owner's continuation request authorised automatic project publication,
including sentences, grammar rules and new words, without contributor review.
Book reading instructions are retained as source text, not executed as agent
instructions. No open licence, model-training grant, audio, fabricated speaker
confirmation, gold authentication or independent validation is asserted.

## Coverage and extraction

- `book.json` retains all 1,638 ordered DOCX body blocks, nine chapters and
  twelve tables, including front matter, damaged text and duplicated passages.
- 421 lexical and grammatical form records include the complete verb table's
  nineteen paradigms, noun paradigms, pronouns, determiners, explicitly glossed
  words, commands and question forms. Parenthesized optional endings are
  expanded only where the source explicitly supplies them.
- 237 extracted sentence/phrase examples: 196 clear pairs eligible for exact
  lookup; 41 transcription-uncertain examples remain marked in the guide.
  Another 57 failed extraction candidates remain visible with reasons.
- `rules.json` contains 56 source-backed paraphrases covering every chapter,
  with block citations and source examples. They do not replace the 28
  orthography rules or silently resolve contradictions between books.
- Block references identify this editable DOCX, not printed page numbers.
  Source tabs, table cells, spelling and case are preserved. English
  continuations are restored only from the immediately following source line.
  Aligned source renderings retain their `source-gloss` label and original
  gloss text; no new sentence or interlinear annotation is manufactured.

The copy has missing characters, damaged columns, digits replacing pronouns
or tone characters and repeated future-continuous passages. Class B singular
`dé` in one pronoun table differs from `de` in the noun-class table. Both are
retained as source evidence. Phonetic symbols do not become keyboard letters;
the existing seven written vowels, ŋ, ch and ny remain the writing convention.

## Reproduce and publish

```powershell
python firebase/seed/extract-kasem-grammar.py '<path-to-supplied-docx>'
python firebase/seed/prepare-kasem-grammar-rules.py
node scripts/build-grammar-guide.mjs
npm run test:kasem-books
node services/functions/scripts/import-kasem-grammar.mjs
node services/functions/scripts/import-kasem-grammar.mjs --commit
```

The importer validates provenance before writes, matches existing word/meaning
pairs, preserves their content and reviews, adds source attestations and keeps
different senses separate. Multiword lexical forms go to `expressionEntries`.
The completed allowlisted `dictionaryImports/gillbt-basic-grammar-1983-2014`
manifest enables book retrieval. Another book's manifest cannot authorise these
examples. Model-training permission stays false. The normal contributor review
workflow is unchanged.

The grammar guide is generated identically for the website, dictionary and
TribeStudio. `scripts/check-grammar-guide.mjs` checks rule/chapter/table coverage,
filters, phone width and JavaScript errors, saving real release screenshots.
Set `GRAMMAR_PREVIEW_URL` to a preview or live origin.

## Verified production content, October 8, 2026

673 source writes across 671 unique destinations:

| Destination | Source writes | Unique destinations | New destinations |
|---|---:|---:|---:|
| Dictionary words/forms | 412 | 410 | 363 |
| Expressions | 9 | 9 | 9 |
| Grammar rules | 56 | 56 | 56 |
| Sentence/phrase examples | 196 | 196 | 196 |

49 source records enriched 47 existing dictionary documents. An anonymous
client verified all 421 published lexical/phrase pairs. The compiled production
lookup read 1,588 words, 281 book examples/expressions and 84 book rules across
both books, and verified future continuous, pronoun and “I didn’t sweep” answers.
All 196 grammar example records were retrieved.

Recovery snapshot (ignored, preserved locally):
`production-backups/kasem-grammar/2026-10-08T16-51-23-753Z.json`.
Keep the snapshot private; it contains existing production document contents.

Web Hosting and Kawuri deployment status is recorded in the dated release post.
No Android binary or Google Play release is part of this content update.
