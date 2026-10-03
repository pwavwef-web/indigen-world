# Kawuri corpus implementation and release gates

The 2 October 2026 implementation brief has been implemented as a governed extension of the existing Firebase/React knowledge workspace. The corpus route is `/contributor/corpus`. It accepts any signed-in contributor and uses per-record rights; the existing invited assignment workspace and its historical training/reward agreements remain separate.

This is a software release, not approval of linguistic standards, qualified reviewers, consent templates, or training. No corpus migration, model training or new reward policy is automatically performed.

## Discovery and preserved behaviour

Before this change, `knowledge-records.ts` defined ten categories with mostly string payloads. `knowledge-workspace.ts` provided private drafts, revisions and review callables. Two approvals automatically set `status=gold`; authorisation inherited validator access from admin roles. The React editor was not routed and its stylesheet was missing. Labs read some legacy Gold records without an exact-revision release. Existing contributor assignments have a points/redemption programme in source; this work preserves its records and moves its navigation into secondary Recognition history.

The new workflow does not convert expressions, sentences, proverbs or dialogue into dictionary words. Internal IDs stay intact. New non-sentence display identifiers use the nine source prefixes and transactional counters. Sentence display prefixes remain undecided; provisional drafts retain internal IDs.

## Category contract and source mapping

`packages/contracts/knowledge-catalog.json` is the version 2 field catalogue. `knowledge-capture.schema.json` describes the structural draft payload; `knowledge.mjs` supplies shared submission minimums, states and vocabularies. Server validation repeats category, nested field, relation, media, rights and protected-metadata checks. All specialised fields are optional during capture; recommended review fields are explicitly distinguished. Approved categories are configured separately before authentication or release.

| Source area | Capture mapping |
|---|---|
| Lexicon, section 3 | Original, meanings, part of speech, gender/class, plural, root/stem, structured senses/examples, usage, region, variants, notes and audio |
| Grammar, section 4 | Category, rule, pattern, explanation, ordered examples, negative/contrast forms, translations, exceptions, evidence and recordings |
| Expressions, section 5 | Original, literal and intended meanings, optional French equivalent, speaker relationship, register, cultural significance, ordered dialogue, alternatives and recording |
| Proverbs, section 6 | Original, literal reading, interpretation, lesson, history/context, usage, example situation, equivalents, authority and alternative variants |
| Folklore/literature, section 7 | Title, genre, storyteller/creator, community, origin, characters, themes, lesson, cultural objects/references, places, ordered segments, translator, original recording and restrictions |
| Dialogue, section 8 | Situation, two pseudonymous speakers, ordered turns/translations, relationship, age range, register, setting, goal, emotion, cultural context and recording |
| Pronunciation, section 9 | Immutable original clips, transcript, pseudonymous speaker, region, optional age range/gender, environment, quality notes, isolated/contextual kind and exact typed item relation |
| Culture, section 10 | Concept/topic, Kasem terminology, candidate definition/explanation, significance, history, authority, protocol, variation, related stories/proverbs/concepts and product references |
| QA/instruction, section 11 | Example type, question, target answer, reasoning, uncertainty/no-evidence expectation, exact supporting revisions and held-out source family/split |
| Sentences, section 2 | Original utterance, separate translations, context/previous turn, region, optional structural analysis, alternatives, related exact revisions and audio; submission disabled until policy approval |

Source attribution, contributor account, review actors, verification times, workflow, authentication, rights, revisions, variants and relations are separate metadata. Original text is retained byte-for-byte; only the separate search representation uses NFC and case folding. French is optional. Unknown, not applicable, not yet translated and no direct equivalent are distinct state values. Conditional speaker details are not required. The system neither infers grammar nor supplies missing translations.

## Contributor and review flow

- The corpus portal shows server-confirmed, all-time version 2 object counts, the UTC reporting timezone and last refresh. A submitted object counts once; revisions and events remain separately inspectable. Legacy totals are excluded until reconciled.
- Draft autosave waits two seconds after editing and reports the confirmed timestamp. Failed saves retain text in the open editor and stop automatic retries; Save draft retries. Navigation warns about unsaved work. Private corpus content is not persisted in localStorage; closing an unsaved offline editor loses that unsaved content.
- Submission checks use shared minimums. Category-specific review detail is separate from submission readiness. Contributors check the complete form before submission and receive a durable `recordId:revision` receipt. A retry key is bound to the payload. Stale edits fail without overwriting the newer revision.
- Every saved revision is retained, including earlier submitted text. The current editor opens up to 50 recent revisions and 100 recent events; an exact older revision can still be requested through the callable. Submitted category identity cannot change. Unsubmitted drafts can correct their category.
- New data starts at Community. Workflow is independent: draft, submitted, in review, changes requested, review complete or withdrawn. A dispute is separately preserved. Legacy Gold is not promoted into the new authentication field.
- A server-side qualification grant is required for each category/scope. Admin role inheritance does not authenticate language. Language and cultural review may be performed separately. Gold depends on the approved configurable quorum, exact revision, distinct reviewers, current grants, all rubric checks and reasoned decisions. Self-authentication is rejected. Review events cannot be overwritten.
- Similar original text produces an owner-visible duplicate/variant warning. No records are silently merged. Broader linguistic similarity and curator-directed alias merging still require human curation.

## Media and rights

New originals use `knowledgeAudio/{uid}/{object}`. Storage rules allow create and owner read, deny overwrite/deletion, and prevent direct reviewer access. The server verifies completion, size under 20 MB, container headers, generation and checksum before linking. WAV, MP3, Ogg/Opus, FLAC, M4A/MP4 and WebM containers are supported as operational defaults. This is container validation, not a recording-quality verdict. Technical standards still need approval. Existing legacy `grammarAudio` objects keep their previous policy; they are not rewritten.

Playback for reviewers rechecks the record, access, revision, rights and object generation, then returns private bytes without a public download URL. Removing a clip from a draft does not delete its original. Replacements use a new object. Unattached-object retention and governed deletion need an approved retention policy. Actual recording review with community speakers remains a pilot gate.

Rights capture separates holder, private evidence reference/version, public attribution, restrictions, expiry, preservation, publication, retrieval, training, evaluation, derived media and speech synthesis. Unresolved rights permit restricted capture and review but block release. The schema records references, not bank documents or contact information. Recording consent does not enable voice replication.

## Release, reference and AI use

`releaseKnowledgeRecord` evaluates an exact revision, current authentication, scoped release-manager grant, provenance, rights, rubric, category/destination approval, blockers and relationships. Manifests are idempotent. Revisions, rights withdrawal, policy changes and expired/revoked qualification grants are rechecked by consumers. Public reference access returns an explicit allowlist without account IDs, consent evidence or raw audio paths. Typed categories are retained for Venacula and Tribe Studio projections.

`resolveKnowledgeRecords` paginates eligible reference releases. `exportKnowledgeRecords` is manager-only and emits a bounded 30-record page plus an audited exact-revision manifest; continuation requires its cursor. Training, evaluation and retrieval are distinct permissions. Source families are reserved to a split; evaluation records cannot enter retrieval. No training job is launched.

Kawuri adds up to four relevant released corpus references, including exact revision IDs and authentication, to its existing grounding. It scans at most 300 eligible release candidates; this is a bounded lexical pilot, not semantic search or a guarantee of complete corpus coverage. Unmatched evidence never licenses constructing a Kasem sentence. The callable returns `corpusSources` for provenance; existing clients may not yet render a dedicated corpus-source card. Existing dictionary and sentence pipelines retain their own legacy review contracts and were not bulk migrated.

Labs requires both the Tribe Studio and Kawuri releases for corpus material used by its AI features. Legacy Gold alone is excluded. Withdrawal deletes destination release pointers and creates a revocation case. Future reads/exports exclude withdrawn and invalid related revisions. Previously exported copies or trained models require follow-up; automatic model unlearning is not claimed.

## Human decisions still required

| Decision | Responsible role | Current guard |
|---|---|---|
| Sentence schema, boundaries and display prefix | Kasem review lead and technical lead | Private drafts only until approved policy enables submission; no invented prefix |
| Reviewer qualifications, quorum and escalation | Kasem/cultural review leads | No default approved policy or reviewer grants; no automatic Gold |
| Orthography, dialect, morphology and controlled vocabularies | Linguistic lead | Preserve contributor text; no inferred linguistic labels |
| Category required fields and translation coverage | Product and linguistic leads | Provisional capture contract; category approval required for release |
| Consent, custodianship, minors, retention and disclosure protocols | Governance owner | Unresolved/restricted rights block release; no blanket voice reuse |
| Recording standards and audio link scope | Linguistic and technical leads | Operational upload limits documented; actual speaker pilot outstanding |
| Product publication types and evaluation targets | Product and review leads | Typed projections; destination policy disabled until approval |
| Rewards and public ranking | Existing programme owner | Existing history preserved; no corpus reward, leaderboard or cash promise |
| Migration reconciliation, backup restore and revocation replay | Operations lead | Offline dry-run audit; no automatic migration/cutover |

See `docs/operations/kawuri-corpus-runbook.md` for administration, validation, rollout and rollback.
