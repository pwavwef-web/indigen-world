# A little movement, with a purpose

Status: **Implemented and checked locally; production deployment and Blogger publication pending.**

- Title: A little movement, with a purpose
- Labels: Indigen World, Website, Design, Accessibility, Labs
- Search description: Purposeful page animations, gentle scroll reveals and remembered motion controls are coming to the Indigen World public website.
- Custom permalink: public-website-in-motion
- Article: `post.html`
- Sharing copy: `share.md`
- Images: `images/home-desktop.png`, `images/ecosystem-desktop.png`, `images/labs-desktop.png`, `images/practice-mobile.png`

## Implementation and availability

- React/SVG editorial illustrations are driven by a 240-frame, 30fps Remotion Player timeline. Page themes cover the homepage, About, ecosystem, Project Kassena, dictionary, contributions, governance, involvement, contact, legal pages, public sharing pages, checkout return, tester recognition and recovery. All eight Labs routes have an illustration, including signed-out activity/admin states and the signed-in record components.
- The existing Beyond the Reef experience retains its song-driven scenes and player. It has no new Remotion overlay. New site-wide reduced-motion CSS honours its device setting alongside its existing preference hook.
- Integrated with the newer privacy notice from `origin/main` (`d2b8368`): preserved its notice, section navigation and stewardship video, shared the persisted pause control, and added the browser-storage disclosure to its website section. Privacy has no additional Remotion overlay. Its existing save-data and video-error still fallback remain intact.
- Header text enters in sequence; sections, cards and process content reveal on scroll. Cards respond to hover and keyboard focus. The reveal observer watches lazy routes and subsequently loaded content; unobserved content stays visible. Legal section headings use the same subtle reveal treatment.
- Pause/resume is stored under `indigen-world-motion-paused` in browser localStorage, with a session fallback if storage is unavailable. The privacy page explains this choice. The new artwork stops offscreen and when the document reports a hidden tab. Reduced-motion changes are observed live and substitute static SVG artwork.
- The Remotion Player is a separate lazy chunk (about 98 KB gzip in the verified local build). Reduced-motion visitors use the shared still illustration without downloading that chunk. A local animation error boundary preserves the illustration when loading fails.
- Illustrations are decorative: they do not report payment confirmation, review approval, live activity, language authenticity or measured impact. These changes do not modify backend permissions or experiment access.
- Not deployed during this task. Existing product status text is unchanged; the screenshots are not evidence of a production rollout or successful signed-in Labs workflows.

## Verification

- `npm run check:website`: TypeScript, existing route/privacy invariants, production build and metadata generation passed.
- Production-preview Chromium checks passed: 25 routes at 1440 and 360 pixels with no horizontal overflow or uncaught page errors and all new pause controls reachable. Playback advances when visible, freezes when paused/offscreen, resumes on return and retains the pause choice through navigation and reload. The document visibility handler was exercised with a simulated hidden-state event. Live reduced-motion changes produce a still and reveal all content; a fresh 390-pixel reduced-motion dictionary visit does not request the Remotion chunk. Aborting the Player chunk download keeps Contact readable with a still illustration.
- Scroll checks confirm the homepage path cards reveal and stay readable; keyboard focus activates their lift treatment. The final production build and browser suite passed after the timeline and card-transition refinements.
- After integrating the newer privacy release, the complete local build and 25-route browser suite passed again. The privacy video was checked advancing, pausing, retaining the shared choice after visiting another page, resuming, and switching to its still image when reduced motion is enabled.
- Blogger feed requests are blocked in the motion test to isolate the independent feed; live feed and authenticated service workflows are outside this verification.

## Image credits and Blogger publishing steps

Credit: Indigen World, actual local production-preview screenshots, October 2, 2026. The animated abstract illustrations were authored in React/SVG for this update. Existing background artwork remains from the website. These visuals are illustrations, not photographs or representations of community-owned cultural symbols. No private account data appears in the screenshots.

1. Review and deploy the intended website commit through the repository's existing release workflow. Verify the released pages on a phone and desktop, pause/resume, navigation and device reduced-motion preferences.
2. Update the deployment status here and the article's availability paragraph only after confirmed production evidence. Do not publish the draft as a live release before that check.
3. Chinedum creates a Blogger draft with the title, labels, search description and permalink above, then pastes `post.html` in HTML mode.
4. Upload all four PNG files to Blogger. Replace their local `images/...` sources in the article with the uploaded URLs, preserving descriptive alt text and captions. Keep the mobile screenshot at a readable width and the desktop screenshots responsive.
5. Chinedum publishes and shares when ready. Replace the marked article URL placeholder in `share.md` with the published Blogger URL. No external publication or messages were performed by this task.
