# Cultural photo openings across the public website

- **Prepared:** October 12, 2026
- **Title:** A shared cultural welcome, wherever you begin
- **Labels:** Website, Design, Culture, Accessibility, Kasem
- **Search description:** Indigen World's rotating cultural photo banner now welcomes visitors across public pages, learning guides and Labs, with shared motion controls.
- **Suggested permalink:** `cultural-banners-across-indigen-world`
- **Status:** Pushed to GitHub and deployed to Firebase on October 12, 2026. Verified live at [indigenworld.com](https://indigenworld.com/). Blogger publication pending.
- **Deployed source:** GitHub main, [4178d7d3](https://github.com/pwavwef-web/indigen-world/commit/4178d7d3f4805529c14f75a7f2830d1f4a6c236a).

## Change and availability

The homepage's four credited photographs, gentle zoom and eight-second rotation
now appear behind the opening text on public website pages. Each page retains
its own heading, links, search or primary action. Public Labs pages, the progress
page, shared-link destinations, the missing-page screen and standalone spelling
and grammar guides use the same presentation. Beyond the Reef uses the banner
on its opening screen, then removes it when the visitor starts the film.

Page banners adapt their height to the text and screen. Visitors can select a
photograph with the arrows or dots; manual selection pauses animation. Pause
preferences persist across pages and guides and also control scroll effects.
Photograph rotation stops while hovered, focused, outside the viewport or in a
hidden tab. System reduced motion keeps the images still. A background and all
page text remain available if photographs cannot load.

The rollout is scoped to the public website. Admin workspaces, TribeStudio,
the standalone dictionary app, mobile apps and the separately hosted Blogger
theme are outside this release. Page content, source permissions, payment
handling and account access rules are unchanged.

## Verification

- `npm run deploy:website` completed from a clean checkout matching origin/main,
  for project `project-kassena-7e026`, Hosting site `indigen-world`.
- Live About and Labs banners loaded correctly; Labs headings remained white.
  Learn had no horizontal overflow at 390px. The grammar guide loaded all four
  photos, and its controls respected the saved pause preference.
- The live JavaScript bundle was `index-OIXT8cXt.js`. The shared banner assets
  and grammar guide returned HTTP 200 with `Cache-Control: no-cache`.

- Website TypeScript, route/privacy checks, progress invariants, all 21 tests
  and the production build passed.
- Browser checks found one photo banner on each tested public React route,
  both guides and the film opening. Desktop and 390px layouts checked for
  horizontal overflow and overlap between page copy and photograph controls.
- Shared pause persisted between the standalone guides. Photograph selection
  changed the caption and credit. The film's Begin button started playback;
  pause still worked and the opening banner unmounted after the transition.
- The dictionary search returned 13 published entries for "water"; grammar
  guide filtering returned four source records for "house". Guide automatic
  rotation advanced while unfocused, with the matching photo credit.
- Source generators and standalone browser scripts passed syntax checks.
- OS reduced-motion switching and signed-in Labs workflows were not exercised.
  The optional `test:motion` browser script was updated but not run; interactive
  browser verification was performed through the app's browser tools.

## Images and credits

Actual product screenshots taken October 12, 2026:

- `images/about-live.png`: verified production About banner; used in the article.
- `images/about-desktop.png`: About page with the basket-weaving photograph.
- `images/learn-mobile.png`: Learn page on a phone with the Tiébélé photograph.
- `images/guide-desktop.png`: the public grammar guide's new opening.

Screenshots contain public UI and no private account data. Photographs remain
under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), resized
and cropped for display:

- Alexander Leisser, [Tiébélé village](https://commons.wikimedia.org/wiki/File:Tiebele_village_in_Burkina_Faso_04.jpg).
- Vrinda Khushu, [Basket Weavers](https://commons.wikimedia.org/wiki/File:Basket_Weavers.jpg), Bolgatanga, Ghana.
- Kwameghana (Bright Kwame Ayisi), [Kente weaver](https://commons.wikimedia.org/wiki/File:A_kente_weaver_busily_creating_a_design_in_a_loom.jpg).
- Hasslaebetch, [Baskets made in Northern Ghana](https://commons.wikimedia.org/wiki/File:Baskets_made_in_Northern_Ghana.jpg).

Full asset provenance is retained in `apps/website/public/images/culture/README.md`.
The grammar guide retains attribution to P. L. Hewer, GILLBT, *A Basic Grammar
of Kasem*, first printed 1983, supplied 2014 printing. No new licence for the
book content is asserted. The cultural photographs illustrate the website;
they do not imply the photographers or pictured people endorse the project.

## Blogger handoff

1. Check the final deployment status above before describing the release as live.
2. Create a draft using the title, labels and search description above.
3. Paste `post.html` into Blogger's HTML editor.
4. Upload `about-live.png`, `learn-mobile.png` and `guide-desktop.png` and replace their `images/...` paths with
   Blogger-hosted image URLs. Keep alt text, captions and photo credit links.
5. Preview phone and desktop layouts. Chinedum can then publish the article.
6. Replace the marked URL in `share.md` before sharing. Preparing these files
   and deploying the website does not publish or send the article.
