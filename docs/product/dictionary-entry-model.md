# The advanced dictionary entry

*Written 2026-09-07, when the entry gained several senses and TribeStudio
gained a desk to write them at.*

## The bug this started from

The contribution form asked *"what does it mean in English"* exactly once.

A member adding **toy** could record that it is a plaything. There was nowhere
at all to say that it is also a trinket, also a small breed of dog, and also a
verb — before the form even reaches word classes. What everybody did instead
was type all of them into the one box separated by commas, and the archive
stored that as **one meaning whose text happened to contain commas**, with one
example sentence attached to none of them.

The example sentence is the part that suffered most. A learner could see a
sentence and had no way to know which meaning it illustrated, which is most of
what an example is for.

## Senses are not homographs

This is the distinction the whole change turns on, and it is the commonest way
a dictionary schema goes wrong, because both render as "1." and "2." on the
page.

| | **Homograph** | **Sense** |
|---|---|---|
| What it is | Different *words* sharing a spelling | Different *meanings* of one word |
| Example | `mo¹` the focus particle beside `mo²` | *toy*: plaything / trinket / small dog |
| Storage | Separate documents, separate ids | One document, one `senses` array |
| Numbering | Assigned once on the server, **never reassigned** | Positional, changes if reordered |
| Why it matters | A citation of `mo²` must point at the same word for ever | A reader needs the meanings kept apart on one page |

`homographIndex` and `senses` are therefore both present on an entry and mean
completely different things. 478 of the 1200 published entries share a spelling
with another entry; eight are headed `ni`. Those stay separate documents.

## The record

```jsonc
{
  "kasemText": "bakeira",
  "englishText": "bottle, flask",        // the flat summary line — unchanged
  "englishTranslations": ["bottle", "flask"], // the same list, split
  "senses": [
    {
      "definition": "bottle",
      "register": "everyday",            // one of SENSE_REGISTERS
      "domain": "house",                 // one of SENSE_DOMAINS
      "kasemDefinition": "…",            // this meaning, said in Kasem
      "usageNote": "…",
      "examples": [{ "kasem": "…", "english": "…" }],
      "synonyms": ["…"],                 // words, not entry ids — see below
      "antonyms": ["…"]
    },
    { "definition": "to bottle something", "partOfSpeech": "verb", "…": "…" }
  ]
}
```

Four files define this shape and **all four must agree**:

| File | Role |
|---|---|
| `packages/contracts/schemas/lexical-entry.schema.json` | the contract |
| `services/functions/src/lexical-senses.ts` | parsing, storage shape, the legacy lift |
| `apps/mobile/lib/domain/entry_sense.dart` | the phone's reader |
| `apps/tribestudio/src/creator/lexicon.ts` | the web editor's vocabulary |

### Why nothing was migrated

`sensesOrLegacy` (server) and `DictionaryEntry.displaySenses` (phone) lift a
legacy entry's flat gloss and single sentence into **one sense, on read**. No
stored row was rewritten, and an entry approved last year still publishes
byte-for-byte as it did. The consequence worth stating: a screen written
against `displaySenses` renders the whole archive correctly on the day it
ships, including the fifteen thousand entries nobody is ever going to
re-contribute.

The reverse direction is covered too. `englishText` stays the flat summary line
every existing reader consults, and `englishTranslations` carries the same list
split — a field `collection_data.dart` already read first and that nothing had
ever written. So a build that has never heard of senses shows
`"plaything, trinket, small dog"` exactly as it always did, and a build that
has shows three meanings with their own examples underneath.

### Why a single bare sense is not stored

One sense carrying nothing but a definition says exactly what `englishText`
already says. `sensesAddDetail` refuses it, so the array does not land on
fifteen thousand rows to repeat one string.

### Why synonyms are words, not entry ids

A speaker asked for a word that means roughly the same thing answers with a
word, and that word very often has no entry yet. Storing ids would mean
refusing to record the answer until the referenced word had been contributed,
reviewed and published — which loses exactly the vocabulary the cross-reference
was pointing at, and loses it silently.

So the record keeps the word, and the renderer resolves what it can:
`dictionaryEntryIdsByHeadwordProvider` turns a synonym with an entry into a
chip that opens it, and leaves one without as plain text.

### Why register and domain are closed lists

Free tags produce `farming`, `farm`, `Farming` and `agric` on four entries that
mean the same thing, which defeats the one query the field exists to serve:
*show me the vocabulary of the farm*. A closed list is browsable; an open one
is not.

The labels are deliberately **not** the standard lexicographic abbreviations.
"colloq." is a vocabulary a contributor has to be taught, and this form is
answered by speakers. `avoided` is not called "vulgar" for the same reason —
what a Kasem speaker will actually tell you is who they would not say it in
front of.

---

# The twenty features

Researched against the conventions of descriptive bilingual lexicography (TEI
Dictionaries, the Lexical Markup Framework, and the microstructure of OED /
Longman DCE / Merriam-Webster) and the practice of field lexicography for
under-documented languages. Every one of them is implemented; the last column
says where.

## Writing an entry — the contribution form and the studio desk

| # | Feature | Why this dictionary needs it | Where |
|---|---|---|---|
| 1 | **Several meanings per word**, add / remove / reorder | The bug at the top of this file. A word is not one meaning. | `sense_fields.dart`, `DictionaryPage.tsx` |
| 2 | **Per-sense example sentences**, up to four | The question was never "give a sentence for this word" — it was "give a sentence for THIS meaning of it". | both |
| 3 | **Sense-level word class** | A word that is a noun in its first two meanings and a verb in its third is ordinary, not exotic. Recording it as a second entry would be a homograph, which means something else. | both |
| 4 | **Register labels** — everyday, respectful, joking, *not said in front of elders*… | Register is a property of a *meaning*, not of a word, and it is the first thing a learner gets wrong. | both |
| 5 | **Subject-field labels** — farming, kinship, market, chieftaincy… | Makes the archive browsable by the thing people actually want: the vocabulary of a domain. | both |
| 6 | **Per-sense Kasem gloss** | The entry-level one covers the word; this covers one meaning of it, for words whose senses are too far apart for a single gloss. | both |
| 7 | **Usage notes** per sense | When to say it, when not to, what it goes with. | both |
| 8 | **Synonyms and opposites** per sense | The cross-reference layer a dictionary is unusable without. | both |
| 9 | **A Kasem character palette** on the web desk | 785 of 1200 published entries carry a letter no desk keyboard produces. Without it the workaround files words under a spelling that is a different word. | `DictionaryPage.tsx` |
| 10 | **A live preview of the published entry** | A contributor filling in eleven paradigm slots otherwise has no idea what any of it looks like. It is the same layout the app draws, from the same fields, in the same order. | `DictionaryPage.tsx` |
| 11 | **Duplicate and homograph detection while typing** | Warns, never blocks: two entries under one spelling is a homograph, not an error. It tells somebody adding a second *sense* of an existing word to add it as a sense. | `dictionary-data.ts` |
| 12 | **Draft autosave** | A four-sense entry with a paradigm is twenty minutes of work and one stray reload. Consent is deliberately never restored. | `lexicon.ts` |
| 13 | **A completeness meter** | Guidance, never a gate — a form that refused an honest small record until somebody invented an etymology would trade truth for size. An invariant in `validate-studio.mjs` holds it to that. | `lexicon.ts`, `DictionaryPage.tsx` |
| 14 | **The full paradigm editor on the web**, class-aware | Eleven slots that previously existed only on the phone, so the person best placed to write a careful entry no longer has the worst tool. | `DictionaryPage.tsx` |
| 15 | **One pipeline for both clients** | The web desk submits through `submitCollectionContribution` — the same callable, review desk, homograph numbering and published document as a phone contribution. The difference between the clients is screen size, not record shape. | `dictionary-data.ts` |

## Reading an entry — the dictionary

| # | Feature | Why this dictionary needs it | Where |
|---|---|---|---|
| 16 | **Numbered senses, grouped by word class** | The one convention every printed dictionary shares, because it answers "is this the noun or the verb?" before a reader has to read a definition to find out. | `sense_list.dart` |
| 17 | **Examples under the meaning they illustrate** | With the entry-level Example card suppressed so no sentence is printed twice under two headings. | `sense_list.dart`, `entry_detail_screen.dart` |
| 18 | **Register and domain shown as chips on the sense** | "Not said in front of elders" is a fact about a meaning; anywhere else on the screen it attaches to the wrong one. | `sense_list.dart` |
| 19 | **Cross-reference chips that open the referenced entry** | Resolved where an entry exists, plain text where it does not, and visibly different. | `sense_list.dart` |
| 20 | **Search that reads every sense** | A three-sense entry whose *second* meaning was the one somebody wanted simply did not exist for them. Sense hits rank below every direct hit, so a headword match always wins. | `dictionary_entry.dart`, `kasem_orthography.dart` |

### The rule every one of them had to pass

*The median word costs zero extra taps.* A member who types a meaning, picks a
word class and sends has seen three boxes. Everything above is optional, and
everything beyond the first meaning is behind a disclosure that starts closed.
A queue that grows a field per word is a queue people answer four words in
instead of twenty.
