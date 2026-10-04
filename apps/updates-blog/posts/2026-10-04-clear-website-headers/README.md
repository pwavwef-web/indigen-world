# Website animations that leave room to read

Status: **Deployed October 4, 2026; public assets and all 13 shared banner layouts verified. Blogger publication pending.**

- Title: Website animations that leave room to read
- Labels: Indigen World, Website, Accessibility, Dictionary, Contributions
- Search description: Website illustrations now have their own space, keeping page text, contribution buttons and dictionary search clear on desktop and mobile.
- Custom permalink: clear-website-headers
- Article: `post.html`
- Sharing copy: `share.md`
- Images: `images/contribute-desktop.png`, `images/dictionary-mobile.png`, `images/ecosystem-desktop.png`

## Implementation and availability

- Shared banner illustrations use reserved layout space instead of floating over page content. On screens at least 1000 CSS pixels wide, ordinary page headers and the dictionary place artwork alongside the entire content column. Below that width, artwork follows the content. The recovery page keeps its helpful links together above the illustration at all widths.
- Covers About, Ecosystem, Dictionary, Contribute, Impact & Governance, Get involved, Contact, Terms, shared post/community pages, payment return, tester recognition and page-not-found recovery. The separate Project Kassena module illustration retains the earlier October 4 fix.
- Dictionary search stays in the content column and precedes the illustration on smaller screens. Contribution actions and campaign facts share the reserved content column.
- Existing pause/resume, saved motion preference, reduced-motion stills and failed-download stills remain supported. Illustrations are decorative and do not report review approval, payment success or measured progress.
- This changes website layout. It does not change dictionary data, contributor permissions, payment processing or mobile app availability.

## Verification

- Actual Chromium screenshots of the production preview were captured October 4, 2026 at 1440 pixels (Contribute and Ecosystem) and 390 pixels (Dictionary).
- `npm run check:website` passes TypeScript, public route checks, progress invariants and production build generation.
- The motion browser suite passed all 26 routes at 1440 and 360 pixels, then all 13 shared banner layouts at 320, 999, 1000 and 1920 pixels. It compares the complete content container against the artwork bounds and checks reachable links and form controls. All 13 banners also pass with reduced motion at 1440 pixels. Playback, pause/navigation/reload persistence, offscreen/tab handling and failed-download still fallback pass. Final deployment evidence will be recorded below.
- Blogger feed requests are blocked in local motion checks. Authenticated contributor workflows and live payment processing are outside these layout checks.

## Image credits and Blogger publishing steps

Credit: Indigen World, actual local production-preview screenshots, October 4, 2026. The abstract animation and existing background artwork are decorative illustrations, not documentary photographs. No private account data appears in these images.

1. Confirm the production deployment evidence below before publishing.
2. Chinedum creates a Blogger draft with the title, labels, search description and permalink above, then pastes `post.html` in HTML mode.
3. Upload all three PNG assets to Blogger. Replace each local `images/...` source in `post.html` with the uploaded image URL. Keep the alt text and captions. Make desktop images responsive and keep the mobile screenshot readable, up to its native 390-pixel width.
4. Review, publish and share when ready. Replace the clearly marked published article URL placeholder in `share.md` after publication.

Preparing this repository post does not publish it or send community messages.

## Production deployment evidence

- `npm run deploy:website -- --non-interactive` completed October 4, 2026 for Firebase Hosting site `indigen-world` in `project-kassena-7e026`, from commit `2bdf99950311b72065084e1e039b40739bfa1c5f`. The guarded deployment verified the clean release checkout matched `origin/main` and reran the website checks and production build before upload.
- The served entry script, main stylesheet, PageMotion module, About module, Contribute module and Dictionary module match the release build byte for byte on `https://indigenworld.com`.
- All 13 shared banner routes were checked on the public domain at 1440 and 360 pixels. Every complete content container is separate from its artwork; no horizontal overflow occurs, and visible enabled links and form controls are reachable.
- A fresh 390-pixel reduced-motion dictionary visit keeps the illustration separate, has no playback button, accepts a search term and clears it through the header search control.
- Only website Hosting was released. Backend functions, database rules and mobile releases were not changed. The Blogger article and community sharing remain with Chinedum.
