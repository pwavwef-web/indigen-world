# ADR 0003 Add a governed knowledge workspace

Date: 2026-09-27

Status: Accepted for local implementation; production deployment is separate.

## Context

The supplied Kawuri Kasem dataset framework describes ten kinds of knowledge, including long oral literature, dialogue, cultural interpretation and QA examples. Existing dictionary contributions and sentence evidence already serve specific publication and research workflows. Sentence evidence limits each example to a short attested sentence and applies judgments to individual examples. Expanding that record into arbitrary literature would change the meaning of its existing reviews and export guarantees.

## Decision

Add private `knowledgeRecords` for collection and independent review across the ten dataset areas. A record contains original text, translations, context, source, region, dataset-specific details, variants, linked record IDs, recording metadata and explicit permissions. A server-supplied catalogue drives the web and mobile forms. Kasem is the first supported language (`xsm`); other languages need their own catalogue and qualified reviewers before activation.

Firebase remains authoritative. Authenticated callable Functions own all reads and writes. Direct Firestore access remains denied by the existing default rule. The existing private audio upload prefix is reused, and the callable binds recordings to their immutable storage generation and exact record revision. No new infrastructure provider or public datastore is introduced.

TribeStudio owns the full contribution and review workspace. Mobile owns guided collection and the contributor's records. Public websites provide entry links, including links to exact dictionary entry IDs. They do not expose the private review queue. Admin role assignment remains in Admin.

Record IDs remain stable across revisions. Changes invalidate current authentication; earlier content and review events remain traceable. Gold requires two distinct, non-author reviewers with language competence for the exact revision, plus cultural competence for culturally sensitive categories. Disagreement blocks Gold. Recorded competence is an attestation by an already authorized reviewer, not an independent certification of their expertise.

## Consequences

- Existing dictionary, expression, sentence evidence and publishing workflows retain their current semantics. Links such as `dictionaryEntries:<id>` reference existing objects without copying their contents, review status or permissions.
- Completeness warnings indicate missing evidence, not truth or authentication. Original text is retained exactly; uncertain analyses and missing equivalents can be stated explicitly.
- Publication, external-provider retrieval, model training, evaluation and audio storage remain separate permissions. Human approval does not grant any of these rights.
- These new records are a curation workspace. Gold does not automatically publish a dictionary entry, enter Kawuri's retrieval corpus, or train a model. A future reviewed adapter must preserve record/revision references and enforce the destination's existing consent and evidence gates. In particular, existing sentence evidence should continue through its own per-example review.
- Deploy Functions before releasing connected clients. The release article must distinguish local implementation from confirmed public availability.

See [the callable contract](../product/knowledge-workspace-api.md) for payloads and limits.
