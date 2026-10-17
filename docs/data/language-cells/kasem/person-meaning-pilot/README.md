# One inspectable Kasem research cycle

Prepared 11 October 2026 from the supplied research specification. The cycle is **open**. Five questions, four documentary candidates and twenty evaluation situations are recorded in [cycle.json](cycle.json). No speaker examples, source permissions, community approvals or Kawuri evaluation results have been invented.

Updated 12 October 2026: the user explicitly authorised the editable copies as documentary sources. Both local DOCX files were found, their SHA-256 checksums matched the existing imports, and the four target passages were checked against them. Original scans are no longer a prerequisite for this pilot. `editable_checked` records this narrower check without claiming `scan_checked` or language approval.

The first question is: **How do speakers distinguish a generic person, an owner, an occupant, a mother, a parent and a caregiver, and how does number or construction change the wording?** Investigate these meanings before expanding collection or preparing a model-training run.

## Evidence receipt and present limits

| Source | What was actually inspected here | Remaining work |
| --- | --- | --- |
| Hewer, *A Basic Grammar of Kasem* | `A_Basic_Grammar_of_Kasem_Editable.docx`, zero-based body paragraphs 1098, 1110 and 1111, including surrounding noun-class context; exact matches to repository blocks 913, 925 and 926. File hash matches the existing import. | Reconcile the document's person/people and mother assertions with natural usage and scoped language review. Conversion uncertainty remains visible; scan comparison is optional under the user's instruction. |
| Kasem Language Committee / Bureau of Ghana Languages, *Kasem Orthography: Spelling Rules* (1997) | `Kasem_Orthography_Corrected.docx`, body paragraphs 347–362, including `teo tu` at 361 and the separate-word versus hyphenated-compound distinction. File hash matches the existing import. | Obtain natural examples, number contrasts and counterexamples; assess the document's construction scope rather than applying a universal rule. |
| September dataset framework | `Indigen_World_Kawuri_Kasem_Dataset_Structure.docx`, all 358 body paragraphs, plus existing repository alignment and evidence-operations specifications. | Retain its architecture while completing this specific question-and-evidence cycle. |
| Francis's observations | The supplied specification mentions observations about `tu`, `niina` and `noono`. | The original conversation and contextual utterances are absent here. Preserve this lead; obtain his exact observation and natural examples before representing it as speaker evidence. |
| Lancaster University, [Language Variation: Register](https://www.lancaster.ac.uk/fass/projects/stylistics/topic6a/variation_register/8variationreg.htm) | Read the page on 11 October 2026. Register concerns situation, medium, subject/function and relationships. | This is methodological context, not evidence for a Kasem contrast. A word inventory alone does not establish register variation. |

The documentary candidates retain the source's different assertions separately. Their transcription status is `editable_checked`; their review status remains `candidate`, and display/retrieval/training rights remain `unknown`. They are not approved production examples. The selected passages document four pattern groups; a Kasem-specific documentary account of situational register remains a research gap. The private check receipt is `data/private/person-meaning-pilot/editable-source-checks.json`. Earlier imports documented elsewhere are historical operations, not a fresh audit of the dictionary or live Kawuri.

## Sequence and proposed responsibilities

These are proposed responsibilities, not messages or assignments sent to anyone. Sessions depend on speaker and reviewer availability.

1. **AI research / engineering:** inspect the accepted editable sources, preserve exact text and locators, label hypotheses, and bring a concrete next question. Francis confirms purpose, priority, relationships and cultural access. He need not supply specialist terminology.
2. **Speakers:** independently describe the situations in their own words before hearing any candidate form. Record meaning, situation, community/variety, relationship and an explanation of differences. Record audio only with consent; a text attestation can still be useful when recording is declined. Never generate Kasem responses in advance.
3. **Research / curators:** preserve all source assertions and exact spellings; link current sentence IDs, revisions and example indexes into a private copy of the cycle. Ask the follow-up substitution questions only after open elicitation. `Unsure` and contextual variants are valid findings.
4. **Qualified language reviewers:** assess meaning, naturalness, number, spacing and scope, request counterexamples, and reconcile claims. Revise, reject, narrow or split proposed records. A book does not automatically override a speaker, and a single preference does not establish ungrammaticality. Appropriate knowledge holders assess cultural accounts within their expertise.
5. **Engineering / reviewers:** prepare the permitted reviewed graph, then reserve independently elicited evaluation examples and capture actual Kawuri responses. Review correctness and coverage separately. Any fabricated source or systematic confusion of the target meanings prevents the pilot gate from passing.

Target: five documented patterns, ten reviewed natural examples per pattern, twenty separately elicited evaluation items. These are workload targets. Change the private ledger's targets and rationale explicitly if capacity requires a smaller pilot. They do not estimate the volume needed for general fluency or fine-tuning.

The twenty public situation descriptions are an evaluation **plan**, not held-out language examples or accepted answers. Collect the actual wording in private, preferably from different speakers or sessions; never index it or close paraphrases. A reviewer may revise the planned expected behavior after establishing the available evidence, preserving that change in a new ledger version.

## Run and inspect

From the repository root, build once and prepare a packet:

```powershell
npm.cmd run build:functions
npm.cmd run kasem:cycle -- report --cycle docs/data/language-cells/kasem/person-meaning-pilot/cycle.json --as-of 2026-10-12T06:47:50.000Z
npm.cmd run kasem:cycle -- packet --cycle docs/data/language-cells/kasem/person-meaning-pilot/cycle.json --output data/private/person-meaning-pilot/packet-02 --as-of 2026-10-12T06:47:50.000Z
```

The packet has separate `speaker-tasks.json` and `reviewer-follow-up.json` files so elicitation can begin without the hypothesized forms. `progress.json` lists per-pattern readiness, per-use exclusion reasons, integrity failures, review flags and the next action. It contains no measured live-app behavior.

Keep collected material in `data/private/` or another private directory. Copy the ledger there and register speaker sessions with pseudonymous IDs. Real contributor data, judgments and audio do not belong in Git. Use the existing [sentence and grammar evidence workflow](../../../../product/kasem-evidence-operations.md) for submission, independent review, revision, withdrawal and audio handling. Export or supply a current private `kasemEvidence` snapshot through the existing tools; this cycle tool does not query the production database.

```powershell
npm.cmd run kasem:cycle -- report --cycle data/private/person-meaning-pilot/cycle.json --evidence data/private/person-meaning-pilot/evidence.json
npm.cmd run kasem:cycle -- project --cycle data/private/person-meaning-pilot/cycle.json --evidence data/private/person-meaning-pilot/evidence.json --use retrieval --output data/private/person-meaning-pilot/retrieval-01
npm.cmd run kasem:cycle -- report --cycle data/private/person-meaning-pilot/cycle.json --evidence data/private/person-meaning-pilot/evidence.json --strict
```

Output directories must be new. Use `--as-of` to reproduce an offline inspection. Without it, permissions expire against the current time. `--strict` returns nonzero while the complete cycle is pending. `project` produces a **local reviewed projection**, not external publication or a live retrieval-index change. A training projection is refused until the pilot passes, and training rights remain a separate requirement afterward.

## Record and review contract

The new [schema](../../../../../packages/contracts/schemas/kasem-research-cycle.schema.json) retains the requested common envelope: lexeme, sense, construction, example and question records; exact original text; nullable unknowns; evidence locators; review history; usage context; linked records; separate display/retrieval/training permissions; origin and version. `support_record_ids` are authority dependencies; `related_record_ids` are navigation links, including variants after review. Open disagreements use `unresolved_questions` and block promotion of the affected assertion.

Each check records who checked the documentary source or speaker transcription and when. Publication evidence may be `scan_checked`, or `editable_checked` against a registered `editable_copy`. An editable check records a DOCX locator and source checksum; it is never relabelled as a scan check. A conversion or source check does not establish linguistic authenticity. Speaker evidence links a registered session, a locator, the exact current `kasemEvidence` revision and its example index. A reviewed example cannot replace the independently reviewed sentence wording. Audio IDs remain private storage paths; projections exclude recordings and reviewer identities.

Status history begins at `candidate`, moves through `submitted`, `curated`, `reviewed`, and `approved`, and preserves `disputed`, `rejected` and `superseded`. Approval events require scope, date, evidence and stated uses. Two different qualified language reviewers must approve the current version and exact scope for each use; reopening a dispute requires fresh approval. Sentence examples additionally pass the existing two-independent-reviewer check and current permission check. Changing the version or scope invalidates earlier approval. Separate source permissions are required as well.

This is an **offline operator ledger**. Reviewer roles and source checks are attestations in supplied files, not authenticated account actions. Do not treat edited JSON as an alternative to the existing server review callables. A future portal needs server-owned reviewer authorization, immutable ledger versions, source-rights records and permission-aware graph retrieval before this graph can affect live answers. No production schema, callable, rule, client or deployment is changed by this milestone.

## Evaluation and release gate

Link each scenario to a separately collected, reviewed example that is explicitly reserved for validation/test. Use existing dataset reservation and blinded-review tools; inspect the connected-source and paraphrase groups before running Kawuri. The existing leakage grouping is conservative, but its lexical similarity heuristic cannot identify every close paraphrase. Explicit families and curator review remain necessary.

Capture the actual response, pinned model/prompt versions, date, retrieved record IDs, source citations and supported scope in `run`. Have two appropriate independent reviewers record meaning, number, spelling/spacing, contextual fit, source fidelity and useful uncertainty. Null judgments remain unjudged. Record fabricated sources and systematic meaning confusion explicitly. Conflicts, ambiguous prompts and unsupported questions must produce the appropriate conflict explanation, focused clarification or abstention.

The checker reports supported correctness among answered supported items and coverage across **all planned supported items**, including pending items. Abstaining on everything gives zero supported coverage. The initial conservative gate requires all planned items reviewed, complete coverage of the pilot's supported situations, agreement on all six dimensions, appropriate behavior on every scenario, one pinned model/prompt pair, no integrity failures and no unresolved duplicate flags. This is a pilot policy to discuss with reviewers, not an empirically established linguistic threshold.

Success would establish only the tested scopes. It does not establish general Kasem fluency. A local file projection does not prove that live Kawuri retrieves it, produces correct responses or honors revocation; an actual integration rollout must verify those behaviors before releasing the capability.

## Follow-on audit queue

After this cycle, choose the next gap by evidence and community priority. Audit noun classes/agreement; word formation/compounds; pronouns/possession; vowel distinctions/harmony; tone/length; tense/aspect/negation; questions; particles/information structure; idioms; politeness/register; and regional/generational variation. For each, record known evidence, an open question, a speaker task, expected application behavior and unseen tests. Accepted context, usable consented audio, corrections and qualified review merit recognition; popularity, point totals and AI confidence do not establish linguistic authority. No reward policy is changed here.

## Verification

```powershell
npm.cmd run test:contracts
npm.cmd run test:kasem-cycle
node --test firebase/tests/kasemEvidence.test.mjs firebase/tests/kasemDatasetCli.test.mjs firebase/tests/kawuriGrounding.test.mjs
```

All automated language examples are synthetic. Tests exercise a complete software cycle, then challenge stale evidence, expiry, withdrawal, rights, scoped review, dispute reopening, fabricated citations, evaluation leakage, abstention and private-output handling. Editable checks are tested independently of scan checks and language approval. Tests do not substitute for actual speakers, language review, a live database audit or a real Kawuri evaluation.
