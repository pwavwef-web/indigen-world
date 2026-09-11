# Dictionary collection and training consolidation

Assessment: 2026-09-11. Queue fixes implemented locally; the consolidation below is a proposed implementation design. No production inventory, migration or training run has been performed.

The guided queue already feeds the ordinary dictionary submission and review workflow. Sentence training uses the separate, versioned `kasemEvidence` workflow. Consolidate their collection experience and link their evidence; preserve their different publication and training decisions.

## Confirmed collection failures

- `nextQueueWords` restarted from the first open rank and stopped after 600 rows, including rows the contributor had already handled. A contributor with that prefix in their history could receive an empty batch repeatedly despite later available words. The scan now allows the unique saved history plus 600 candidate rows, with an exact final-page cap. At the supported history limits this is at most 4,600 reads; ordinary requests still stop when a fresh batch is found.
- Submit and skip compared history lengths to detect retries. At 2,000 IDs, appending evicts an old ID, so the length does not change. New submissions were rejected as duplicates and new skips were not recorded. Both paths now check membership before appending, inside their existing transactions.
- History still intentionally evicts old IDs. This fix does not provide lifetime deduplication. If contributors exceed that window, introduce a per-user/per-prompt response ledger and paginated serving cursor; preserve a deliberate revisit path for skips and rejected answers. Measure queue read costs before scaling beyond the current pilot.

## Existing sources of truth

| Record | Responsibility |
| --- | --- |
| `wordQueue` | English collection prompts, rank, prompt attribution and sentence-fit feedback. A prompt is not a Kasem dictionary sense. |
| `submissions` and `collectionContributions` | Original word answer, contributor, source, permissions and dictionary review workflow. |
| `dictionaryEntries` | Published lexical entries, senses, forms and merge redirects. |
| `kasemEvidence` and its revisions/reviews | Sentence attestations, exact text revisions, purpose permissions and independent judgments. |
| `kasemDatasetReleases` | Reproducible eligible examples, split assignments and release lifecycle. |

Collection submissions currently record `aiTraining: false`; dictionary publication cannot turn that into training consent. Existing examples need contributor permission and sentence review before export. A Tatoeba prompt's attribution applies to that prompt, not automatically to the contributor's Kasem response or recording.

## Proposed collection experience

1. Keep “translate a word” and free word contribution as entry points. Save the original lexical answer through the existing submission transaction.
2. Offer “add how you use it” with a natural Kasem sentence, English meaning, dialect and short situation. Make this optional so incomplete linguistic analysis does not prevent word collection.
3. Collect separate choices for public display, provider retrieval, model training, evaluation and audio through the existing evidence permission model. Preserve source terms for the prompt, contributed sentence and recording independently.
4. Show dictionary and sentence review states together. A published word may have an example awaiting training review; that is a valid state. Sentence-fit flags repair English prompts and must not reject the underlying word answer automatically.

## Proposed linking contract

Add a private, versioned link record with `submissionId`, `dictionaryEntryId`, a stable `senseId`, `evidenceId`, `evidenceRevision`, `exampleIndex`, `relationship`, `status`, actor and timestamps. Allowed relationships should distinguish “illustrates sense” from “candidate sense link”. Use an idempotent key over source submission, example and revision. Validate ownership and source references on the server.

Stable sense identifiers are a prerequisite: array positions and definitions are not identities. Add IDs additively and preserve them through edits and merges. Resolve entry redirects for navigation while retaining original entry/sense references in historical lineage. A merge must not union consent or silently redirect a link to a different meaning. Changed example text creates a new evidence revision and needs new review.

Create evidence once through the existing evidence validation and immutable revision writer. Do not copy public dictionary rows directly into training JSONL or harvest gloss tokens as approved words. Dictionary approval and the evidence workflow's independent sentence judgments remain separate. Shared collection code should use a transaction or durable idempotent outbox so retries cannot create orphan or duplicate evidence.

## Export and withdrawal

Continue using the existing dataset exporter and preflight checks. Word/sense links supply traceable context; they are not proof of meaning or consent. Translation targets must be complete, eligible sentence pairs. A future lexical training format requires its own task contract and quality policy; do not disguise isolated glosses as sentence translations.

Carry source passage, prompt-derived example and correction-family relationships into evidence grouping before assigning splits. Group examples derived from the same source sentence, but do not group every unrelated sentence merely because it illustrates the same common word. Resolve conflicts with earlier split assignments before release.

Linked derivatives must recheck their source permissions. Withdrawal should invalidate linked evidence and affected releases through the existing lifecycle machinery, including merged entries. Keep immutable audit lineage private. Dictionary edits alone must not rewrite released targets. Never migrate old publication approval into training approval.

## Delivery sequence and acceptance

1. Deploy and observe the queue fixes after verification; no data migration is required for them.
2. Inventory private submissions, examples, sense IDs, merges and permissions in dry-run mode. Report missing example halves, duplicate candidates, absent grants and broken references without modifying source data.
3. Add stable sense IDs and the link contract; test merges, revisions, retries and withdrawal before enabling combined collection.
4. Add the optional sentence step and permission choices, routed into the existing evidence review desk. Pilot with contributors and reviewers.
5. Backfill links idempotently, preserving original text and provenance. Queue missing grants and judgments for people to supply; export only through the existing release workflow.

Acceptance: one submission creates at most one linked evidence revision per example; a missing grant excludes training; sense merges retain historical references; revised sentences need fresh review; withdrawal blocks downstream use; connected source examples cannot cross training/evaluation splits. The consolidation is complete only after these workflows and checks are implemented and verified.
