# Indigen World 0.1.32: one release with the latest improvements

Prepared 9 October 2026. The signed Android 0.1.32+41 bundle is verified. Merge and GitHub publication are tracked in `docs/product/releases/0.1.32+41.md`. Google Play upload/rollout, physical-device verification, Blogger publication and sharing are separate and unconfirmed.

Confirmed GitHub publication: [Indigen World 0.1.32 (41)](https://github.com/pwavwef-web/indigen-world/releases/tag/mobile-v0.1.32%2B41), published 9 October 2026 at 21:48 UTC after PR #31 merged. The signed build 41 AAB and checksum file are attached; the uploaded digest matches the freshly verified local artifact. This confirms GitHub availability, with the other availability limits above unchanged.

| Field | Value |
| --- | --- |
| Title | Indigen World 0.1.32: one release with the latest improvements |
| Labels | `Indigen World`, `Android`, `Community`, `Offline listening`, `Contributions`, `Kasem` |
| Search description | Community navigation, local Downloads playback and repair, recovered drafts, Black appearance and source-backed Kasem references in Indigen World 0.1.32. |
| Custom permalink | `indigen-world-0-1-32-release` |
| Cover | `screens/community-feeds.png` |

## Images and credits

All assets are actual product/widget previews owned and rendered by Indigen World. Test data is labelled; there is no production personal data or external photography.

- `screens/community-feeds.png`: reused actual Flutter widget capture from the included October 7 community changes, using Segoe UI as a preview font. Community implementation is retained in this release.
- `screens/mobile-downloads-test.png`: new actual Flutter Downloads capture from the combined source, using SDK Roboto/Material icons and synthetic metadata. It verifies layout and controls, not native decoding/playback.
- `screens/draft-recovery-phone.png`: reused actual TribeStudio browser capture from the included October 9 contribution-workflow changes, using test records.

Source captures remain intact in their original release folders. Captions distinguish local previews from deployed screenshots. Device fonts and metrics can differ.

## Blogger publication and sharing

1. Review the release record and confirm the current GitHub and Play availability before updating the article's availability paragraph.
2. Upload all three PNG files to Blogger. Replace each relative `src="images/..."` in `post.html` with its uploaded Blogger URL, retaining descriptive alt text and captions. Use Community as the cover.
3. Paste `post.html` in Blogger's HTML view and enter the title, labels, description and permalink above. Preview on phone and desktop and check image loading.
4. Chinedum publishes the article and replaces `[PUBLISHED_ARTICLE_URL]` in `share.md` with the real article URL before sharing. This task does not publish to Blogger or send community messages.

Compatible Events/Community Updates rules and feed functions are included in the source. Their production deployment is not established by a repository merge. Candidate-index retrieval remains disabled; no production backfill is part of this consolidation.

## Visual design (refreshed October 11, 2026)

- Branded art for Blogger: `images/cover.png`, `images/community-feeds.jpg`, `images/mobile-downloads-test.jpg`, `images/draft-recovery-phone.jpg`. Each is the unaltered product screenshot set in a phone, browser or card frame on an Indigen World backdrop with a title. The frame, backdrop and titles are illustration; the screen contents are real.
- Original screenshots (unaltered, with the credits and test-data labels above) are in `screens/`. Captions in `post.html` still describe what each screenshot shows, including test accounts and sample data.
- Regenerate after editing `art.json` (titles, tags, colours, which screens appear): `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-09-consolidated-app-release`
- Blogger: upload `cover.png` first (it becomes the card/share image), then each framed JPG. Replace each relative `src` in `post.html` with its Blogger-hosted URL.

## Blogger publication — 11 October 2026

Published to Indigen World Updates through the owner-authorised Edge session, with the prepared cover, framed figures, captions and availability limits. Article publication does not change the product release or approval status described above.

Published article: https://updates.indigenworld.com/2026/10/indigen-world-0-1-32-release.html
