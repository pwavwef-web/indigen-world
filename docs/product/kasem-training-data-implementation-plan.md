**Kasem sentence evidence and training-data implementation plan**

Planning date: 2026-09-05. Status: approved and implemented in the local working tree; see [the operating guide](kasem-evidence-operations.md) for delivered workflows, verification, rollout and remaining speaker-pilot work. No production migration, publication or model training has been performed. The sections below retain the approved implementation plan and its original baseline assessment.

The intended outcome is that every training example has a traceable source, a natural sentence in a known or explicitly unspecified context, independent review, appropriate permissions, and a reproducible dataset history. A useful sentence does not require a complete grammatical explanation. Speaker evidence and linguistic analysis must have separate review states.

**1. Existing foundations and gaps**

The working tree already contains sentence collection, aligned glosses, construction tags, grammar-note review, answer corrections, and corpus retrieval. Several of these files are currently uncommitted; implementation must preserve that work and verify the baseline before editing. This inspection establishes local behavior, not what is deployed or stored in production.

| Area | Current local behavior | Planned change |
| --- | --- | --- |
| Sentence model | `services/functions/src/kasem-corpus.ts` requires a literal English line with the same number of whitespace tokens as the Kasem line. | Allow unknown grammatical functions and structured token/span annotations; accept useful speaker contributions before annotation is complete. |
| Contribution | `apps/mobile/lib/features/contribute/grammar/grammar_note_screen.dart` requests a title, explanation, gloss, and optional second example. Hints gloss `mo` as `a`. | Collect usage situations and comparisons, make specialist analysis optional, and remove hints that present an unresolved analysis as settled. |
| Review | `services/functions/src/grammar-contributions.ts` approves/rejects an entire note and promotes all examples together. | Judge each example and annotation separately; preserve disagreements and dialect variants. |
| Identity | Sentence IDs hash Kasem text alone. Later confirmations merge English, dialect, source, and annotation fields onto that document. | Preserve distinct attestations and immutable revisions; group duplicates without overwriting evidence. |
| Agreement | A numerical counter increments when a note is approved; approval checks happen before a batch write. | Store unique reviewer decisions and use transactional, idempotent transitions. A retry or repeated submission must not count as another independent speaker. |
| Retrieval | `kawuri-corpus.ts` uses unordered English content-word overlap, with a score of 1 treated as exact. | Separate similarity from equivalence; preserve roles, polarity, time, question type, and context. |
| Grammar | Published seed prose gives `mo` a blanket indefinite function. `kawuri-grammar.ts` stores rule notes but omits them from its briefing. | Audit claims and examples; carry scope, uncertainty, and evidence into retrieval. |
| Rights | General contracts distinguish publication from model training, but grammar-note submission does not capture those grants. Harvested word records hard-code permission flags. | Carry actual source grants into derived records; approval cannot manufacture permission. |
| Data access | Confirmed sentence documents are readable publicly and include contributor/reviewer references. | Create a deliberately limited public projection; keep internal review and consent evidence private. |

**2. Data model decisions**

Use schema version 2, shared JSON Schema contracts, backend validation, and matching Dart models. Keep existing collection names during rollout where possible; introduce new records only for independently versioned evidence, reviews, and dataset releases.

| Record | Fields and behavior |
| --- | --- |
| Sentence attestation | Stable ID; language; dialect ID or `unknown`; original text; normalized display text; natural English translation(s); optional literal paraphrase; source type; contributor/source references; timestamps; schema version; revision ID. Original text is immutable. |
| Usage context | Situation; optional preceding dialogue; communicative intent; audience/register where known; context explicitly `unspecified` if absent. Do not infer a conversation from an isolated translation. |
| Annotation revision | Token IDs/spans; optional morpheme segmentation; lexical sense links; grammatical labels; phrase spans; optional subject/object links; proposed focus scope; construction tags; author; evidence references; review state. Allow `unknown`, multiple hypotheses, and one-to-many/many-to-one links. |
| Comparison set | Stable group ID; candidate attestation/revision IDs; common context; observed change; speaker explanation; pair-specific judgments. Deleting a particle creates a candidate, not an automatically incorrect sentence. |
| Review decision | Unique reviewer ID; exact sentence/annotation revision; dialect competence; meaning fidelity; grammatical acceptability; naturalness; context fit; explanation; suggested correction; timestamp. Preserve each review event. |
| Grammar claim | Claim ID and version; bounded statement; applicability conditions; dialect; linked supporting/contradicting evidence; status (`hypothesis`, `supported`, `disputed`, `retired`); approver. A status change invalidates dependent projections. |
| Usage permissions | Existing consent references, provenance, licence, allowed purposes, restrictions, expiry/withdrawal state. Distinguish public display, provider retrieval, training, evaluation, and audio uses. Missing permission is ineligible. |
| Dataset release | Release ID; schema/exporter version; exact included revisions; consent snapshot references; split assignments; group IDs; checksums; configuration; exclusion counts/reasons; quality report; creation actor/time. |

Review labels should be independent, with `cannot judge` available for every dimension. Proposed labels: meaning (`faithful`, `partial`, `different`); grammar (`acceptable`, `unacceptable`, `context dependent`); naturalness (`natural`, `understandable but awkward`, `unnatural`); context fit (`fits`, `does not fit`, `context missing`). Abstention is not a negative vote.

Contributor testimony, model suggestions, literature descriptions, and reviewer decisions remain distinguishable. Do not assign one numeric confidence score to all four. The current dog-and-food example should retain the speaker's naturalness judgment while leaving unspecified context and unestablished grammatical acceptability explicit; the raw contribution is not copied into this planning document or made training-eligible by this discussion.

**3. Implementation sequence**

**Phase 1 — Correctness, contracts, and safe migration**

Establish a baseline for the existing uncommitted implementation. Add the v2 contracts and adapters, preserving original strings and existing attribution. Replace silent length/array truncation with field-specific validation; normalize only derived text. Keep tone marks, extended vowels, punctuation, and meaningful word order. Search folding must never become the canonical training representation.

Fix the exact-match decision independently of similarity scoring. Exact normalized text may identify a stored wording; human-approved paraphrase links can identify known equivalents. Unordered overlap alone must never establish translation equivalence. Context and dialect still determine whether a stored answer is applicable.

Replace text-only evidence identity and counter-based consensus with stable attestation IDs, revision records, unique review events, and transactional promotion. Group matching surface forms without merging meanings, dialects, or sources. Keep dictionary senses distinct from grammar claims; neither split nor combine possible homographs solely because their spellings match.

Audit `mo` claims, `indefiniteForm()`, gloss hints, and rule briefings together. Mark or withhold unsupported generated forms until reviewed; do not replace the old blanket rule with an equally blanket focus rule. Route grammatical labels and unresolved tokens away from automatic lexical harvesting. Derived word candidates require sense review and inherit actual permissions.

Migration is additive and idempotent: inventory/dry-run first; retain legacy IDs and revisions; convert old gloss cells into explicitly legacy annotations; mark missing context, rights, and independent-review evidence as unknown. Do not interpret old counters as distinct validators or backfill consent. Pilot behind feature flags, compare projections, then switch reads. Keep a rollback path to the previous projection, without restoring withdrawn data. Private inventory reports stay outside Git.

Acceptance: no evidence is lost on migration; old clients can read supported records; reversed roles are never exact matches; missing grants do not become permission; concurrent approvals cannot duplicate votes or downstream word candidates.

**Phase 2 — Speaker collection and comparison workflow**

Extend the existing contribution screen with three entry paths: “Teach a sentence”, “Compare two ways of saying it”, and “Correct an answer”. Required collection fields are the sentence, meaning, source declaration, and permission choices. Dialect can be explicitly unknown. A short situation is strongly prompted; unknown context is allowed into the review queue.

Ask plain-language prompts such as “When would you say this?”, “What was said just before?”, and “Does the other version change the meaning or just sound less natural?”. Present optional token explanations after the main contribution; speakers can select “I know how to use it, but cannot explain this word”. Never require a made-up English equivalent for an unglossed particle.

Support a related second version with changed spans highlighted. Treat both as candidates until judged, with `no preference` and `depends on context` available. Save partial drafts. AI may suggest tags or candidate edits, always labeled with origin and requiring human review.

Use the existing recording/media infrastructure for optional audio if it supports the required rights and access controls; otherwise deliver text collection first and add private, consented audio as a follow-up. Tie recordings to the exact text revision and preserve the distinction between a speaker's recording and synthesized speech.

Acceptance: a speaker can submit a sentence containing an unexplained particle; record “understandable but awkward” without calling it ungrammatical; and submit variants without claiming either is universally wrong.

**Phase 3 — Independent review and evidence curation**

Extend the review screen and queue models to decide each example separately. Add dimensional judgments, corrections as new revisions, dialect/context filtering, and a dispute queue. Hide other reviewers' judgments until a review is submitted. A contributor's own testimony is retained but does not count as independent review.

Proposed training policy: at least two distinct, qualified reviewers other than the contributor agree that the target preserves meaning and is natural in the stated context; grammatical/context concerns must be resolved. This is an initial quality policy to calibrate in the pilot, not proof that two votes establish a linguistic fact. Disagreement may resolve as a valid dialect/context variant, not necessarily a rejected record. Specialist annotation approval remains separate from sentence acceptance.

Store a correction against the model/prompt version, original response, and relevant context. A user's thumbs-up is feedback, not training approval. Revision changes invalidate prior approval until reaffirmed for that revision. Promote public records and provider-retrieval records through separate eligibility checks and limited projections.

Acceptance: one bad comparison candidate cannot become a positive training target by being attached to a good example; valid variants survive disagreement; self-review/retries cannot meet the independent-review threshold.

**Phase 4 — Cleaning, coverage, and dataset releases**

Add a deterministic quality-check/export module and staff report. Checks cover schema validity, required fields for the selected task, consent/withdrawal, attribution, review state, alignment integrity, duplicate groups, conflicting translations, orthographic consistency, and unresolved annotation claims. Potential duplicates are grouped for review rather than silently deleted. Report exclusions with actionable reasons.

Produce separate, versioned JSONL outputs for:

- Translation training: context and source sentence mapped to a reviewed natural target. Unknown linguistic analysis does not block an otherwise eligible pair.
- Preference training: the same context with speaker-validated preferred and less-preferred candidates. Ties and unresolved comparisons are excluded from this format; an awkward sentence is never exported as an ordinary positive target.
- Grammar explanations: only approved claims and approved annotations linked to evidence.
- Evaluation: held-out sentences, dialogue contexts, accepted variants, comparison sets, and speaker judgments, kept out of training and evaluation-time retrieval.

Split by connected evidence groups before exporting: a dialogue, source passage, correction family, paraphrase family, and minimal-pair set stay within one partition. Hold out selected construction/lexical combinations to measure generalization, and use separate speaker-disjoint splits for audio evaluation. Stratify by dialect and construction where data supports it; report small slices rather than hiding them in a global score. A proposed 80/10/10 split is only a starting configuration; small pilots need deliberate coverage.

Do not send rights records or private identities to model providers. Record pseudonymous lineage in restricted manifests. Keep training/evaluation artifacts in approved private storage, not the repository. Releases contain hashes and exact revision references so rebuilding is deterministic. Recheck grants at export and before a training job; withdrawal blocks future jobs/releases and marks affected existing releases. Deleting an export does not reverse learning from an already completed training run, so preserve a model-to-release registry for remediation decisions.

Acceptance: every exported target is eligible for its purpose; no comparison/source group crosses splits; repeated exports of the same snapshot are identical; excluded rows have reasons; withdrawn examples cannot reappear through a derived record.

**Phase 5 — Context-aware Kawuri and evaluation**

Extend retrieval from wording overlap to construction, context, dialect, and meaning compatibility. Preserve candidate-only status for automated classification. Keep exact answers separate from related examples; matching nouns does not justify adapting a stored sentence. Pass approved annotations and scoped rule uncertainty to the model. Do not strip grammatical particles as stop words from Kasem evidence.

Benchmark the existing retrieval/prompt behavior against the new retrieval behavior before any fine-tuning. Measure meaning, naturalness, grammatical acceptability, context fit, and appropriate abstention separately. Report performance by dialect/construction, evidence coverage, reviewer disagreement, and wrong confident answers. Keep test examples unavailable to retrieval as well as training.

Fine-tuning is a subsequent experiment with a pinned base model, prompt/configuration, tokenizer checks for Kasem characters, dataset release, and cost limit. It is not part of implementing the data features. Compare its outputs blindly with the retrieval baseline using the held-out set. Choose linguistic release thresholds with reviewers during the pilot; do not claim a small dataset guarantees fluency.

Acceptance: the evaluation distinguishes semantic correctness from naturalness, catches particle omissions and role reversals, accepts valid alternatives, and cannot pass through memorizing or retrieving the test set.

**4. First implementation milestone and file map**

The first usable milestone is Phases 1–3 plus a dry-run eligibility/quality report from Phase 4. This allows collection and review of useful evidence before a training job exists. Run a proposed pilot of approximately 100 contextual sentences and 30 comparison sets across particles, questions, negation, descriptions, and time/aspect. Counts are workflow-testing targets, not a sufficient training corpus. Record actual dialect coverage and expand according to uncovered constructions and disagreements.

| Work | Existing integration points / proposed additions |
| --- | --- |
| Contracts and parsing | Extend `kasem-corpus.ts`; add sentence/context/review/dataset schemas under `packages/contracts/schemas`; share vocabulary with Dart models. |
| Submission and review | Extend `grammar-contributions.ts`, grammar contribution widgets, `grammar_note_queue.dart`, and `grammar_note_review_screen.dart`. |
| Grammar evidence | Revise `grammar-rules.json`, `kasem-morphology.ts`, `kawuri-grammar.ts`, and harvesting logic; preserve historical versions. |
| Retrieval | Update `kawuri-corpus.ts`, `kawuri-dictionary.ts`, and briefing composition in `kawuri.ts`. |
| Access control | Extend Firestore/Storage rules and server-side purpose checks; public projections must exclude private provenance. |
| Datasets | Proposed `services/functions/src/kasem-dataset.ts` for pure eligibility/projection logic and scripts for dry-run reports, migration, and export; restricted artifacts live outside Git. |
| Verification | Extend `firebase/tests/kasemCorpus.test.mjs`, permission/grammar tests, and relevant Flutter tests; add meaningful export/review-transition tests. |

Implementation checks: backend typecheck/build, relevant Node tests, Firestore/Storage emulator permission tests, Flutter analysis and targeted widget/domain tests, plus manual speaker/reviewer workflow QA. No runtime tests are needed for this planning-only document.

Essential regression cases: unknown gloss; fused/multiword annotation; tone-preserving normalization; overlong input rejected without truncation; same surface text with distinct contexts/dialects; simultaneous reviews; edits after approval; permission inheritance; mixed-quality comparison; withdrawn consent; role-reversed English sentences; negative versus positive sentences; question versus statement; near-duplicate split leakage; held-out examples excluded from retrieval.

**5. Initial linguistic investigation queue**

“Like mo” here means items whose use depends on sentence structure or context; it does not imply identical grammatical categories or functions.

| Item | Evidence and investigation scope |
| --- | --- |
| `mo` | Aremu describes a focus marker with context-sensitive distribution. Investigate its use in local varieties and distinguish supported analysis from blanket insertion rules. |
| `yerane` | Described as a constituent-associated exclusive meaning “only”, preceding `mo` in the cited examples. Collect the full construction. |
| `weeni` | Described as adverbial/sentential “only”, with a resumed pronoun in the cited construction. Keep its syntax distinct from `yerane`. |
| `ba`, `wò` | A research abstract describes negative markers associated with imperfective and perfective clauses respectively. Preserve the low-tone mark in `wò`; investigate local realizations and context. |
| `we` | The same abstract describes a marker introducing an embedded clause, comparable to English “that” in a reported thought. It is not a universal replacement for English “that”. |
| `wora` | Discussed in progressive constructions. Collect the full construction, including the pronoun, rather than equating it with English “is”. |
| `kam`, `kom` | The speaker's examples use both for “the”. Investigate noun-phrase agreement and distributions without treating them as freely interchangeable. |
| `ke` / `kea` | Reported in the supplied discussion in relation to past time; retain as unresolved until contrasted in locally attested sentences. Do not equate either universally with English “did”. |

Research guidance: [Daniel Aremu, Towards a Propositional Concord Approach for Exclusives in Kasem, §§2.1–2.2](https://www.lingref.com/cpp/wccfl/42/paper3804.pdf) supports the descriptions of focus and the two exclusives. The indexed [Quirks of progressive clauses in Kasem](https://openreview.net/pdf?id=3Fi7xANsf8) abstract discusses negation, `we`, and `wora`; direct opening encountered a browser-verification page, so check the original document and attribution before using it as an annotation authority. These references inform collection priorities; they do not confer permission to ingest their examples into model training or establish the user's dialect conventions.

Before implementation starts, routine baseline checks should confirm which of the current uncommitted modules have been deployed, how validator competence is represented, and which media/consent services can be reused. Those questions affect rollout details, not the data-model principles or the ability to begin Phase 1.
