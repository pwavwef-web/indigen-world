# Bounded Kawuri retrieval index

The default remains the existing fail-closed reader. To use the new reader,
`KAWURI_CANDIDATE_INDEX=true` **and** `kawuriIndexState/current` with schema 1 and
ready true are required. Neither is set by this implementation session.

`kawuriCandidates` contains source collection/ID and SHA-256 normalized selector
keys, never display wording or permission decisions. Existing default-deny rules
keep it private. The query uses the normal automatic array/document-ID indexes;
no public rule changes. At most 12 keys, four pages of 100 candidates (+ one
lookahead per page), 100 fresh sources per getAll, and 100 corpus IDs per resolver
batch. Exactness is still determined from current source wording, never keys.
Source reads and corpus release/revision, rights, policy, current reviewer grants,
relationships and source-family split checks run on every request.

Legacy sentence evidence requires the complete existing family computation.
When selected, its source graph is read fresh up to 4,001 records; if it exceeds
4,000, that source is withheld and other indexed sources remain available.
This is a remaining scaling limit, not a partial graph being treated as safe.
Dictionary/contributor/corpus/book retrieval no longer fails merely because a
collection has more than 4,000 rows. Practice's existing reader is unchanged.

## Deployment order (operator handoff; not performed)

1. Build/test Functions. Deploy only the seven `on*Candidate` triggers first.
   They reread the current source in a transaction, making delayed events safe.
2. Dry-run each source with `node services/functions/scripts/backfill-kawuri-candidates.mjs
   --project PROJECT --collection SOURCE`. Requires Node 22, the functions build,
   Admin credentials for that project, or an isolated Firestore emulator.
3. After reviewing counts, repeat with `--apply`. Resume each bounded invocation
   using its `nextCursor` as `--after`. Only a continuous saved checkpoint can
   mark a source complete. `--pages` defaults to 10 (100 max). No corpus is printed.
4. When all seven sources are complete, use `--mark-ready` first as a dry run,
   then `--mark-ready --apply`. Do not mark ready before live triggers are active.
5. Enable the environment flag on the shared answer functions, then check exact
   and refusal cases in staging. Deploy callers only after candidate readiness.
   Missing/not-ready state uses the old reader throughout the transition.

Rollback: disable `KAWURI_CANDIDATE_INDEX` (or set readiness false). The original
reader and all source documents remain intact. Candidate documents can remain
private while triggers are rolled back. There is no source ingestion, permission
migration, provider upload, or production backfill in this branch.
