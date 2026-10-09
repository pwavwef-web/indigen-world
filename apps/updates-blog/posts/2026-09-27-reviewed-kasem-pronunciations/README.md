# Listen to 18 reviewed Kasem words

Status: **Audio published to 18 dictionary entries on 2026-09-27; 19 public files and the live website verified.** This Blogger article is a draft for Chinedum and records the first release. The subsequent 40-word review and publication are covered in the [second release](../2026-09-27-more-reviewed-kasem-pronunciations/README.md).

| Field | Value |
|---|---|
| Title | Listen to 18 reviewed Kasem words |
| Labels | `Kasem`, `Dictionary`, `Pronunciation`, `Learning` |
| Search description | Listen to 18 Kasem dictionary words with new AI-generated pronunciations reviewed by Chinedum, alongside their meanings and source credits. |
| Custom permalink | `reviewed-kasem-pronunciations` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Image | `assets/kaane-player.jpg` — live dictionary screenshot |

## Image and credit

`assets/kaane-player.jpg` is an unedited screenshot of the live Kasem Dictionary,
captured on 2026-09-27. Credit: Indigen World / Kasem Dictionary. It shows the
published kaane entry and its pronunciation player; it is not an AI illustration.
The image is embedded in `post.html` with alt text and a caption. Its relative path
works for local preview; replace it with Blogger's uploaded image URL before
publishing. The player's initial time display is not a recording duration claim.

## Verified release evidence

- Chinedum supplied `kasem-comparison-2026-09-27T030247-301208+0000-review.json` and explicitly instructed publication of its approved recordings. It contained 19 acceptable takes, 33 rejected takes and one unchecked take. The review's optional reviewer/variety fields were blank; publication authority is the separate owner instruction, not a fabricated reviewer field.
- The review SHA-256 is `5945830c72309a28f8eab6b07c7a75573a10fd7f2593fc1bf1d8796105b83e71`. Decisions were validated against the exact source sample, entry, candidate and audio hash.
- `tools/kasem-pronunciation-pilot/publish-approved.mjs --commit` published release `kasem-tts-5945830c72309a28f8eab6b0` to Firebase project `project-kassena-7e026` at `2026-09-27T03:51:57.572Z`. The audit record has the same ID in `auditLogs`.
- All 18 entries were still published, unchanged in headword/meaning/dialect, and without an existing pronunciation. An atomic transaction set the main audio, approved variants and AI provenance. Existing human audio cannot be overwritten by this importer.
- All 19 public WAV downloads matched the approved bytes. Vei has two approved variants, with Gemini 3.8 selected for its main player. No MMS baseline, rejected take or unchecked take was published.
- The visible attribution preserves original source credits and adds the Google Gemini / Chinedum audio credit. A follow-up check restored the visible source fallback on 10 entries at `2026-09-27T03:54:19.191Z`; original source fields were never removed.
- Anonymous production verification passed at `2026-09-27T03:55:48.852Z`: all 18 entries and 19 variants were visible in the public dictionary query, and the 10 other words from the first sample had no audio from this release. The live website displayed kaane's player and original source plus AI attribution.
- Local evidence is in `exports/kasem-pronunciation-publication-2026-09-27/`: the original review, before-state backup, publication plan/receipt, attribution verification, public verification and `live-dictionary.png`. Exports are intentionally ignored by Git.
- Review/state, publication-policy and audio/Unicode checks passed (14 automated tests). The release uses existing dictionary data and players; no hosting or app binary deployment was needed.

## Availability limits

The main dictionary player exposes one recording per entry. Vei's second approved take is retained in metadata and public storage, but there is no alternate-take selector. Public URL access, recording identity and the website player/attribution were verified; a physical Android or iOS playback test was not performed. Owner approval is specific to the reviewed takes and does not certify all senses or varieties.

At this first release's handoff, the next local review pack contained 40 new words and 61 clips: 40 Gemini 3.8 takes and 21 Gemini 2.5 Pro takes. Pro reached its daily quota; three earlier requests returned no usable audio or a connection failure. These were generation gaps, not pronunciation rejections. That later round has since been reviewed and published separately; see the second release linked above.

## Publishing handoff

1. Paste `post.html` into Blogger in HTML view and apply the title, labels, search description and permalink above.
2. Upload `assets/kaane-player.jpg` in Blogger. Replace the article's relative image `src` with the uploaded URL, keeping the alt text and caption.
3. Preview the article, image and dictionary link, then publish when ready.
4. Replace `[PUBLISHED_POST_URL]` in `share.md` with the article URL before sharing.

No Blogger publication or external messages were sent as part of this work.
