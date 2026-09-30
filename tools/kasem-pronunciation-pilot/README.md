# Kasem pronunciation listening pilot

**Publication and next round, 27 September:** the owner's supplied review and
explicit instruction approved 19 Google recordings across 18 dictionary entries.
These are now live with AI provenance and preserved source credits. See the
[release evidence](../../apps/updates-blog/posts/2026-09-27-reviewed-kasem-pronunciations/README.md).
The subsequent 40-word pack received a completed review: 26 takes across 25 more
entries were approved and published, and 35 were rejected. The two releases now
cover 43 distinct entries and retain 45 approved recordings. See the
[second release evidence](../../apps/updates-blog/posts/2026-09-27-more-reviewed-kasem-pronunciations/README.md).

**Third listening round, published:** 40 further words produced 77 candidates
(40 Flash, 37 Pro). The owner approved 26, rejected 50 and left one pending.
All 18 notes were resolved before publication: 26 recordings now serve 25 entries,
with separate meanings for tonal contrasts, eight new entries and four corrected
glosses. The uncertain memaŋa/proverbs meaning is queued under the requested
account and is not published. All three releases cover 68 entries and 71 distinct
approved recordings. See the [note resolutions](REVIEW-NOTES-2026-09-27.md) and
[third release evidence](../../apps/updates-blog/posts/2026-09-27-kasem-tone-and-meaning/README.md).

The simple publication importer now refuses reviews containing notes. Those need
an explicit sense-resolution plan; a positive rating alone does not establish
that a recording matches the original English gloss.

**Fourth listening round, 28 September:** 40 new source entries have 75 playable
candidates across 39 words (39 Flash, 36 Pro), including fɔŋe = carefully from
the previous correction. All 108 earlier IDs and normalized spellings are
excluded. Lage's two requests timed out; Pro also returned no audio for jege,
ke and Botarebu. Technical and batch-identity checks passed. The offline page
and ZIP are under `exports/kasem-pronunciation-round-4-2026-09-28`; the local
review page is http://127.0.0.1:8882/review.html. The returned review approved 24
takes, rejected 48 and left three pending. Its five notes resolve to 23 published
recordings across 21 entries: separate gaale/skip and gaale/exceeds recordings,
the first fɔŋe/carefully audio, a held swɛ fruit take, and reversible withdrawal
of Dian/food. The owner-authorized fruit question was emailed to Emma with its
exact reviewed clip attached. All four releases cover 89 entries and 94 distinct
approved recordings. See the [note resolutions](REVIEW-NOTES-2026-09-28.md) and
[fourth release evidence](../../apps/updates-blog/posts/2026-09-28-kasem-words-and-meanings/README.md).

**27 September follow-up:** a second, local comparison now tests two standard
Google speech models alongside the preserved MMS recordings. See
[alternative-provider findings](ALTERNATIVES.md). Khaya also advertises Kasem TTS,
but its speech interface requires authenticated subscription access.

To generate the comparison, set `GEMINI_API_KEY` securely in the environment and run:

```powershell
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/compare.py --baseline exports/kasem-pronunciation-pilot-2026-09-26 --output exports/kasem-pronunciation-comparison-2026-09-27
```

This requests up to 56 small hosted generations (28 per model) and may incur
provider charges. It uses only Python's standard library. Requests are spaced
eight seconds apart per model; a quota response stops further calls to that model.
After the provider's cooldown, rerun with `--retry-rate-limited` to recover only
HTTP 429 rejections. This preserves successful clips, earlier failures and their
request/response evidence. It does not retry completed or ambiguous requests.
Use `--render-only` to rebuild the offline page without any API calls.

The comparison has a per-recording review and shortlist export. Neither one
submits or publishes audio. Gemini does not document Kasem support, so fluent
speaker checks remain necessary. Existing MMS reviews stay in their original pack.

Checks for the comparison tools:

```powershell
node --test tools/kasem-pronunciation-pilot/comparison-state.test.cjs
node --test tools/kasem-pronunciation-pilot/publish-policy.test.cjs
& ./.tooling/kasem-tts-venv/Scripts/python.exe -m unittest discover -s tools/kasem-pronunciation-pilot -p test_compare.py -v
```

## Repeat with new words

`prepare-next.py` selects the next 40 curated words from a fresh, public-only
Firestore query snapshot. It requires unique exact matches for the headword and
dialect, excludes every entry from the earlier comparison, and refuses entries
that already have audio. See the script's `GROUPS` for the explicit selection.

```powershell
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/prepare-next.py --snapshot .tooling/kasem-tts-alternatives/public-next.json --exclude exports/kasem-pronunciation-comparison-2026-09-27/manifest.json --output .tooling/kasem-tts-alternatives/round-2-words.json
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/compare.py --words .tooling/kasem-tts-alternatives/round-2-words.json --output exports/kasem-pronunciation-round-2-2026-09-27
```

Use new output paths for a fresh batch. `--words` and `--baseline` are alternatives;
the new-word mode does not need MMS recordings. Review decisions remain bound to
the new batch and exact recording hashes. The 27 September round has 40 Gemini 3.8
clips and 21 Gemini 2.5 Pro clips; Pro reached its daily quota. The page shows the
available takes without rating missing generations as rejected pronunciations.

For subsequent rounds, repeat `--exclude` for every earlier manifest and provide
an explicit grouped selection with `--selection`. The third-round selection is
`round-3-selection.json`; preparation requires unique exact headword/dialect pairs.

```powershell
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/prepare-next.py --snapshot .tooling/kasem-tts-alternatives/public-round3.json --exclude exports/kasem-pronunciation-comparison-2026-09-27/manifest.json --exclude exports/kasem-pronunciation-round-2-2026-09-27/manifest.json --selection tools/kasem-pronunciation-pilot/round-3-selection.json --output .tooling/kasem-tts-alternatives/round-3-words.json
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/compare.py --words .tooling/kasem-tts-alternatives/round-3-words.json --output exports/kasem-pronunciation-round-3-2026-09-27
```

## Publish an explicitly approved review

`publish-approved.mjs` is a separate administrative importer, requiring authorized
Firebase credentials. A listening-page rating alone does not authorize its use.
After the owner explicitly requests publication, supply the exact downloaded
review, the matching pack and a new local evidence directory. It defaults to a
dry run; `--commit` performs the writes.

```powershell
node tools/kasem-pronunciation-pilot/publish-approved.mjs --pack exports/kasem-pronunciation-comparison-2026-09-27 --review '<downloaded-review.json>' --output '<new-evidence-directory>' --approved-by '<owner>' --authorization-note '<actual publication instruction>'
```

The importer validates every review identity and hash, publishes only acceptable
Google candidates, and checks the current word, meaning, dialect and publication
status. It refuses existing pronunciation audio and preserves general dictionary
review/authentication status. Multiple approved takes are retained; Gemini 3.8 is
the primary when both models were approved. The current player shows the primary.

It saves before-state and review evidence, uploads immutable files, verifies public
downloads against the reviewed hashes, then updates entries and an audit record
atomically. Existing source attribution is retained alongside the AI notice.
An identical completed release is recognized without republishing. Run the public
read-only check with `node tools/kasem-pronunciation-pilot/verify-publication.mjs <evidence-directory>`.
Create a release post for each substantial publication as required by `AGENTS.md`.

## Original MMS trial

Prepare 28 local speech candidates for fluent-speaker review using Meta's
[`facebook/mms-tts-xsm`](https://huggingface.co/facebook/mms-tts-xsm).
This is an evaluation tool, not a deployed feature. It has no Firebase writes,
reviewer messaging, training step, upload step, or publication capability.

## What the pack contains

- `review.html`: one portable, offline page containing all 28 audio clips, review
  buttons, notes, browser autosave, and JSON download/import.
- `audio/`: one mono PCM16 WAV per dictionary entry.
- `manifest.json`: source entry IDs and read time, original text, model input,
  model revision, library versions, generation settings, file hashes, and audio checks.
- `selected-words.json`: the exact source sample; no reviewer data.
- `review-sheet.csv`: an alternative blank review sheet.
- `MODEL-CARD.md` and `README.md`: attribution and listening instructions.

Each decision is bound to an entry ID **and the SHA-256 of the recording**.
Import rejects another batch or a mismatched recording. Decisions stay on the
reviewer's device until they deliberately share a downloaded review file.

## Selection

`prepare.py` reads only the public `dictionaryEntries` query (`isPublished == true`),
using the same publication filter as the dictionary website. It requests a small
projection of text fields without credentials. A saved public REST query response
can be supplied with `--snapshot` to reproduce a selection.

The curated sample includes 20 everyday words, vowel/consonant examples and longer
words/numbers, plus four written-accent comparisons: Deem/Deém, Vei/Véi, Wo/Wó,
and Ye/Yé. These are entry spellings and glosses, not newly asserted linguistic
minimal pairs. Reviewers should specify the intended sense when a gloss contains
several meanings. Source dialect labels are retained without claiming that the
model matches them. Published status alone does not establish expert validation.

The script requires one exact matching published entry without existing audio for
each selection; an ambiguous, changed, missing or already voiced entry stops it.
It does not silently choose a replacement. IDs are stored with every output.

## Run on Windows / PowerShell

Use Python 3.12 and an isolated virtual environment. Commands assume repository root.
If Python is bundled with Codex, use that executable in the first command.

```powershell
python -m venv .tooling/kasem-tts-venv
& ./.tooling/kasem-tts-venv/Scripts/python.exe -m pip install --upgrade pip
& ./.tooling/kasem-tts-venv/Scripts/python.exe -m pip install --no-compile --timeout 120 torch --index-url https://download.pytorch.org/whl/cpu
& ./.tooling/kasem-tts-venv/Scripts/python.exe -m pip install --no-compile --timeout 120 -r tools/kasem-pronunciation-pilot/requirements.txt

& ./.tooling/kasem-tts-venv/Scripts/hf.exe download facebook/mms-tts-xsm --revision 66f057a40a0a00e15bddb0f09edc1a94eb32e30d --include '*.json' 'model.safetensors' 'README.md' --local-dir .tooling/kasem-pronunciation-pilot/model

& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/prepare.py --output .tooling/kasem-pronunciation-pilot/selected-words.json
& ./.tooling/kasem-tts-venv/Scripts/python.exe tools/kasem-pronunciation-pilot/generate.py --words .tooling/kasem-pronunciation-pilot/selected-words.json --model-dir .tooling/kasem-pronunciation-pilot/model --output exports/kasem-pronunciation-pilot-2026-09-26
```

Use a new output path for another run. Preparation refuses to overwrite its source
sample, and generation refuses to overwrite an existing pack. Generated content,
models and runtimes remain in the already ignored `exports/` and `.tooling/` paths.
No Hugging Face token, cloud endpoint or paid inference service is required.

## Generation checks and limits

Inference uses local files, safe tensor weights, CPU, four threads, a fixed seed
of 20260926 per word, and the model's default speaking/noise settings. Input is
NFC-normalised and lowercased; original headwords remain in the pack. Before
generation, every character must exist in the model vocabulary and the actual
tokenizer output must reconstruct the complete input. No letters are dropped.

The model vocabulary contains ɛ, ɔ, ŋ, á, é and ó, but lacks ɩ, ʋ and ə (it has
ǝ instead). Do not infer letter substitutions or apply Ghana recordings to Burkina
entries. Unsupported spellings need a separately reviewed approach.

Audio must be finite, non-silent and 0.1–15 seconds before padding. Files receive
150 ms leading and 250 ms trailing silence. Peak attenuation is applied only
above 0.95. These are technical checks; only speakers can assess pronunciation.

The model is licensed CC-BY-NC 4.0. This pilot does not establish clearance for
commercial production or automatic publication of its output. Preserve attribution
and resolve terms before a production integration. No community voice recordings
are sent to Meta or used to train a model.

## Review and next step

Ask fluent speakers to listen for meaning, tone, vowel length/quality, consonants,
naturalness and dialect fit. Use **Sounds right**, **Needs recording**, or **Unsure**,
with notes for recurring issues. Save a JSON review; load it to resume. The CSV
is a separate alternative, not an automatically synchronized file.

Report all four counts (acceptable, needs recording, unsure, pending) and assess
the accent comparisons separately. This small, purposively chosen sample cannot
establish overall model accuracy. A positive trial rating does not publish audio.
Production integration would need explicit AI provenance, applicable rights,
authorised approval, a current entry/sense/dialect check, and preservation of
existing human recordings.

The original local MMS evaluation did not require a release post. The subsequent
Google audio publication is documented in the release post linked above.
