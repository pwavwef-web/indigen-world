# Culture in motion: a new way into Indigen World

- **Prepared:** October 12, 2026
- **Title:** Culture in motion: a new way into Indigen World
- **Labels:** Website, Design, Project Kassena, Kasem, Community
- **Search description:** A photographic opening, a map of our Kasem starting point and scrolling cards make it easier to discover, contribute and follow Indigen World.
- **Suggested permalink:** `culture-in-motion-indigen-world`
- **Status:** Implemented locally. Website deployment and Blogger publication have not been performed.

## What changed

The homepage now includes all three user-selected treatments: a full-width
photographic loop, a Ghana-focused Africa map with three rotating story cards,
and three illustrated cards that reveal and stack on larger screens. Mobile
and short-screen cards remain in normal flow. Headline and primary actions
remain stable. Site-wide pause and reduced-motion preferences are retained.

ELP's opening uses a looping video. This implementation recreates its
immersive opening with optimised photographs, a gentle zoom and crossfades,
without copying ELP's footage or artwork. It is not a frame-for-frame replica.

## Verification

- `npm run check:website`: TypeScript, route/privacy validations, 21 tests,
  production build and metadata generation passed for the combined homepage.
- Browser checks: all four photographs loaded; automatic banner cycling,
  keyboard/manual selection, shared pause persistence and off-screen suspension
  worked. Map controls changed the story and its destination correctly.
- Responsive checks at 1440px, 390px and 320px found no horizontal overflow or
  clipped feature controls. Desktop cards use sticky positioning; mobile and
  short-screen cards stay in normal flow. Product screenshots are captured with
  motion paused so the content can be reviewed clearly.
- Reduced-motion handling is implemented through the existing site preference;
  a live operating-system preference change was not emulated in this session.
  The standalone `test:motion` script was updated but not run.
- The independent Blogger feed returned callback errors during local checks;
  its existing fallback link remained available. This is separate from the
  new homepage features.
- No backend, authentication or data model changes.

## Images and credits

Actual local product screenshots: `images/home-desktop.png`,
`images/home-map.png`, `images/home-scroll.png` (October 12, 2026).
These show public UI and contain no private account information.

Banner photographs, all **CC BY-SA 4.0**, resized and cropped for display:

- [Kassena architecture in Tiébélé](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg) — Alexander Leisser.
- [Basket Weavers](https://commons.wikimedia.org/wiki/File:Basket_Weavers.jpg) — Vrinda Khushu.
- [A kente weaver busily creating a design in a loom](https://commons.wikimedia.org/wiki/File:A_kente_weaver_busily_creating_a_design_in_a_loom.jpg) — Kwameghana (Bright Kwame Ayisi).
- [Baskets made in Northern Ghana](https://commons.wikimedia.org/wiki/File:Baskets_made_in_Northern_Ghana.jpg) — Hasslaebetch.

License: https://creativecommons.org/licenses/by-sa/4.0/. Preserve the visible
photographer credits and licence links. Photographic derivatives retain this
license. Detailed asset provenance is in
`apps/website/public/images/culture/README.md`.

Map geometry: Natural Earth, public domain. Story and scrolling-card artwork:
existing Indigen World generated editorial illustrations, not documentary
photographs. No ELP media is included.

## Blogger publishing steps

1. Verify the public website release before changing the availability language.
2. Create a Blogger draft using the title, labels and search description above.
3. Paste `post.html` in HTML mode.
4. Upload all three actual screenshot files. Replace local `images/...` paths
   with Blogger's uploaded URLs; retain alt text and captions. Preserve photo
   attribution and the CC BY-SA 4.0 source/license links when sharing screenshots.
5. Review the article on desktop and mobile, then Chinedum can publish it.
6. Replace the marked URL placeholder in `share.md` after publication. Preparing
   this folder does not publish the article or send any messages.
