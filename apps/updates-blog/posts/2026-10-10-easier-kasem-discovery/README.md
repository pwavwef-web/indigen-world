# A clearer way to learn and explore Kasem

Status: **Deployed and verified on October 10, 2026. Blogger article unpublished.**

- Title: A clearer way to learn and explore Kasem
- Labels: Kasem, Dictionary, Learning, Website, Accessibility, Community Feedback
- Search description: Explore a Kasem learning guide, clearer dictionary filters, saved words, source comparisons and an easier way to share website feedback.
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

The website was released through Firebase Hosting on October 10. Live routes and
build assets were verified on both public domains, followed by production browser
checks. Blogger publication remains with Chinedum. The other apps' pre-existing
local changes are outside this update.

## Verification

- `npm run check:website`: passed TypeScript, public-route/privacy validators,
  progress invariants, 21 unit tests (including six new discovery/storage cases),
  production build and metadata generation for 25 routes plus the hosting 404.
- Final production build passed again after a mobile focus-return improvement.
- Firebase predeploy checks passed before the website-only Hosting release.
- On both `https://indigenworld.com` and `https://indigen-world.web.app`, `/learn`,
  `/dictionary`, `/contact` and `/sitemap.xml` returned HTTP 200. The main script,
  stylesheet and learning, dictionary and contact chunks matched the final local
  build byte-for-byte. See `release-evidence.json` for hashes and verification time.
- Live browser checks on `indigenworld.com` covered learning-page public content,
  the recording filter, distinct meanings/source disclosure, saving and reload
  persistence, copied entry links, mobile dialog focus and last-saved-entry recovery,
  and mobile feedback subject/page/task prefill. No feedback message was sent.
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

All five images are actual website screenshots captured October 10, 2026. The
article uses one live production screenshot and three local preview screenshots:

| Asset | Content |
| --- | --- |
| `images/learning-guide-live.jpg` | Live production learning-page header, captured after deployment; embedded in the article. |
| `images/learning-guide.jpg` | Learning-page header at the normal desktop viewport. |
| `images/learning-steps.jpg` | Three-step learning path and its access/storage labels. |
| `images/dictionary-desktop.jpg` | Search for gaale with separate published source records. |
| `images/dictionary-mobile.jpg` | Phone entry source, generated-audio disclosure, sharing and correction links. |

Credit: Indigen World product interface. `learning-guide-live.jpg` was captured
from `https://indigenworld.com/learn`; the other four are local preview captures. Header
art is existing Indigen World decorative artwork, not documentary cultural imagery.
Language text and attribution come from the already-public collection; the screenshot
does not establish additional reuse permission. Preserve visible source and audio-origin
disclosures. No personal accounts, private records or synthetic language samples are
shown. Unit-test fixture words are synthetic and are not used in these screenshots.

## Blogger handoff

1. Review the recorded release evidence below and confirm availability is still current.
2. Create a Blogger draft with the title, labels, search description and permalink above.
3. Upload the four image files embedded in `post.html` through Blogger:
   `learning-guide-live.jpg`, `learning-steps.jpg`, `dictionary-desktop.jpg` and
   `dictionary-mobile.jpg`. Copy each hosted image URL. `learning-guide.jpg` is a
   supplementary local preview asset and is not embedded in the final article.
4. Paste `post.html` in HTML mode and replace each relative `images/...` source with
   its corresponding hosted URL. Keep the descriptive alt text and captions.
5. Preview desktop and phone layouts. Check image readability and all language/source
   details; keep the mobile image narrow enough to read comfortably.
6. Review factual wording and status. Publication and sharing remain with Chinedum
   unless separately requested. After publication, replace the URL placeholder in
   `share.md` and record the published article URL here.

## Release evidence

- Deployed source commit: `c151f43544e07327b21b2fad43a021deb1ba9598`
- GitHub: pushed to `main` at `https://github.com/pwavwef-web/indigen-world`.
- Website release time: `2026-10-10T05:11:29.105Z` (UTC).
- Firebase project/site: `project-kassena-7e026` / `indigen-world`.
- Finalized Hosting version: `6fd4bc232c0ef287`.
- Hostnames: `https://indigenworld.com` and `https://indigen-world.web.app`.
- Live learning/dictionary/feedback-prefill checks: passed as described above.
- Scope: only `hosting:indigen-world` released; no functions, rules or indexes deployed.
- Later documentation commits record this release; they do not replace the source
  commit served by Hosting.
- Approved contact-delivery test: pending
- Blogger publication date and article URL: pending
