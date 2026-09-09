# The dictionary screen

*Written 2026-09-08, when the dictionary stopped being one more Collection
channel and became a screen with an alphabet.*

Benchmarked against Pleco, per the Kasem–English Dictionary strategy paper —
and against the specific claim in that paper that roughly a third of what makes
Pleco impressive does not transfer to a Latin-script Gur language at all. What
follows is the transferable part, and the substitutions for the rest.

## What was there

One scrolling list with a search box on top, in the middle of the file that
draws Music, Literature, Audiobooks and Video. That shape answers exactly one
question — *what is this word?* — and everything else a person opens a
dictionary for had nowhere to happen:

- Somebody who wanted to see what the archive holds under `ŋ` scrolled to it
  past every word beginning a through n.
- Somebody who had saved forty words had them on a different screen, filed under
  the app rather than under the language.
- A learner who met `biə` in a text and typed it got the right entry — `bu` —
  with no indication of why, which is the exact moment a dictionary either
  teaches the noun-class system or leaves it a mystery.
- A learner who spelled a word as it sounded got an empty screen, which reads as
  *this word is not in the dictionary* and is usually false.

## The three destinations

Three, because three is what the data honestly supports.

**Look up** — the search. Incremental, ranked, capped at fifty with the total
reported.

**Browse** — the whole archive in Kasem alphabetical order, with a letter rail
down the side. This is what a printed dictionary is *for* and no search box
replaces it: you cannot look up a word you have not met, and browsing is how
vocabulary is actually acquired. The rail lists only the letters the archive has
entries under, because a rail offering `q` sends a reader to an empty screen and
reads as a broken index rather than an honest gap.

**Saved** — the words this reader kept, already on the device, filtered out of
the published list so a word since withdrawn or merged away simply stops
appearing instead of becoming a row that opens on an error.

### What is deliberately not a fourth tab

Flashcards, tone drills and a document reader are the obvious next ones and none
is in this build, because each needs data the archive does not yet hold in
quantity — a study system built over an incomplete lexicon teaches the gaps.
Nothing on this screen shows a word, a form, a recording or a count that is not
in the published archive.

## The five routes into a word

The assumption throughout is that the person searching does not know how the
word is spelled, does not know its tone, cannot type half its letters, and may
well have met it in a form the dictionary does not file it under.

| Route | Answers | Where |
|---|---|---|
| Diacritic folding | types `di`, finds `dɩ` | `foldForSearch` (already there; extended below) |
| Scope | types an English word, finds the Kasem one | `DictionaryScope` |
| Wildcards | remembers `ba…ra`, finds `bakeira` | `wildcardPattern` |
| Morphology | met `biə`, finds `bu`, **and is told why** | `MatchReason` |
| Did you mean | spelled it wrong, is offered the near ones | `didYouMean` |

### The morphology route is the substitution that matters

Pleco spends a great deal of its interface helping a user produce and recognise
Chinese characters — handwriting input, stroke-order animations, camera OCR.
None of that transfers. What transfers is the *principle*: spend the effort on
what is structurally hard about the language.

For Kasem that is noun class morphology. A learner who meets `biə` has no
reliable way to guess the singular is `bu`. Because the plural, definite,
plural-definite and counted forms are stored fields, the search resolves them —
and then the row says *"biə is the plural of bu"*, which teaches the class
system through use rather than through a grammar appendix nobody reads.

Explained only where the match was not the headword. A note on every row is a
note nobody reads.

### The Kasem key bar is the substitution for handwriting input

785 of the published headwords carry a letter no stock keyboard produces: ɩ in
640, ʋ in 195, ə in 177, ɔ in 156, ŋ in 115, ɛ in 9. Folding rescues the reader
who types `di`; it does nothing for the person *writing*, and a contributor or
validator who cannot produce the real letter files the word under a spelling
that is a different word.

Seven keys above the keyboard, with a capitals toggle, shown only while a Kasem
field has the cursor. The system keyboard is already correct for the other
twenty-six letters, and replacing it would cost the user their layout, their
autocorrect and their language.

### One fix to the folding itself

`foldForSearch` stripped combining marks but not precomposed accented vowels, so
`bù` was reachable by typing `bù` and by nothing else — a word only somebody who
already knows the tone can look up, which is the exact failure the file exists to
prevent. Dart has no Unicode normalisation in its core library, so the thirty
precomposed vowels are in the folding table rather than a dependency being added
for them.

## Ranking

Relevance matters *more* in a small dictionary than a large one: with a few
thousand entries a bad ordering puts the right answer on the second screen, where
nobody looks.

0. the headword is exactly what was typed
1. a Kasem rendering is
2. a meaning is
3. the headword starts with it
4. a meaning starts with it
5. it appears anywhere else searched, **including the inflected forms**
6. it appears inside one of the entry's senses

Ties break on **completeness** — an entry with a recording and an example
outranks a bare one — then Kasem alphabetical order, then the sense number.

## Density

The row carries the headword with its sense number where one is owed, the IPA,
the word class, a speaker icon where there is a recording, and **every** meaning
numbered, rather than the first plus a count. The count of an answer is not the
answer, and three short glosses fit on two lines.

An absent recording draws no icon, an entry with one meaning draws one meaning,
and nothing anywhere says "no example yet".

## Files

| File | Role |
|---|---|
| `features/dictionary/dictionary_screen.dart` | the three destinations |
| `features/dictionary/dictionary_search.dart` | ranking, wildcards, morphology, suggestions — pure |
| `features/dictionary/result_row.dart` | one dense row |
| `features/dictionary/kasem_key_bar.dart` | the seven letters |
| `domain/kasem_orthography.dart` | folding and Kasem collation |
| `test/features/dictionary/dictionary_search_test.dart` | 25 tests over the routes |

`DictionaryCollectionScreen` survives as a four-line forwarder: two screens push
it by that name, and the Collection grid is where a member looks for the
dictionary.
