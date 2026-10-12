# Scroll cards across the public website

- **Prepared:** October 12, 2026
- **Title:** A little motion, wherever you explore Indigen World
- **Labels:** Website, Design, Accessibility, Learning, Kasem
- **Search description:** Rising cards, readable mobile layouts and shared motion controls now connect the public Indigen World pages and Kasem reference guides.
- **Suggested permalink:** `scroll-cards-across-indigen-world`
- **Status:** Implemented and verified locally. Wider website deployment and Blogger publication pending; the earlier homepage release is already live.

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
- Both reference guides loaded the shared controller without horizontal
  overflow on mobile. A pause choice on the spelling guide persisted on the
  grammar guide, with all cards visible.
- Live OS reduced-motion switching and signed-in workflows were not exercised.
  Reduced-motion handling is implemented in the shared controller and CSS.

## Images and credits

Actual local screenshots, October 12, 2026:

- `images/about-desktop.png`: the active About card stack.
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
4. Upload the three actual screenshots. Replace their `images/...` paths with
   Blogger URLs, retaining descriptive alt text and captions.
5. Review desktop/mobile layout, then Chinedum can publish the article.
6. Replace the marked article URL in `share.md` before sharing. Repository
   preparation and website deployment do not publish this article.
