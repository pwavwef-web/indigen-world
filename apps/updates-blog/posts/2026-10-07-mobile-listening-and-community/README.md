# A clearer app for community and offline listening

Status: **Implemented in the repository; Google Play rollout, backend tag deployment, Blogger publication and sharing are pending.** Local verification results are recorded in `apps/mobile/docs/2026-10-07-mobile-improvements-verification.md`. Do not describe this as live until a release is confirmed.

| Field | Value |
|---|---|
| Title | A clearer app for community and offline listening |
| Labels | `Mobile app`, `Community`, `Offline listening`, `Design`, `Kasem` |
| Search description | Joined community feeds, direct Downloads playback, searchable post tags, visible Explore controls, a Black theme and clearer support in Indigen World. |
| Custom permalink | `mobile-community-and-offline-listening` |
| Cover | `screens/community-feeds.png` |

The post groups the thirteen related mobile improvements. It preserves the distinction between topic tags and media formats, subscription download limits and access to already saved files, local implementation and a released app.

## Images and credits

All four assets are actual renders of the implemented Flutter widgets at 390×844 logical pixels, saved at 2× resolution (780×1688). They use labelled synthetic post, membership and track fixtures, without production requests or personal data. They are local previews, not images from a deployed app. The Downloads preview shows a supplied test file state; it does not establish native offline decoding or playback. No decorative illustrations or image placeholders are used.

- `screens/community-feeds.png`: actual Community page, joined membership strip and a clearly labelled test post.
- `screens/downloads-listening.png`: actual Downloads listening destination with sample metadata.
- `screens/searchable-tags.png`: actual composer Tag sheet with the supported catalogue.
- `screens/black-support.png`: actual Contact Support page in Black.

Design, source and rendering: Indigen World. Local render font: Windows Segoe UI loaded under the application's font family, with Material icons from Flutter. These font substitutions apply only to this render script; device metrics may differ. No external photography or artwork is used.

Reproduce from `apps/mobile` on this Windows workspace:

```powershell
flutter test --no-pub ../updates-blog/posts/2026-10-07-mobile-listening-and-community/render_mobile_test.dart
```

## Release and publishing handoff

1. Review the verification report and complete the listed Android and Play-distributed device journeys.
2. Deploy the compatible Firestore rules and community feed function changes before offering Events and Community Updates in production. Verify remote review configuration; Google's card is quota controlled.
3. Build and distribute the app through the existing signed production release process. Record the actual app version, Play track and rollout evidence here and update the article's availability language.
4. Upload the four PNG assets to Blogger. Replace every relative `src="images/..."` in `post.html` with its uploaded Blogger image URL, or replace the corresponding image in Compose view. Keep the descriptive alt text and local-preview captions. Use Community as the cover.
5. Create a Blogger post in HTML view using `post.html`; enter the title, labels, description and permalink above. Preview on mobile and desktop, checking all images and links.
6. Publish only when authorised by Chinedum. Replace `[PUBLISHED_ARTICLE_URL]` in `share.md` with the actual article URL before sharing. Repository preparation does not authorise external publication or messages.

## Visual design (refreshed October 11, 2026)

- Branded art for Blogger: `images/cover.png`, `images/community-feeds.jpg`, `images/downloads-listening.jpg`, `images/searchable-tags.jpg`, `images/black-support.jpg`. Each is the unaltered product screenshot set in a phone, browser or card frame on an Indigen World backdrop with a title. The frame, backdrop and titles are illustration; the screen contents are real.
- Original screenshots (unaltered, with the credits and test-data labels above) are in `screens/`. Captions in `post.html` still describe what each screenshot shows, including test accounts and sample data.
- Regenerate after editing `art.json` (titles, tags, colours, which screens appear): `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-07-mobile-listening-and-community`
- Blogger: upload `cover.png` first (it becomes the card/share image), then each framed JPG. Replace each relative `src` in `post.html` with its Blogger-hosted URL.

## Blogger publication — 11 October 2026

Published to Indigen World Updates through the owner-authorised Edge session, with the prepared cover, framed figures, captions and availability limits. Article publication does not change the product release or approval status described above.

Published article: https://updates.indigenworld.com/2026/10/mobile-community-and-offline-listening.html
