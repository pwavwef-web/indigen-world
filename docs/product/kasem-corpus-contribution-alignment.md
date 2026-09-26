# Kasem corpus alignment for contributions and collections

Repository status: 2026-09-21. This records implementation boundaries for the proposed **Kawuri Kasem Language & Culture Dataset Structure**. It is not a claim that a new corpus has been released or a model trained.

## Current paths

| Knowledge area | Intake and destination |
| --- | --- |
| Lexicon | Mobile word queue and open dictionary contribution → review → `dictionaryEntries` → Venacula and app dictionaries. |
| Expressions and proverbs | Mobile saying contribution → review → `dictionaryEntries`; literal reading, idiomatic meaning and usage context are distinct optional fields. |
| Grammar and sentences | Kasem evidence and grammar-note workflows described in [Kasem evidence operations](kasem-evidence-operations.md). |
| Literature | Mobile and TribeStudio submissions → review → published Collection content; original recording/document stays linked to its submission. |
| Dialogue | Conversation/interview videos can be tagged as dialogue; no structured turn-by-turn dialogue corpus intake yet. |
| Pronunciation | Optional word recordings publish with entries; no independent speaker/audio registry yet. |
| Culture | Cultural material can be contributed to existing media and literature shelves; no dedicated concept registry yet. |
| QA/instruction | Kasem evidence and answer corrections support Kawuri evaluation; no general community QA authoring form. |

`collectionKind` names a public shelf. `corpusArea` names a knowledge area. A single shelf can contain several knowledge areas, and one object may eventually belong to several areas. The new metadata is a primary classification only; it does not refile existing public content into ten shelves.

New collection contributions start at `community`. The existing validator approval promotes them to `reviewed`; it does not produce `gold`. Gold needs a named Kasem-qualified reviewer policy, evidence of language and cultural competence where applicable, and an audited promotion path. Existing published dictionary rows without such a field remain unlabeled for authentication. Review outcome, publication state and training permission are separate decisions.

## Project adaptations and unresolved work

1. **Permanent IDs:** Firestore document IDs and typed references are already stable across these products. A new sequential `KSM-*` scheme would require an allocator, migration and redirect policy. Do not replace old IDs or infer that a prefixed ID means authentication.
2. **French and audio:** These are optional where known or available. Requiring guessed translations or synthetic speech would reduce accuracy. Their absence remains visible rather than filled with invented content.
3. **Gold status:** The four-level proposal compresses several independent states. `rejected`, `withdrawn`, `outdated` and `disputed` must retain their existing distinct histories and rights behavior. An ordinary publication approval is not expert authentication.
4. **Restricted knowledge:** The mobile Collection callable currently refuses nonpublic cultural permission tiers. A private or community-only intake and publication surface must be designed before those materials can be accepted there.
5. **Audio, dialogue and cultural concepts:** Dedicated records need separate consent, speaker identity, rights, reviewer and revision handling. A media attachment or free-text note is not a substitute.
6. **Kawuri use:** Publication does not grant provider retrieval or model training. The existing consent-aware Kasem dataset pipeline remains the gate; no new contributions are automatically used to train or ground Kawuri.

The broader sentence/evidence plan in [Kasem training-data implementation plan](kasem-training-data-implementation-plan.md) remains the source for grammar and Kawuri release eligibility.
