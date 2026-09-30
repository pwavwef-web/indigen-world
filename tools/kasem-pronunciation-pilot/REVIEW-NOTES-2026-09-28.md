# Fourth listening review: note resolutions

Review: `kasem-comparison-2026-09-28T150544-813741+0000-review.json`.
SHA-256: `1715b6e2cafbd5ba22648df50ef00623f75a70bc061e5edc7ac2abe48cbfe5b3`.
Authority: continuation of the owner's approved-audio publication workflow and
uploaded listening review. Reviewer and variety fields are blank. The owner
identified Emma as the contributor and explicitly replied **“Send the email”**
after seeing the prepared fruit question and attachment description.

| Word / take | Resolution |
|---|---|
| swɛ / Pro | Approved for a fruit, not bathed. Hold the recording and the new sense until its precise English name is confirmed. The bathed entry gets only its approved Flash take. |
| gaale / Flash | Approved for **skip**. Create a separate verb entry and attach this recording; do not inherit the exceeds entry's Bible example. |
| gaale / Pro | Approved for **exceed**. Attach to the existing **exceeds** entry, preserving its stored gloss and source. |
| Nae / Pro | Pending: **“a is too prolonged.”** Keep unpublished and carry this guidance into a future recording attempt. Flash was rejected. |
| Dian / Flash | **“remove this word.”** Unpublish only the exact reviewed Dian/food entry with `isPublished:false`. Preserve its full document, source and before-state backup. Neither pending Dian take is published. |

The five rows cover every nonempty note. Of 24 acceptable decisions, 23 recordings
are published to 21 entries and one fruit recording is held. Forty-eight rejected
and three pending takes remain unpublished. Kam and yerebereno retain both
same-meaning approvals, with Flash primary. Fɔŋe/carefully now has approved audio.

Publication: `kasem-tts-1715b6e2cafbd5ba22648df5`, committed
`2026-09-28T15:58:52.027Z`; anonymous verification passed
`2026-09-28T16:00:35.735Z`. Previous 68 audio entries are unchanged; all four
releases cover 89 entries and 94 distinct recordings. Dian's withdrawal offsets
the new skip entry, leaving 360 public dictionary entries.

## Fruit question

Emma was found as **Emmanuel Ayiredaga Apebuga**. Two contributor profiles have
the same contact email. The owner explicitly authorized the message; the SMTP
relay accepted it at `2026-09-28T16:00:38.251Z`, with the exact approved Pro WAV
attached. No inbox delivery or English-name reply is claimed. No further message
or public fruit entry is authorized automatically by this receipt.

Question: “Which fruit is called swɛ in Kasem? Please give its English name and,
if possible, an example sentence or a description that helps distinguish it
from other fruits.” The email explains that the fruit entry is held and that the
attachment is an AI-generated pronunciation candidate.

Private contact, draft, send attempt and mail receipt are saved only under the
ignored publication exports. Raw notes are not copied into public audio
provenance. Public approval text names the intended dictionary meaning.

## Reproduction

Build the existing resolution helpers with esbuild as for round three, then run:

```powershell
node --test tools/kasem-pronunciation-pilot/round-4-resolution.test.cjs tools/kasem-pronunciation-pilot/publish-policy.test.cjs tools/kasem-pronunciation-pilot/firestore-rest.test.mjs
node tools/kasem-pronunciation-pilot/publish-round-4.mjs
node tools/kasem-pronunciation-pilot/publish-round-4.mjs --commit
node tools/kasem-pronunciation-pilot/verify-round-4.mjs
```

The exact review is preserved as `review.json` in
`exports/kasem-pronunciation-publication-round-4-2026-09-28/`. Dry run is the
default. Existing backups must match before a failed pre-commit run resumes;
the audit record identifies an already completed release without applying it
again. Media is immutable and uploaded with a create-only generation guard.
This publisher does not send email. The separate authorized mail script is
local-only and refuses duplicate or ambiguous send attempts.
