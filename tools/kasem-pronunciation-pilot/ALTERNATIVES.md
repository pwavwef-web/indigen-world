# Kasem speech alternatives — 27 September 2026

**Later follow-up:** Chinedum returned 19 acceptable takes across 18 entries and
explicitly instructed publication. The separate administrative importer published
those exact Google recordings with AI attribution. See the
[release evidence](../../apps/updates-blog/posts/2026-09-27-reviewed-kasem-pronunciations/README.md).
A second local batch received a completed review of 61 recordings for 40 new
words: 26 takes across 25 entries were approved and published. See the
[second release evidence](../../apps/updates-blog/posts/2026-09-27-more-reviewed-kasem-pronunciations/README.md).
The research and initial evaluation record below describe the earlier handoff.

The earlier local Meta MMS listening trial was not the only available route.
This follow-up tests standard hosted TTS on the same 28 public dictionary words,
preserving the original spelling, meaning, dialect label and entry ID. This is
a local evaluation, not a product release or a production submission.

## Research findings

| Option | Evidence and access | What we can conclude |
| --- | --- | --- |
| **Khaya AI / GhanaNLP** | Its [official TTS page](https://www.khaya.ai/features/text-to-speech) explicitly names **Kasem**. The [Studio speech interface](https://studio.khaya.ai/tts) showed “Authentication Required” and required a subscription key during this session. [API portal](https://developer.khaya.ai/). | A relevant specialist to evaluate. No authenticated Kasem generation was performed, so pronunciation quality, exact voice availability, dialect and model lineage remain unverified. Advertising Kasem support is not independent quality evidence. |
| **Google Gemini 3.8 Flash TTS** | Listed by the authenticated Gemini model API; a real speech request succeeded. [Official speech documentation](https://ai.google.dev/gemini-api/docs/speech-generation) describes the Interactions API, separate delivery instructions and WAV output. | Tested as a standard TTS candidate using the prebuilt Kore voice. **Kasem is absent from the documented language list**; this experiment does not establish supported Kasem pronunciation. |
| **Google Gemini 2.5 Pro Preview TTS** | Listed by the authenticated model API; real `generateContent` requests returned audio. The preview model uses inline delivery instructions and PCM output. | A second model to compare with the same prebuilt voice. Also experimental for Kasem. Three requests returned no audio; these are recorded separately from pronunciation rejection. |
| **ElevenLabs** | Its [official TTS documentation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) describes multilingual speech generation. | No Kasem-specific support was verified from the documentation examined. No authenticated generation was performed. |
| **GhanaNLP Ghana Speech Datagen** | The [maintainer repository](https://github.com/GhanaNLP/ghana-speech-datagen) documents OmniVoice and VoxCPM2-Ghana backends, a GPU server and reference audio requirements. | A possible later route with suitable reference recordings and a running backend. A multilingual data generator alone does not establish Kasem accuracy. No training or cloning was performed. |

The two Google models belong to the same provider. Neither agreement between them
nor agreement with the rejected MMS baseline is independent evidence of correctness.
No automated “match” score is used to approve pronunciations.

## What was tested

- Reused the 28-word public snapshot from 26 September 2026, including `ɛ`, `ɔ`,
  `ŋ`, longer words and the four original written-accent comparisons.
- Sent only public word text, meaning and dialect context to Google. No reviewer
  data, private entries, existing human recordings or API keys are in the pack.
- Applied NFC normalization and lowercase, with no phonetic respelling, invented
  IPA, translation or letter substitution.
- Requested each word separately, with its meaning outside the spoken transcript
  where the provider supports that separation. The prompts request Kasem; they
  do **not** prove the model obeyed the requested variety or lexical tone.
- Kept the original MMS audio byte-for-byte, with its original licence attribution.
- Saved individual requests, responses, recording hashes, generation times and
  technical measurements. Credential headers are never written.
- The first run encountered a 10-requests-per-minute quota on each Google model.
  Added eight-second spacing per model and a quota-stop mechanism. Recovery only
  retries HTTP 429 rejections; successful clips and response evidence remain intact.

`exports/kasem-pronunciation-comparison-2026-09-27/manifest.json` is the authoritative
run record, including failed generations and recovered attempts. Technical checks
cover decoding, duration, silence, clipping and exact recording identity. They
do not assess the correctness of a Kasem pronunciation.

Final run: **28/28 Gemini 3.8 clips and 25/28 Gemini 2.5 Pro clips**, for **53 new
clips** plus **28 unchanged MMS clips**. Gemini 2.5 Pro returned `finishReason:
OTHER` without audio for `dɛ`, `Wó` and `Ye`; their Gemini 3.8 candidates are
available. All 81 audio files passed technical checks, all hashes matched, and
no two audio hashes were identical. Eight automated checks passed for audio,
Unicode preservation and review identity/shortlisting. Browser checks confirmed
the 28 word cards, 81 players, no horizontal overflow at the tested window size,
review autosave across reload, filtering, shortlist guards and browser decoding
of a generated WAV. Browser download completion could not be observed through
automation; the shortlist payload and page action were verified, and the complete
offline pack is also provided as a ZIP. **No linguistic approvals were made.**

## Review handoff

Open the comparison pack's `review.html`. The two new models appear beside the
original MMS clip for each word. Rate each new candidate **Sounds right**,
**Needs recording**, or **Unsure**. Check the meaning and variety; for entries
with several senses, note which one was checked. The original is a comparison
clip, not a correct-answer recording.

Use **Download review** to save all decisions. After supplying a reviewer name
and spoken variety, **Prepare shortlist** downloads only exact recordings marked
Sounds right. It does not send them anywhere. A different batch, source sample,
entry ID or recording hash cannot inherit these decisions on import.

Before formal submission, check the current public entry, intended sense and
dialect, any human audio added since the snapshot, AI provenance and applicable
provider terms. Speaker prechecks are distinct from formal publication approval.
No recordings have been submitted, attached to dictionary entries or published
by these scripts. No external messages have been sent.

No release post is needed for this local evaluation. Introducing a production
generation/review workflow would be a major update and must include the release
post required by AGENTS.md.
