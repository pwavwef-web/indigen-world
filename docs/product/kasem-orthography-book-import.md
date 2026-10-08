# Kasem orthography book import

The owner requested all words, rules, sentences and appendix content from the supplied corrected DOCX, directly published without review. Publication is restricted to this source import; it does not remove ordinary contributor review.

Source: Kasem Language Committee, *Kasem Orthography: Spelling Rules*, Bureau of Ghana Languages, 1997. The supplied corrected document is the extraction authority, not an instruction file. Its checksum is in `data/orthography-seed/book.json`.

## Reproduce and publish

1. Use the bundled document Python runtime with `python-docx` to run `firebase/seed/extract-kasem-orthography.py <corrected-document.docx>`. It extracts all 646 vocabulary rows, grammatical terms, appendix forms and written spelling examples. Phonetic tables and explicitly rejected spellings do not become headwords.
2. `node scripts/build-orthography-guide.mjs` generates the public reference for website, standalone dictionary and TribeStudio. `rules.json` paraphrases the book’s rules; source examples retain their spelling.
3. `npm run build:functions`, then `node --test firebase/tests/orthographyBook.test.mjs firebase/tests/kawuriGrounding.test.mjs firebase/tests/grammarRules.test.mjs firebase/tests/kasemCorpus.test.mjs`.
4. `node services/functions/scripts/import-kasem-orthography.mjs` inventories the authenticated project and validates all source content before writing. It uses existing Firebase CLI authentication without displaying credentials.
5. `node services/functions/scripts/import-kasem-orthography.mjs --commit` publishes and verifies deterministic records. `GCLOUD_PROJECT` can point to an emulator or an explicitly chosen project. Default project is `project-kassena-7e026`.

The import preserves every existing destination document in an ignored recovery snapshot before writes. It merges source references into exact existing word/meaning matches. It never erases pronunciation recordings or reinterprets a different homograph. Reruns use the same deterministic source IDs.

## Publication and retrieval

Words/forms go to `dictionaryEntries`, whole expressions to `expressionEntries`, rules to `grammarRules`, and translated source examples to `kasemSentences`. The two ambiguous conditional examples and the untranslated example are kept in the guide but excluded from exact sentence answers. Printed examples have zero independent speaker confirmations, no audio and no invented literal gloss.

`dictionaryImports/bgl-kasem-orthography-1997` records the user's direct-publication instruction and remains `importing` while batches are written. Kawuri accepts these examples and rules only after the server-owned manifest is `published` with retrieval enabled, and rechecks each record. Source publication is labelled explicitly; it does not imitate gold authentication or normal speaker review. No model-training grant or training job is created.

The old blanket definiteness statement is corrected both in the production record and its seed: nouns and determiners are written fully as separate words.

## Orthography scope

The seven written vowels are a, e, i, o, u, ɛ and ɔ. Written consonants include ŋ, ch and ny. /ɩ/, /ʋ/ and /ə/ are sound symbols; their ordinary spellings follow the book's position-sensitive rules. The book rejects ɣ and nasal/vowel-quality diacritics. Its specified tone distinctions use acute and occasionally grave marks, without a general macron.

Character suggestions follow those written forms across the Android IME, Flutter palettes, standalone dictionary, contributor/creator editors and website labs. Historical records/search folding are retained rather than mechanically respelled. Existing dialect evidence must not be destroyed by a position-insensitive character replacement.

## Source limitations

Vocabulary ɑ and appendix à for plural you conflict with the explicit á rule. The keyboard uses á; source forms and the conflict remain documented. The third-person emphatic amo and several gloss/POS typos remain attributed to the source. Two na examples are identical while their English meanings differ. The blank zwi gloss on page 58 uses the explicit birds gloss on page 57. None of these issues is turned into a claim of a new speaker review.

## Release evidence

2026-10-08: production import verified all 994 planned source writes across 991 destination documents: 889 dictionary source records represented by 886 dictionary documents (23 initial existing matches, including three shared destinations), five expressions, 29 grammar writes (28 book rules and one existing-rule correction), 71 source examples. Anonymous reads verified every normalized source word/meaning pair. Private final recovery snapshot: `production-backups/kasem-orthography/2026-10-08T10-28-01-458Z.json` in the release worktree.

Hosting successfully released all three sites; their public guides matched the generated artifact. The live dictionary guide passed desktop/mobile layout, vocabulary-filter and JavaScript checks. Both `kawuriChat` and `onCommunityKawuriMention` deployed successfully from `main` at `cb0eb9ffc88b96565888e38da0eea6f5eeb55693`. A fresh production read through the compiled active grounding loader returned 1,225 published words, 76 printed book expressions/examples and 28 book rules; alphabet and “we came” answers were verified. All 62 backend checks and eight relevant mobile tests passed.

See the release post for final Hosting, Kawuri and Android binary status. Web data can reach existing clients through their normal sync; the Android IME change requires a new app binary. No Play rollout is inferred from source publication or an AAB build.
