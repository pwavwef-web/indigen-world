# Third listening review: note resolutions

Review: `kasem-comparison-2026-09-27T111946-528936+0000-review.json`.
SHA-256: `dd8fbb60adf4fdea7c39a634f9f6a4c50fa0a842519c37da76b75071f6b47f40`.
Authority: the owner's uploaded listening review, instruction to apply approved
takes, and clarification **“to fly/ fly.”** The JSON's optional reviewer and
variety fields remain blank. Do not invent a named expert sign-off.

| Word | Resolution |
|---|---|
| kuri | Pro take belongs to **choose**, a separate entry. **Bottom** remains without audio. |
| tega | Pro take belongs to **dead**, with owner example “chworo kom tega.” / “The hen is dead.” **Earth** remains without audio. Preserve spelling; the note describes a final-vowel tone contrast. |
| laŋa | Both takes rejected. Next recording should end with the indicated **á sound**, without adding an accent to the written headword. |
| nabiina | Both takes accepted for humankind. Flash (“much better”) is primary; Pro (“also good enough”) remains an alternate. |
| bwoŋi | Flash is **called**; Pro is **call**, used as a command and for future usage. Separate entries and audio. Example “Bwoŋi o” / “Call him.” Written future/imperative forms are bwoŋi as supplied. |
| naane | Both takes rejected. Preserve the speaker's distinction between cows and create as guidance for another recording, without publishing either rejected take or asserting a new approved cows entry. |
| beera | Pro is still pending. Next recording should end with the indicated **à sound**, without changing the written headword. No take published. |
| woli | Pro accepted for **added**, and explicitly also for **help** with the same pronunciation. Reuse this one approved recording for both entries. |
| jaana / jaane | Correct jaana to **flying**, retaining the accepted Pro take. Existing jaane becomes **to fly / fly** per the owner's clarification. No future spelling or jaane audio was supplied; do not infer either from jaana. |
| ŋwe | Flash belongs to **pay**, a separate entry. **Live** remains without audio. |
| memaŋa | Flash accepted for **signs**. **Proverbs** is explicitly uncertain; queue a text-only meaning review under the requested existing account (Francis Pwavwe). Do not publish that meaning or transfer the signs approval to it. |
| yi | Flash is **reach**; **yia** is its past form. Pro is **eye**; **yia** is its plural. Separate entries, recordings and form slots. No yia audio inferred. |
| su | Flash remains **full**. Pro is **shake**, with **suga** as its past form (English “shook”). Separate entries and recordings. No suga audio inferred. |
| fɔge / fɔŋe | Correct fɔge to **plaster**, retaining the accepted Pro take. Add fɔŋe = **carefully** without audio. Remove the old carefully example from plaster; preserve it in the backup rather than inventing a respelled source quotation. |

These rows cover all 18 nonempty per-recording notes. Fifty rejected takes and
the one pending take are not publication candidates. Tone agreement is assessed
for an individual meaning, not merely for a headword string.

## Safe reuse of the workflow

The simple importer now stops when any review note is present. Resolve notes
before publication: a “Sounds right” decision can still refer to a different
meaning. `round-3-resolution.cjs` is deliberately specific to this review;
`publish-round-3.mjs` binds it to the exact review hash and checks current data,
homograph peers, audio bytes and every document version before committing.

The raw review and before-state backup are local, ignored exports. Public
provenance uses short sense-specific approval text. Personal contact information
and unrelated prose from raw notes are not copied into dictionary documents.

Queueing is not an expert approval. The uncertain proverbs item is SUBMITTED
under the requested account, with no review decision, no media and publication
permission false. A review and a later explicit publication step are still needed.

## Reproduction

From the repository root:

```powershell
& services/functions/node_modules/.bin/esbuild.cmd tools/kasem-pronunciation-pilot/resolution-helpers.ts --bundle --platform=node --format=esm --packages=external --outfile=.tooling/kasem-tts-alternatives/resolution-helpers.mjs
node --test tools/kasem-pronunciation-pilot/publish-policy.test.cjs tools/kasem-pronunciation-pilot/round-3-resolution.test.cjs
node --test tools/kasem-pronunciation-pilot/firestore-rest.test.mjs
node tools/kasem-pronunciation-pilot/publish-round-3.mjs
node tools/kasem-pronunciation-pilot/publish-round-3.mjs --commit
node tools/kasem-pronunciation-pilot/verify-round-3.mjs
```

Dry run is the default. Existing backups must match exactly before a failed
pre-commit run can resume. Already committed releases are not reapplied.
