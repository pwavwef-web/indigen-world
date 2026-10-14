# Living culture. New possibilities: Indigen World Labs, redesigned

- **Prepared:** 13 October 2026.
- **Topic:** Redesign of Indigen World Labs (`/labs`, `/labs/experiments` and the experiment pages): photo-led hero, live experiment previews, consistent sign-in and access states, Play/Learn/Create/Contribute discovery.
- **Labels:** Labs, Feature, Design, Kasem, Community.
- **Search description:** Indigen World Labs gets a photo-led home, live previews of Word Trail and Culture Quest, clear sign-in and access states, and Play, Learn, Create and Contribute filters.
- **Implementation:** Complete in the repository, uncommitted at preparation time. Local verification listed below.
- **Deployment:** **Not deployed.** The live Labs site is unchanged. A website Hosting deploy (and, optionally, a `labsApi` Functions deploy for the new registry fields) is required; the website falls back to its bundled registry, so Hosting alone is sufficient.
- **Blogger:** Unpublished. Publication and external sharing remain Chinedum’s handoff.

## Publishing steps

1. Publish only after the website is deployed and `/labs` is checked live.
   Then change the opening **Release status** paragraph and the closing line of
   `post.html` from "not live yet" to the actual release date.
2. Create a Blogger draft with the title and labels above. Paste `post.html` in
   HTML view.
3. Upload `images/cover.png`, `images/labs-home-desktop.jpg`,
   `images/labs-featured-desktop.jpg`, `images/labs-experiments-desktop.jpg` and
   `images/labs-home-phone.jpg`. Replace each relative `src` with its Blogger
   image URL. Keep the alt text and captions, including the photo credit in the
   first figure caption.
4. Preview on desktop and phone, then publish.
5. Put the published URL in `share.md` and add it to the posts index.

## Images and credits

`screens/` holds unaltered screenshots of the actual new Labs pages, taken
13 October 2026 with headless Chrome from the local website running against the
Auth/Firestore emulators and the real compiled `labsApi` (callable bridge), with
reduced motion so entrance animations had settled. The local-only
"Local development demo" notice, which never appears in production, was removed
from the page before capture. No account names or private data appear.

`images/` holds the cover and framed figures made by
`apps/updates-blog/scripts/render-post-art.mjs` from `art.json` (blue, chevrons).
The device frames, background and titles are illustration; the screen content is
actual product UI.

Photographs visible inside the screenshots (credited on the page and in the
captions; full manifest in
`apps/website/src/features/labs/media/README.md`):

- Dancers in Kassena country, Tiébélé — Zaongo Christian Marie Michel, CC BY-SA 4.0, [Commons](https://commons.wikimedia.org/wiki/File:Ti%C3%A9b%C3%A9l%C3%A9.jpg).
- Tiébélé painted compound walls — Alexander Leisser, CC BY-SA 4.0, [Commons](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg).
- Traditional house decoration, Tiébélé — c.hug, CC BY-SA 2.0, [Commons](https://commons.wikimedia.org/wiki/File:Tiebele_traditional_house_decoration_Burkina_Faso.jpg).
- Art+Feminism edit-a-thon, UDS Navrongo — Amuzujoe, CC BY-SA 4.0 ([Uds14](https://commons.wikimedia.org/wiki/File:Navrongo_Uds14.jpg), [Uds6](https://commons.wikimedia.org/wiki/File:Navrongo_Uds6.jpg)).
- Wiki Loves Earth photowalk, Paga — Knowledge and philosophy, CC0, [Commons](https://commons.wikimedia.org/wiki/File:Wiki_Loves_Earth_2025_Ghana_team_at_Paga_crocodile_pond.jpg).
- Navrongo basilica — Mwintirew, CC BY-SA 4.0, [Commons](https://commons.wikimedia.org/wiki/File:Basilica_of_Our_Lady_of_Seven_Sorrows.jpg).

Indigen World branding, UI and post framing: Indigen World.

## What changed (implementation)

- `apps/website/src/features/labs/`: new `shell.tsx` (compact sticky header,
  mobile menu, single account control, footer credits), `HeroCarousel.tsx` +
  `carousel.ts`, `cards.tsx` (cards, featured row, filters), `previews.tsx`
  (Word Trail preview drawn with the game's own `drawTrail`/engine),
  `home.tsx` (purpose, continue exploring, lab notes, feedback band),
  `access.ts` (one access/presentation source), `labs-media.ts` + `media/`,
  rewritten `labs.css`; `LabsPage.tsx` rewired.
- `packages/contracts/labs.mjs`/`labs.d.ts`: optional `summary` and `modes`.
- `apps/website/src/content/navigation.ts`: `labs/culture-quest` and
  `labs/word-trail` are now immersive routes, so the site header no longer
  stacks above the Labs header on those pages.
- Website depends on the already-installed OFL font `@fontsource-variable/sora`.

## Verification (local)

- `npm run check` in `apps/website`: typecheck, site validation, unit tests
  (including the new `labsDiscovery.test.mjs`: carousel pause/resume rules,
  swipe intent, sign-in/invite/pause/retired access states, legacy-server
  fallback) and production build.
- `scripts/check-motion.mjs` against the production build: all 27 routes at
  1440 and 360 px, no horizontal overflow and no page errors. Labs requests
  were blocked in that check so it cannot touch production counters.
- Headless Chrome against the emulators at 1440×900, 1366×768, 768×1024 and
  390×844: hero arrows, named indicators, pause/play, keyboard arrows, touch
  swipe (vertical drags ignored), image-failure fallback, reduced motion,
  filters + URL + empty state, mobile menu focus and Escape, signed-out sign-in
  gates, signed-in "Play" states, invite-only state for a signed-in member,
  admin-only navigation, real Continue exploring and lab-note rendering, and
  Word Trail still launching. Hero text contrast on its panel is above 8:1.

Not verified: real Google sign-in, production data, Safari/iOS, and live
deployment.
