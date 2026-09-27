# Another 25 Kasem words to hear and practise

Status: **Published to 25 more dictionary entries on 2026-09-27; all 26 approved public audio files verified.** Both releases passed anonymous production checks. The Blogger article remains a draft for Chinedum.

| Field | Value |
|---|---|
| Title | Another 25 Kasem words to hear and practise |
| Labels | `Kasem`, `Dictionary`, `Pronunciation`, `Learning` |
| Search description | Another 25 Kasem dictionary entries have reviewed pronunciation audio, bringing the two listening rounds to 43 words learners can hear and practise. |
| Custom permalink | `more-reviewed-kasem-pronunciations` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Image | `assets/diim-player.jpg` — live dictionary screenshot |

## Image and credit

`assets/diim-player.jpg` is an unedited screenshot of the live Kasem Dictionary,
captured on 2026-09-27. Credit: Indigen World / Kasem Dictionary. It shows diim's
meaning, Navrongo label and pronunciation player. It is embedded in `post.html`
with alt text and a caption. Replace its local relative path with the image URL
returned by Blogger after uploading the supplied asset. The player's initial
time display is not a recording duration claim.

## Review and release evidence

- Source review: `kasem-comparison-2026-09-27T034620-204140+0000-review.json`, supplied by Chinedum after the request to publish approved takes and repeat the process with more words.
- Review SHA-256: `07304fe88d65281da3a8c7d7e823eb017de0557e86879c723c7c6370a2a63e98`.
- Source batch: `kasem-comparison-2026-09-27T034620-204140+0000`; source sample SHA-256: `0ffd64de8e4aa8bb4e948c18347668c84302f0186669aa30e35a09be86075c33`.
- All 61 available takes were reviewed: 26 acceptable, 35 needing another recording, zero unsure or pending. Twenty-five distinct entries have an approved take. Optional reviewer/variety fields in the JSON are blank; the owner’s earlier instruction is the publication authority, not a fabricated review field.
- Dry run verified each approved file against the review and manifest. All 25 current entries were published, unchanged in spelling/meaning/dialect and without existing audio. Zuna has two approved takes; Gemini 3.8 is the main recording and Gemini 2.5 Pro is retained as an alternate.
- Target: Firebase project `project-kassena-7e026`, database `(default)`. Release/audit ID: `kasem-tts-07304fe88d65281da3a8c7d7`.
- `tools/kasem-pronunciation-pilot/publish-approved.mjs --commit` published at `2026-09-27T04:14:51.062Z`; read-back verification completed at `2026-09-27T04:14:53.767Z`. All 26 public WAV downloads matched the reviewed bytes before the atomic dictionary update.
- Anonymous verification passed at `2026-09-27T04:15:21.691Z`: all 25 entries and 26 approved variants were present in the public dictionary query, the other 15 words had no recording from this release, and diim's public audio matched its approved hash.
- The first release was rechecked at `2026-09-27T04:15:23.812Z`: all 18 entries and 19 variants remained available, including a verified public download of kaane.
- A further read-back at `2026-09-27T04:15:56.947Z` confirmed visible original credits on all 25 entries, unchanged source/contributor and general review fields, zero overlap between the two batches, and combined totals of 43 entries and 45 approved takes.
- Local evidence directory: `exports/kasem-pronunciation-publication-round-2-2026-09-27/`. It contains the plan, original review, before-state backup, receipt, public verification and attribution/combined verification. These exports are intentionally ignored by Git.

## Availability limits

The existing main player shows one recording per entry. Alternate recordings remain in metadata and public storage; there is no alternate-take selector. This publication changes dictionary data, not the website or mobile app binary. Physical-device playback is not part of this release check. Review of individual takes does not certify every meaning or dialect.

The previous release post is kept intact as the record of the first 18 words. This follow-up records the second release and the combined total of 43 entries and 45 approved takes.

## Publishing handoff

1. Confirm the publication and verification status above is complete.
2. Paste `post.html` into Blogger in HTML view, using the title, labels, search description and permalink above.
3. Upload `assets/diim-player.jpg` in Blogger and replace the article's relative image `src` with the uploaded URL, keeping its alt text and caption.
4. Preview the image and dictionary link, then publish when ready.
5. Replace `[PUBLISHED_POST_URL]` in `share.md` with the published article URL before sharing.

No Blogger article was published and no external messages were sent.
