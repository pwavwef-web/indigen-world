# More room to watch our community progress grow

Status: **Implemented and verified locally on 2026-10-04. Actual product screenshots included. Public website deployment and live verification are pending. Blogger article unpublished; no community messages sent.**

| Field | Value |
|---|---|
| Title | More room to watch our community progress grow |
| Labels | Public website, Progress, Community, Contributions, Design, Kasem |
| Search description | Indigen World's progress page gets a fullscreen view, explanations in popups, and liquid colours and bubbles that grow with community contributions. |
| Custom permalink | progress-fullscreen-popups |
| Article | post.html |
| Sharing copy | share.md |

## What this update covers

- The progress route fills the browser window and hides the global website header and footer; a page-level back link provides navigation.
- Buttons and popups replace dropdown controls and long explanations on the main page.
- The jars and tanks use red, yellow, blue and green colour stages with smooth colour changes and growing bubble populations and sizes.
- Empty and unconfigured vessels show no phantom liquid or bubbles. Visual fills stay capped at 100%, while category counts remain available.
- Pause motion, reduced motion and hidden-tab animation controls remain available.

This changes presentation. Existing progress data queries, category definitions and targets remain the source of the counts. Do not interpret a colour or a screenshot as new approval of contributions or a fixed launch date. The service can retain cached counts when an update is unavailable, and some category queries can fail independently. The pronunciation category currently uses the existing published-dictionary-entry query; this update does not change it into a count of individually verified audio clips.

## Images and credits

Actual product screenshots, visually inspected after capture:

- `images/progress-fullscreen-desktop.png`: Desktop fullscreen progress gallery, captured from a 1440 × 1000 browser viewport as a full-page PNG.
- `images/progress-popup-mobile.png`: Mobile explanation popup, captured from a 390 × 844 browser viewport.

Credit: Indigen World. Both screenshots were captured from the actual locally served product at `http://127.0.0.1:5179/progress` on 2026-10-04 at 13:59 UTC, after the final popup copy cleanup. The page used live production aggregate counts, including 357 words and 105 expressions, without fixture or sample data. Motion was manually paused for these still captures. The captions identify them as local previews; the images do not themselves prove deployment of the redesign.

Blogger: choose Insert image → Upload from computer for both assets, replace each relative `src` in `post.html` with its Blogger image URL, and keep the descriptive alt text and captions. Preview the article at desktop and phone widths.

## Verification and release evidence

- `npm run check:website` passed on 2026-10-04: TypeScript checks, all 13 public-route checks, all 12 progress calculation/presentation invariants, four runtime helper tests and the production build.
- The existing 11 progress checks are preserved. The added presentation check covers immersive route wiring, hidden global header/footer, popup buttons, native dialog accessibility, Escape handling and focus-restoration hooks.
- Runtime tests import the actual liquid appearance helper and cover empty/invalid inputs, unknown targets, exact colour milestones and colour continuity, increasing and bounded bubble volume, and exceeded-target clamping.
- Behavioral checks passed in an isolated local Chromium browser, most recently at 14:00 UTC on 2026-10-04: 10 categories without global header/footer or dropdowns, no production sample controls, all popup paths, Escape and backdrop dismissal, body scroll lock, trigger focus restoration, both vessel views, and mobile layout without horizontal overflow or clipped popups. Reduced motion stopped vessel bubbles and background auras.
- Screenshot captures were visually inspected. The local preview used live production data; test fixtures were not used in the release images.
- Deployment status: pending. Update this section and the article availability statement only after public Hosting release evidence is available.

## Publishing handoff

1. Confirm the deployment and image evidence above is complete and the article's availability statement matches it.
2. Upload the images and replace the article's relative image URLs with the Blogger URLs.
3. Set the title, labels, search description and custom permalink above. Preview desktop and phone layouts.
4. Chinedum can publish the article and replace the clearly marked article URL placeholder in `share.md`.
5. Share the announcement only after publication. Preparing repository content does not publish it externally or send messages.
