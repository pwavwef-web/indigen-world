# A steadier place to look up Kasem

Status: **Implemented locally; production deployment and Blogger publication pending.**

- Title: A steadier place to look up Kasem
- Labels: Kasem Dictionary, Website, Accessibility, Fixes
- Search description: A prepared Kasem Dictionary fix keeps panels steady when scrolling upward and preserves your place when returning to results on phones.
- Custom permalink: dictionary-steady-scrolling
- Article: `post.html`
- Sharing copy: `share.md`
- Images: `images/dictionary-desktop.png`, `images/dictionary-mobile.png`
- Supplementary verification screenshot: `images/dictionary-mobile-detail.png`

## Implementation and evidence

The owner's October 4 screen recording shows the navigation and panels repeatedly
moving while an entry is scrolled upward. Agents inspected the actual public
build, which contains collection navigation and auto-hiding navigation absent
from this checkout and the fetched `origin/main`.

To preserve the shipped interface, this change recovers the application's own
`App.tsx`, `firebase.ts` and `collections.ts` from the publicly served source map
for `index-BshAsw8p.js`, and restores readable CSS from `index-BS9S_TVW.css`.
The font faces continue to come from the existing Noto Sans import. Recovery is
limited to the dictionary app; other existing workspace changes are preserved.

Recovered public-build SHA-256 checksums:

```text
index-BshAsw8p.js      6f9fc18e72b05fdea1e0f3aab60d55358b7fb7daa4fdb5f96ba107d3d3f9fcf5
index-BS9S_TVW.css     d35ae921e31f38842c471b9dc2abde6fd72260899c1ce12e174f338e82ffd311
index-BshAsw8p.js.map  ed99e12bbb0ba1928532716d71f6893275c5045de7a3432244022e9b5972d9ca
```

The defective build animates shell padding from 100px to 24px and enlarges
dictionary panels by 76px when navigation hides. The resulting scroll-position
clamping creates additional events that the navigation listener interprets as
a reversal. Its direction and accumulated distance were also shared between
otherwise independent scrolling panels.

The fix keeps shell padding and panel dimensions independent of navigation
visibility. Only the fixed header's transform and opacity animate. Scroll
direction and distance are tracked separately for the document and dictionary
panels, and unrelated nested scrolling is ignored. Independent panels contain
vertical overscroll. Definition overlays suspend header tracking on mobile;
closing one restores the original result's focus with `preventScroll`.

Validation commands:

```text
npm run check --workspace @indigen-world/kasena-dictionary
npm run test:scroll --workspace @indigen-world/kasena-dictionary
```

The browser check requires Playwright and a local Chromium browser. Configure
`PLAYWRIGHT_PACKAGE`, `CHROMIUM_EXECUTABLE`, and `SCROLL_PREVIEW_URL` as needed.
See the script for its default preview address and tested sizes. Browser checks
cover panel geometry, navigation settling after input, collection controls,
search and mobile return behavior. Live database reads verify existing public
content; these checks do not create or publish entries.

Verified October 4 against the final production build served locally at
`http://127.0.0.1:5176`: type checks, publication-boundary validation and build
passed. Browser regression checks passed at 1918×880 (the recording's size),
1600×720, 900×720, 1600×720 with reduced motion, and 390/360px mobile widths.
Repeated down/up cycles and additional wheel input at the bottom preserved
panel geometry and settled scroll position. All four collection controls and
the search shortcut passed; mobile Next/Previous → Results preserved the
original opener and results position. No uncaught browser errors occurred.

The old live stylesheet failed the same geometry assertion (panel top moved
between approximately 73px and 100px). Independently, one wheel action on the
live site at 1918×880 produced four alternating navigation visibility changes
within about 253ms, confirming the feedback loop seen in the recording.
These results verify the local fix; they do not confirm a live deployment.

## Image credits

Both images are screenshots of the actual fixed local Kasem Dictionary preview,
captured during browser verification on October 4, 2026. Interface: Indigen World.
Displayed entries are existing public collection content with their existing
attribution. These are product screenshots, not illustrations or proof of a
production deployment. A still screenshot alone does not demonstrate scrolling.
The supplementary detail screenshot uses the same source and credits, and shows
the modal screen used in the mobile return-position check.

## Publishing handoff

1. Deploy the reviewed dictionary build and verify upward scrolling on the public
   domain before changing this article's availability claim to live.
2. Create a Blogger post with the metadata above and paste `post.html` into HTML
   view.
3. Upload both actual image files from `images/` using Blogger. Replace the two
   relative `src` values with the Blogger-hosted image URLs. Preserve the alt text
   and captions; check desktop and mobile previews.
4. Update deployment/verification status here and in the article from evidence.
5. Chinedum can publish the article, replace the URL placeholder in `share.md`,
   and share the copy. No article publication or messages are authorized by
   preparing this repository content.
