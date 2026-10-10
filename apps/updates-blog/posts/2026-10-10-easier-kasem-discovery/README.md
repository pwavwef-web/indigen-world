# A clearer way to learn and explore Kasem

Status: **Implemented and verified locally on October 10, 2026. Not deployed by this work. Blogger article unpublished.**

- Title: A clearer way to learn and explore Kasem
- Labels: Kasem, Dictionary, Learning, Website, Accessibility, Community Feedback
- Search description: Preview a Kasem learning guide, clearer dictionary filters, saved words, source comparisons and an easier way to share website feedback.
- Suggested permalink: easier-kasem-discovery
- Article: `post.html`
- Sharing copy: `share.md`
- Product and editorial follow-up: [improvement plan](../../../../docs/product/website-improvement-plan-2026-10-10.md)

## Scope and release status

This update changes the public website in `apps/website`. It adds `/learn`, discovery
links, dictionary search ranking and filters, source-preserving spelling groups,
entry-link copying, browser-storage recovery and contextual feedback through the
existing contact form. It clarifies service and legal-review status without claiming
new service availability. Public Firestore reads were used for verification; no
language records, permissions, backend functions or indexes were changed.

The word view excludes explicitly sentence/expression-classified records. It does
not reclassify or delete them. Saved IDs remain local to the visitor's browser.
Existing anonymous browsing remains available. New analytics actions are behind
the existing disabled-unless-configured gate; event delivery and user outcomes have
not been measured. Feedback delivery was not tested by sending a real message.

Deployment, live smoke tests and Blogger publication are pending. Do not describe
this as a live release until the release evidence below is updated. The other apps'
pre-existing local changes are outside this update.

## Verification

- `npm run check:website`: passed TypeScript, public-route/privacy validators,
  progress invariants, 21 unit tests (including six new discovery/storage cases),
  production build and metadata generation for 25 routes plus the hosting 404.
- Final production build passed again after a mobile focus-return improvement.
- Actual production-preview browser checks at 1280px, 1080px and 390px covered
  the changed journeys: learning guide, public expressions, exact meaning search,
  spelling groups, combined filters, empty results, saved-list persistence after
  reload, mobile save/removal, source disclosure, audio load/play, copied entry link,
  valid and unavailable entry links, keyboard focus loop/Escape/return, and feedback
  prefill/required-field validation. No message was submitted.
- Horizontal overflow was checked on the changed mobile pages. This is targeted
  browser verification, not a complete accessibility audit or performance benchmark.
- The full `test:motion` browser suite was not run in this update.
- Remaining Apple app identifiers and app-ads build notices are pre-existing
  configuration limits, unrelated to this website feature.

## Images and credits

All four images are actual local website screenshots captured October 10, 2026:

| Asset | Content |
| --- | --- |
| `images/learning-guide.jpg` | Learning-page header at the normal desktop viewport. |
| `images/learning-steps.jpg` | Three-step learning path and its access/storage labels. |
| `images/dictionary-desktop.jpg` | Search for gaale with separate published source records. |
| `images/dictionary-mobile.jpg` | Phone entry source, generated-audio disclosure, sharing and correction links. |

Credit: Indigen World product interface, captured from the local preview. Header
art is existing Indigen World decorative artwork, not documentary cultural imagery.
Language text and attribution come from the already-public collection; the screenshot
does not establish additional reuse permission. Preserve visible source and audio-origin
disclosures. No personal accounts, private records or synthetic language samples are
shown. Unit-test fixture words are synthetic and are not used in these screenshots.

## Blogger handoff

1. Confirm website deployment and record the commit/build, time, hostname and actual
   live checks below. Update the opening preview notice and sharing copy only when true.
2. Create a Blogger draft with the title, labels, search description and permalink above.
3. Upload the four real image files through Blogger. Copy each hosted image URL.
4. Paste `post.html` in HTML mode and replace each relative `images/...` source with
   its corresponding hosted URL. Keep the descriptive alt text and captions.
5. Preview desktop and phone layouts. Check image readability and all language/source
   details; keep the mobile image narrow enough to read comfortably.
6. Review factual wording and status. Publication and sharing remain with Chinedum
   unless separately requested. After publication, replace the URL placeholder in
   `share.md` and record the published article URL here.

## Release evidence to complete

- Deployed commit/build: pending
- Website deployment time and hostname: pending
- Live learning/dictionary/feedback-prefill checks: pending
- Approved contact-delivery test: pending
- Blogger publication date and article URL: pending
