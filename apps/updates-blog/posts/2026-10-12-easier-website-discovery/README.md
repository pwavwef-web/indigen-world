# An easier way to discover, learn and contribute

- **Prepared:** October 12, 2026
- **Title:** An easier way to discover, learn and contribute on Indigen World
- **Labels:** Website, Design, Kasem, Dictionary, Learning, Accessibility
- **Search description:** Homepage search, public language previews, simpler navigation and shorter task pages make Indigen World's website easier to use on phones and desktop.
- **Suggested permalink:** `easier-discovery-indigen-world-website`
- **Status:** Website deployed and verified October 13, 2026, at [indigenworld.com](https://indigenworld.com/). Blogger publication pending.
- **Deployed source:** GitHub `main`, commit [1d8a1ea1](https://github.com/pwavwef-web/indigen-world/commit/1d8a1ea10ca9a0bde7d5781e0814eff0b4c7ae1e).

## What changed

- Three primary task links and an Our Story group containing existing project,
  progress, governance, about and ecosystem destinations; keyboard dismissal,
  focus restoration and mobile grouping.
- Homepage search preserves Unicode text and opens filtered dictionary results.
- Bounded homepage queries feature explicitly reviewed public dictionary words
  and published expressions, retaining attribution and optional user-started
  audio. Empty, failed and missing-recording states remain honest.
- Homepage sections now serve discovery, project context, contribution and
  progress. Story cards use normal flow. Language results and facts are no
  longer given entrance animations.
- Warm cream, indigo, terracotta and gold, simpler navigation/buttons and less
  decorative elevation.
- Compact photographic openings on Dictionary, Learn and Contribute; visible
  image attribution and shared motion controls. Contribution facts appear
  beneath the opening, with sign-in/time/volunteer information before the CTA.
- Mobile dictionary search stays below the header, filters expand on demand,
  and the mobile entry dialog isolates the toolbar while preserving saved-word
  storage and returning focus.
- Project Kassena's module links use a spaced action group, with no entrance
  effect on the interactive module card.

## Verification and availability

- `npm run check:website`: TypeScript, route/privacy validations, progress
  validations, all 21 tests and production build.
- `node apps/website/scripts/check-website-refresh.mjs --screenshots`: real
  Edge browser checks at 1440, 768, 390 and 320 pixels across 12 public routes;
  keyboard navigation, Unicode search, compact-banner bounds, filter expansion,
  sticky search, real public dictionary selection/saving, dialog background
  isolation and focus restoration; short-screen reduced motion.
- Anonymous read-only queries confirmed that the existing published/review-label
  query works against production Firestore. No backend or index change required.
- `npm run test:motion --workspace @indigen-world/website` passed across 27
  routes at 1440/360px and 26 banners at 320/999/1000/1920px, including reachable
  controls, attribution layout, navigation/reload pause persistence, off-screen
  and hidden-tab suspension, runtime reduced-motion switching and failed-image
  fallback. Banner bounds are measured together while asynchronous content loads.
- Language and expression preview contents depend on public records. Missing
  recordings and source details remain visible. Saved words are browser-local.
- `npm run deploy:website` completed successfully for project
  `project-kassena-7e026`, Hosting site `indigen-world`. The production guard
  confirmed a clean checkout at `origin/main`; required predeploy checks passed.
- Live Edge verification at `https://indigenworld.com/`: the warm theme and
  grouped header, homepage search with Unicode characters, reviewed word and
  user-started audio preview, direct word and expression links, phone filter
  expansion and sticky search, compact task pages, and mobile story navigation
  passed with no browser runtime errors. An actual live screenshot is saved.

## Images and credits

Actual local production-build screenshots, captured October 13, 2026:
`images/home-desktop.png`, `images/language-previews.png`,
`images/dictionary-mobile.png`, `images/learn-mobile.png`.
Verified live homepage screenshot, October 13, 2026: `images/home-live.png`.
They show public UI and public records; the saved-word state belongs to a
temporary review browser. No private accounts or fabricated language fixtures
are included.

Banner photograph in the screenshots: [Kassena architecture in Tiébélé](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg)
by Alexander Leisser, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
resized and cropped for display. Preserve credit and licence when sharing.
Screenshots containing the photographic derivative retain that licence.

The live banner also retains the existing credited photographs by Vrinda
Khushu, Kwameghana (Bright Kwame Ayisi), and Hasslaebetch. Full image provenance:
`apps/website/public/images/culture/README.md`. Map geometry is from Natural
Earth (public domain); story-card imagery is existing generated editorial
illustration. Photographs are not presented as Indigen World events or
endorsements by pictured people. Public record attribution stays with each card.

## Blogger handoff

1. Check the final website deployment status above before announcing availability.
2. Create a Blogger draft with this title, labels and search description.
3. Paste `post.html` in HTML mode.
4. Upload the four article assets: `home-live.png`, `language-previews.png`,
   `dictionary-mobile.png` and `learn-mobile.png`. Replace each `images/...` path with the matching
   Blogger-hosted URL. Retain alt text, captions and photographic attribution.
5. Review the article on desktop and a phone. Chinedum can then publish it.
6. Replace the clearly marked article URL placeholder in `share.md` after
   publication. Repository preparation and website deployment do not publish
   the article or send messages.
