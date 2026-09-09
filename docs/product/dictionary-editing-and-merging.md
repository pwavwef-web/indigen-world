# Editing a published word, and folding two of them into one

*Written 2026-09-08, when the archive gained a way to correct itself.*

## The three bugs this started from

**1. A published entry could not be corrected.** The only path was for somebody
to contribute a correction, wait for review, and have it published as a *second*
document. That produced a duplicate, needed two people for a one-character fix,
and left the wrong entry live in the meantime. In practice nobody used it, and
the archive kept its typos.

**2. Duplicates accumulated and nothing could remove one.** Two members who
cannot see each other's work enter the same word, both are reviewed honestly,
both are published. `firestore.rules` says `allow write: if false` on
`dictionaryEntries`, so there was no delete either — only an unpublish that
leaves the pair sitting there.

**3. A validator could not see the collision at the moment it mattered.** The
review desk showed the submission and nothing about the archive it was about to
join, so a reviewer could read a definition carefully, check the consent, publish
— and leave the dictionary worse than they found it.

## The four callables

All in `services/functions/src/dictionary-admin.ts`, with the pure half in
`dictionary-edits.ts` so every rule is exercisable under `node --test`.

| Callable | Role | What it does |
|---|---|---|
| `findDictionaryEntryMatches` | validator | What the archive already holds under a spelling, exact matches first. Read-only. |
| `previewDictionaryMerge` | validator | Both sides of a proposed merge, field by field. |
| `editDictionaryEntry` | validator | Corrects a published entry in place and republishes it. |
| `mergeDictionaryEntries` | validator (`disposition: 'delete'` needs admin) | Folds a duplicate into the entry that stays. |
| `deleteDictionaryEntry` | admin | Removes an entry, with the whole document copied into the audit log first. |

`firestore.rules` still refuses every client write to `dictionaryEntries`, and
that is not an oversight. Every rule these callables enforce — a headword is
never blanked, a homograph number is never silently reused, a merge leaves a
forwarding address, a deletion is recoverable from the log — is a rule about the
*shape* of the archive, and none of them is expressible in a Security Rule.

## The rules worth knowing

### A patch names what it changes

An absent key means "leave it alone", never "clear it". `EntryPatch.withField`
on the client compares each box against the value it opened with and drops the
ones that match, and `parseEntryPatch` on the server only reads the keys that
arrived. A validator who opened the editor to fix a gloss cannot blank the
etymology a different person spent an afternoon on.

The senses are the sharpest case. A sense may carry four example sentences and
the mobile form shows one pair of boxes, so the senses are included in the patch
**only when a reviewer actually typed in one of them**. Sending them regardless
would silently drop the second, third and fourth sentence off every entry
somebody merely opened.

### Provenance is not editable

`contributorId`, `sourceContribution`, `createdAt`, `approvedBy`, `audioUrl` and
`homographIndex` are not in `EDITABLE_FIELDS`. The person who gave the word
keeps the credit for it however many times a reviewer tidies the spelling, and no
patch can reassign authorship or renumber a citation.

### Respelling is the one case that renumbers

`kasem-homographs.ts` is emphatic that a homograph number is an identity and is
never reassigned. Respelling is the case it was not written for. `mo²` respelled
to `mɔ` is no longer one of the words written `mo`: keeping the 2 leaves a
superscript pointing into a series the entry has left, while the group it has
joined may already have a `mɔ²`. So a respelling that changes `headwordKey` takes
the next free number in the group it moved to, and the number it vacated is never
handed out again. A respelling that only changes case or spacing changes nothing.

### A merge fills blanks; it does not overwrite answers

The target keeps every answer it already has and gains only the ones it was
missing. That is the only default under which merging the wrong pair — or the
right pair the wrong way round — is recoverable, because nothing the target said
has been lost. A reviewer who wants the duplicate's wording says so per field, on
a screen that shows both.

Lists (`translations`, `englishTranslations`, `alsoUsedAs`) and the eleven
paradigm slots are **unioned**, not chosen between. Two members who each recorded
one half of a noun's paradigm — one gave "the boy", the other "two boys" — have
between them recorded the thing the merge was worth doing for. Senses append,
de-duplicated case-insensitively on the definition, so merging the same pair
twice is a no-op.

### Retire, not delete

The duplicate is unpublished and marked `mergedInto`. Deleting it leaves a
dangling id: a member's saved word, a link somebody sent, a Kawuri answer that
quoted it, a note a learner wrote. None of those can be found and updated, and
all of them would read as *the dictionary lost this word* rather than *these were
one word all along*.

So `firestore.rules` grew one exception — a row carrying `mergedInto` stays
world-readable — and `EntryDetailScreen` draws a short forwarding page at the end
of the old link. Hard deletion still exists, is admin-only, and copies the whole
document into `auditLogs` first.

### Which entry stays

The one with the citations, which is usually the older one *even when the newer
one has the better text*. The text moves across; the identity cannot. The merge
screen makes the swap one tap, and clears the per-field choices when it happens —
"take the duplicate's wording" means the opposite thing once the two have changed
places.

## The prompt at review

A dictionary contribution now runs `findDictionaryEntryMatches` before the
reviewer decides anything, and the answer is drawn above the work itself.

It **prompts and never blocks**. Two entries under one spelling is a homograph —
`mo¹` the particle beside `mo²` the focus marker — and a desk that refused the
second would make the dictionary unable to hold a distinction the language makes.

"Merge" from that banner publishes the contribution and folds it into the existing
entry, in that order: the submission is not a dictionary entry, and the id the
merge needs (`collection_<submissionId>`) does not exist until the publish writes
it. The contributor is credited on the record exactly as they would have been.

### Why the duplicate check is not the search folding

`foldForSearch` folds `ɩ` to `i` so a learner who cannot type ɩ still finds the
word. Doing that here would report `dɩ` and `di` as the same entry and invite a
reviewer to merge two different lexemes and call it tidying up. The comparison is
edit distance over `headwordKey` — case- and space-folded and nothing more — with
a similarity floor of 0.7, so a one-letter slip in a four-letter word is offered
and a one-letter difference in a two-letter word is not.

### Why four queries and not one scan

`headwordKey` is written by every publication since it was introduced and is
absent from the oldest rows — which is exactly where the duplicates accumulated.
A lookup trusting it alone would report "no existing entry" most confidently for
the entries most likely to be duplicated. So candidates are gathered by the
grouping key, by the spelling as written, by the spelling lower-cased, and by a
prefix range over `kasemText`. Every one is a single-field query needing no
composite index.

## Files

| File | Role |
|---|---|
| `services/functions/src/dictionary-edits.ts` | the rules, pure and testable |
| `services/functions/src/dictionary-admin.ts` | the callables and their transactions |
| `firebase/tests/dictionaryEdits.test.mjs` | 25 tests over the rules |
| `apps/mobile/lib/features/dictionary/data/dictionary_admin.dart` | the client |
| `apps/mobile/lib/features/dictionary/entry_editor_screen.dart` | the editor |
| `apps/mobile/lib/features/dictionary/merge_screen.dart` | the compare-and-merge screen |
| `apps/mobile/lib/features/validate/submission_review_screen.dart` | the prompt at review |

## What has to be deployed

- **Functions.** The five callables are new; nothing works without them.
- **Rules, separately.** The `mergedInto` read exception is in
  `firebase/firestore.rules`, and a rules deploy is not a functions deploy. Until
  it lands, a merged-away entry reads as unavailable to anyone but staff.
