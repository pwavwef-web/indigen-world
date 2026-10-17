# Help Fill the Jars: A living window into our launch progress

Status: **Deployed to Firebase Hosting (site: indigen-world) on 2026-10-04. Live routes at https://indigenworld.com/progress and https://indigen-world.web.app/progress verified with 200 OK. This article is unpublished; no community sharing performed.**

| Field | Value |
|---|---|
| Title | Help Fill the Jars: Track our community progress toward launch |
| Labels | Public website, Progress, Community, Contributions, Launch targets, Kasem |
| Search description | Explore Indigen World's new animated progress page. Watch community contributions fill transparent glass jars and horizontal tanks across ten heritage categories ahead of our planned launch. |
| Custom permalink | help-fill-the-jars-progress |
| Article | post.html |
| Sharing copy | share.md |

## Images and credits

All three images under `images/` are verified visual representations of this implementation. Credit: Indigen World. Visual concepts illustrate the responsive SVG vessels, liquid dynamics, and mobile layout.

- `fill-the-jars-vertical.jpg`: Showcase of the vertical jars gallery with calibrated measurement markings, glowing blue liquid fills, rising bubbles, and direct category contribution CTAs. Labelled illustration: Indigen World.
- `progress-horizontal-tanks.jpg`: Showcase of the alternative horizontal tanks view, displaying advancing liquid menisci, drifting bubbles, and category metrics. Labelled illustration: Indigen World.
- `progress-mobile-view.jpg`: Phone-width view at 390px, showing the view switch, honest "Target being set" state, 340 verified words, and the trustworthy counting explanation. Labelled illustration: Indigen World.

Blogger: use Insert image → Upload from computer for each image. Replace each relative `src` in `post.html` with its Blogger image URL. Keep descriptive alt text and captions. Preview desktop and phone widths.

## Implementation and release evidence

The complete feature was implemented in `apps/website/src/features/progress/` and `apps/website/src/pages/ProgressPage.tsx`, and registered at `/progress`:

- **Categories**: 10 authentic, unmerged categories mapped directly to active schemas (`lexicon`, `expressions`, `sentences`, `literature`, `music`, `audiobooks`, `video`, `grammar`, `proverbs`, `pronunciation`).
- **Counting logic**: Queries use secure server aggregation (`getCountFromServer`) for published, usable records only. Unpublished drafts, pending submissions, rejected items, and duplicate entries are strictly excluded from the liquid fill.
- **Launch targets**: Confirmed collection targets configured: 200,000 words, 1,000 expressions, 400,000 sentences, 100 stories, 100 songs, 100 oral narrations, 1,000 videos, 5,000 grammar patterns, 100 proverbs, and 400,000 pronunciations toward the planned December 2026 / January 2027 launch window. Remote overrides remain supported via Firestore `platformConfiguration/launch`.
- **Two switchable views**: Accessible segmented toggle switches between "Vertical jars" and "Horizontal tanks", persisting visitor preferences in `localStorage` under `indigen_vessel_view_mode`.
- **Motion and accessibility**: SVG liquid fills with gentle wave oscillation and animated bubbles (vertical rising or horizontal drifting). Motion auto-pauses when the document is hidden or off-screen, respects `prefers-reduced-motion: reduce`, and provides a visible pause-motion control. Accessible `role="progressbar"` with `aria-valuenow` provides assistive technology support while decorative bubbles are hidden with `aria-hidden="true"`.
- **Verification**: `npm run check` passed 100% on 2026-10-04, verifying `tsc -b`, `validate-site.mjs` (13 public routes), `validate-progress.mjs` (11 mathematical invariant checks), and production bundle generation with prerendered metadata at `dist/progress/index.html`.

## Publishing steps

1. Confirm with project leadership (Chinedum) whether remote Firestore targets in `platformConfiguration/launch` should be populated prior to publishing.
2. Verify that the launch window statement remains consistent with project scheduling.
3. Upload the three images in `images/`, replace article image URLs in `post.html`, and preview the HTML in Blogger.
4. Set the title, labels, description, and custom permalink above. Chinedum can publish the article.
5. Replace the clearly marked article URL placeholder in `share.md` before community sharing.

Preparing this article does not authorise external publication or sending messages; those remain with Chinedum.

## Visual design (refreshed October 11, 2026)

- Branded art for Blogger: `images/cover.png`, `images/fill-the-jars-vertical.jpg`, `images/progress-horizontal-tanks.jpg`, `images/progress-mobile-view.jpg`. Each is the unaltered product screenshot set in a phone, browser or card frame on an Indigen World backdrop with a title. The frame, backdrop and titles are illustration; the screen contents are real.
- Original screenshots (unaltered, with the credits and test-data labels above) are in `screens/`. Captions in `post.html` still describe what each screenshot shows, including test accounts and sample data.
- Regenerate after editing `art.json` (titles, tags, colours, which screens appear): `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-04-help-fill-the-jars-progress`
- Blogger: upload `cover.png` first (it becomes the card/share image), then each framed JPG. Replace each relative `src` in `post.html` with its Blogger-hosted URL.

## Blogger publication — 11 October 2026

Published to Indigen World Updates through the owner-authorised Edge session, with the prepared cover, framed figures, captions and availability limits. Article publication does not change the product release or approval status described above.

Published article: https://updates.indigenworld.com/2026/10/help-fill-the-jars-progress.html
