# A little movement, with a purpose

Status: **Deployed October 2, 2026; production assets verified. Blogger publication pending.**

- Title: A little movement, with a purpose
- Labels: Indigen World, Website, Design, Accessibility, Labs
- Search description: Indigen World now has purposeful page animations, gentle scroll reveals and remembered motion controls across its public website.
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
- Deployed to Firebase Hosting site `indigen-world` on October 2, 2026 from `origin/main` commit `b28265547c4af05e9c7657ac6c0dffebd81a73d1`. The screenshots remain local preview images; they do not claim successful signed-in Labs workflows.

## Verification

- `npm run check:website`: TypeScript, existing route/privacy invariants, production build and metadata generation passed.
- Production-preview Chromium checks passed: 25 routes at 1440 and 360 pixels with no horizontal overflow or uncaught page errors and all new pause controls reachable. Playback advances when visible, freezes when paused/offscreen, resumes on return and retains the pause choice through navigation and reload. The document visibility handler was exercised with a simulated hidden-state event. Live reduced-motion changes produce a still and reveal all content; a fresh 390-pixel reduced-motion dictionary visit does not request the Remotion chunk. Aborting the Player chunk download keeps Contact readable with a still illustration.
- Scroll checks confirm the homepage path cards reveal and stay readable; keyboard focus activates their lift treatment. The final production build and browser suite passed after the timeline and card-transition refinements.
- After integrating the newer privacy release, the complete local build and 25-route browser suite passed again. The privacy video was checked advancing, pausing, retaining the shared choice after visiting another page, resuming, and switching to its still image when reduced motion is enabled.
- Blogger feed requests are blocked in the motion test to isolate the independent feed; live feed and authenticated service workflows are outside this verification.

## Image credits and Blogger publishing steps

Credit: Indigen World, actual local production-preview screenshots, October 2, 2026. The animated abstract illustrations were authored in React/SVG for this update. Existing background artwork remains from the website. These visuals are illustrations, not photographs or representations of community-owned cultural symbols. No private account data appears in the screenshots.

1. Review the draft for publication. The website deployment is complete; the existing guarded release command verified `origin/main` and reran the required checks before uploading.
2. Keep the confirmed availability and verification limits below when publishing. Any later functionality changes need fresh verification.
3. Chinedum creates a Blogger draft with the title, labels, search description and permalink above, then pastes `post.html` in HTML mode.
4. Upload all four PNG files to Blogger. Replace their local `images/...` sources in the article with the uploaded URLs, preserving descriptive alt text and captions. Keep the mobile screenshot at a readable width and the desktop screenshots responsive.
5. Chinedum publishes and shares when ready. Replace the marked article URL placeholder in `share.md` with the published Blogger URL. No external publication or messages were performed by this task.

## Production deployment evidence

- `npm run deploy:website -- --non-interactive` completed successfully for `project-kassena-7e026`, Hosting site `indigen-world`, on October 2, 2026. The website guard verified `origin/main` at `b2826554`; TypeScript, route/privacy checks, production build and metadata generation passed.
- The custom domain `https://indigenworld.com` returned HTTP 200 for the homepage, ecosystem, dictionary, contribute, privacy, Labs and Kasem Practice Lab. Its HTML references the exact deployed entry script. SHA-256 hashes of the served entry, Remotion artwork, page motion, SVG scene, motion context and privacy CSS/JavaScript match the local release build.
- The complete browser motion suite also passed against `https://indigenworld.com`: all 25 routes at 1440 and 360 pixels, reachable controls, playback, saved pause across navigation/reload, scroll reveals, keyboard card motion, offscreen pause/resume, simulated tab visibility, live/fresh reduced-motion preferences and failed-download still fallback. The preserved privacy video advances, pauses, shares the saved preference across routes, resumes and switches to its still with reduced motion. This is frontend verification; authenticated service workflows and the independent Blogger feed remain outside its scope.
- Website Hosting was released. No backend functions, database rules or app releases were changed by this deployment. Blogger publication and sharing remain with Chinedum.
