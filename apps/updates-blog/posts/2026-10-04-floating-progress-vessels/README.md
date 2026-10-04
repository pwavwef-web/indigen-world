# An open, animated space for our community progress

Status: **Implemented and verified locally on 2026-10-04. This version has not been deployed. Blogger article unpublished; sharing left to Chinedum.**

| Field | Value |
|---|---|
| Title | An open, animated space for our community progress |
| Labels | Public website, Progress, Community, Kasem, Design, Contributions |
| Search description | Explore floating glass jars, glowing tanks and textured local pot illustrations, with less text and contribution details available in popups. |
| Custom permalink | floating-progress-vessels |
| Article | post.html |
| Sharing copy | share.md |

## What changed

The progress route now has an icy-blue open gallery with no vessel cards, dimensional glass optics, hollow rims, floating motion, bounded bubbles, textured raster pottery and a compact view switch. Mobile jars and pots use a swipe gallery with previous/next buttons; tanks use a list. Explanations and pledge/share/counting actions are inside category popups. The existing data table, direct TribeStudio links, view persistence, motion pause, reduced motion and hidden-tab behavior are retained.

Counts, configuration, target calculations and Firestore queries were not changed. Existing data and cache limitations remain; in particular the pronunciation query still counts published dictionary entries. No claim of newly approved content, new live totals or a confirmed public deployment is made.

## Images and credits

All five images under `images/` are actual product screenshots captured on October 4, 2026 from `http://127.0.0.1:5175/progress` in an isolated Chromium browser. The development preview was explicitly switched to **sample counts and targets**, and motion was paused for still captures. The preview banner remains visible on the galleries; the popup labels its statistics as sample records. Captures were visually inspected after the final layout corrections.

- `floating-jars-desktop.png`: full-page capture from a 1440 × 1000 viewport.
- `glowing-tanks-desktop.png`: full-page capture from a 1440 × 1000 viewport.
- `local-pots-desktop.png`: full-page capture from a 1440 × 1000 viewport.
- `floating-jars-mobile.png`: full-page capture from a 390 × 844 viewport.
- `category-popup-mobile.png`: viewport capture at 390 × 844 after popup entrance animation completed.

Screenshot credit: Indigen World. Pottery artwork: generated with OpenAI's built-in imagegen tool for this redesign. These are artistic illustrations inspired by northern Ghana, not authenticated Kasena cultural artifacts. Both transparent image assets are saved in `apps/website/public/assets/progress/`, with complete generation prompts and provenance in that directory's `README.md`. The actual pottery illustrations appear in the local-pots screenshot saved with this post.

In Blogger, use Insert image → Upload from computer for each image above. Replace the relative `src` values in `post.html` with the corresponding Blogger-hosted image URLs. Keep every alt description and caption, including the sample-data and generated-illustration labels. Preview at desktop and phone widths.

## Verification

- `npm run check:website` passed: TypeScript, public-route checks, progress calculations/presentation checks, four liquid helper tests, production build and metadata generation.
- `npm run test:progress:browser --workspace @indigen-world/website` passed against the development preview: ten collections; all four views; exact vertical and horizontal fill dimensions; true percentages above target with clamped visuals; popup scroll locking, Escape and focus restoration; pledge/share/audit dialog transitions; raster asset loading; no page overflow at 320, 390, 768 and 1440 pixels; vessel/count separation; mobile gallery arrows; Alt+T; manual pause and reduced motion.
- New visual screenshots were inspected. No browser runtime errors were observed in the checks.
- The production build contains both pottery image files. Public hosting deployment is pending.

The browser script accepts `PROGRESS_PREVIEW_URL`, `PLAYWRIGHT_PACKAGE` and `CHROMIUM_EXECUTABLE`. Use `PROGRESS_SCREENSHOTS` for an output directory. It requires a running development preview because it intentionally verifies the labelled fixture controls.

## Publishing handoff

1. Confirm public deployment and availability of the redesigned `/progress` page before announcing it as live. Update the availability paragraph and this status using release evidence.
2. Upload the five images to Blogger and replace all relative image URLs.
3. Set the title, labels, search description and custom permalink above. Preview the article.
4. Chinedum decides when to publish. Replace the clearly marked URL placeholder in `share.md` before sharing.

Preparing these files does not publish externally or send messages.
