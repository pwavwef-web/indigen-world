# Exact dictionary duplicate cleanup

The owner requested consolidation of entries with the same Kasem and English
on 2026-10-13. The maintenance script groups unmerged `dictionaryEntries` by
both texts, using Unicode NFC, case folding and whitespace normalization.
It preserves tone marks, extended Kasem letters, punctuation and distinct
English meanings. Missing text is never considered a match.

```powershell
npm run build:functions
npm run dictionary:deduplicate -- --project project-kassena-7e026 --firebase-login
npm run dictionary:deduplicate -- --project project-kassena-7e026 --firebase-login --apply
npm run test:dictionary-deduplication
```

The default is a dry run. Omit `--firebase-login` to use existing application
default credentials. Credentials are never written into the repository.

The script keeps a published identity where possible, then the oldest known
identity. For undated records it prefers a specified word class, then audio,
then a stable document ID. It never publishes an unpublished target, renumbers
a homograph, or changes contributor identity.

Each merge re-reads both documents in a transaction and checks that both texts
still match the plan. Content uses the existing dictionary merge rules, with
additional unions for source references, source attestations, tags, audio
variants and examples within matching senses. An audio URL moves with its
provenance. Known additional word classes are retained in `alsoUsedAs`.
Source scalar conflicts remain on the original source document and in the
audit snapshot rather than overwriting the kept entry's wording.

The redundant document is retained with `isPublished: false` and `mergedInto`.
The kept document gains `mergedFrom`. Full before-images of both documents go
into `auditLogs`, using a deterministic audit ID. Retrying a completed merge
does not write again. All planned content merges are checked before live writes;
a sense or example that would be truncated by the contract stops the run.

Full collection snapshots, the plan and the final verification are saved under
`data/private/dictionary-cleanup/<timestamp>/`, which Git ignores. The script
reads the collection again after applying and requires zero remaining groups.
Source records, including sentences and unpublished records already stored in
this collection, are consolidated without changing their publication or scope
classification.

The orthography and grammar source-import scripts follow existing merge
redirects when matching stable source IDs. They attach evidence to the kept
entry instead of republishing the retired record. A broken or cyclic redirect
stops a reimport. This safeguard is local tooling and needs no Functions deploy.

This is a data-maintenance correction, so it does not add a release post or
publish community communications.

## Verified live result, 2026-10-13

The production `(default)` database in `project-kassena-7e026` was confirmed as
Standard edition. The run completed at 20:32:17 UTC. It scanned 1,644 documents
and consolidated 36 duplicate pairs. Thirty-four redundant sources had been
published, bringing the published count from 1,588 to 1,554. The other two
sources were already unpublished. A full subsequent scan found zero unmerged
duplicate groups under the matching rule above.

Integrity checks confirmed all 1,644 documents still exist, all 36 retired
sources retain their original content, kept entry identities and publication
states are unchanged, and the 1,572 documents outside the merge plan are
unchanged. The run's private snapshots, plan, verification and integrity results
are in `data/private/dictionary-cleanup/2026-10-13T20-31-26-182Z/`.
