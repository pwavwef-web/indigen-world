# Scroll cards across the public website

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/blog-post_252.html

- **Prepared:** October 12, 2026
- **Title:** A little motion, wherever you explore Indigen World
- **Labels:** Website, Design, Accessibility, Learning, Kasem
- **Search description:** Rising cards, readable mobile layouts and shared motion controls now connect the public Indigen World pages and Kasem reference guides.
- **Suggested permalink:** `scroll-cards-across-indigen-world`
- **Status:** Public website deployed and verified October 12, 2026, at [indigenworld.com](https://indigenworld.com/). Blogger publication pending.
- **Deployed source:** GitHub `main`, commit [9103e48b](https://github.com/pwavwef-web/indigen-world/commit/9103e48be80cc812efad5f814260a04aa3ceb91d).

## Change and scope

A shared controller provides rising/scaling card entrances across public
Indigen World routes, including asynchronously loaded dictionary and expression
cards. Editorial sequences can stack on desktop. Phones, short screens,
oversized cards, paused motion and reduced motion use readable normal flow.
Terms content is grouped into reading cards without changing its wording.
The progress-page pause also respects the shared site preference. Existing
timed/full-screen experiences retain their own presentation.

The standalone spelling and grammar guides use the same controller, styles
and local pause preference. Their generators preserve the additions only for
the public website. Unversioned guide/motion assets revalidate after releases.
TribeStudio, Admin, the standalone dictionary app and the mobile app are outside
this update, as selected by the user.

## Verification

- `npm run deploy:website` completed successfully for project
  `project-kassena-7e026`, Hosting site `indigen-world`, from a clean checkout
  verified against `origin/main`. Required predeploy validations passed.
- Live verification: About cards revealed and used sticky positioning on a
  1440 × 1000 viewport without horizontal overflow; Learn cards and the spelling
  guide controller loaded correctly. Shared browser assets and the guide
  returned HTTP 200 with `Cache-Control: no-cache`.
- Website TypeScript, route/privacy validations, 21 tests and production build
  passed. Shared browser script and guide-generator syntax checks passed.
- Desktop card coverage checked on About, Ecosystem, Learn, Project Kassena,
  Governance, Get Involved, Contact, Privacy, Terms, Contribute, dictionary,
  community/post fallback pages, Labs experiments, checkout, tester claim and
  404 destinations. Newly loaded dictionary cards were observed.
- About cards were hidden only while below the viewport, then revealed and
  stacked after scrolling. Editorial routes had no horizontal overflow.
- Nine editorial routes at 390px used normal-flow stacks with no horizontal
  overflow; Terms also passed at 320px.
- Get Involved radio selection still moved focus to the matching form field.
  Pausing made every observed card visible and removed sticky positioning.
- Progress's pause button also set the shared pause state and stopped its
  animated presentation. Labs landing cards were observed after asynchronous
  loading.
- Both reference guides loaded the shared controller without horizontal
  overflow on mobile. A pause choice on the spelling guide persisted on the
  grammar guide, with all cards visible.
- Live OS reduced-motion switching and signed-in workflows were not exercised.
  Reduced-motion handling is implemented in the shared controller and CSS.

## Images and credits

On October 29, 2026 the raw screenshots below moved to `screens/`. `images/` now holds the designed cover and framed figures rendered from `art.json` with `render-post-art.mjs`; the published article uses those.

Actual local screenshots, October 12, 2026:

- `images/about-desktop.png`: the active About card stack.
- `images/about-live.png`: verified production About cards; used in the article.
- `images/learn-mobile.png`: normal-flow learning cards on a phone.
- `images/guide-mobile.png`: the public grammar guide with motion paused.

Screenshots show public UI and empty forms, with no private account information.
Indigen World branding, CSS patterns and existing generated editorial artwork
belong to the website presentation. The guide retains attribution to P. L.
Hewer, GILLBT, *A Basic Grammar of Kasem*, first printed 1983, supplied 2014
printing; no new licence or model-training permission is asserted.

## Blogger handoff

1. Confirm the final website deployment status recorded above.
2. Create a draft with the title, labels and search description above.
3. Paste `post.html` in Blogger HTML mode.
4. Upload `about-live.png`, `learn-mobile.png` and `guide-mobile.png`. Replace their `images/...` paths with
   Blogger URLs, retaining descriptive alt text and captions.
5. Review desktop/mobile layout, then Chinedum can publish the article.
6. Replace the marked article URL in `share.md` before sharing. Repository
   preparation and website deployment do not publish this article.
