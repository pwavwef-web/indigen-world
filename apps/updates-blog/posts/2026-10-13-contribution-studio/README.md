# Thoughtful steps, useful contributions: the new contributor studio

- **Prepared:** 13 October 2026.
- **Labels:** TribeStudio, Contributors, Kasem, Language data, Product updates.
- **Search description:** A guided contributor studio brings short sections, useful context, small sessions and recognition for reviewer-approved Kasem work.
- **Implementation:** Complete in the repository. Local verification listed below.
- **Deployment:** Deployed 13 October 2026 to TribeStudio and all seven matching Functions. Live files, blue sign-in accents, authentication gates and desktop/phone entry screens verified. Signed-in production collection and review remain unverified.
- **Blogger:** Unpublished. Publication and external sharing remain Chinedum’s handoff.

## Publishing steps

1. Review the release evidence and remaining signed-in checks below. Keep the
   availability paragraph and sample-image captions accurate when publishing.
2. Create a Blogger draft using the title and labels above. Copy `post.html` in
   HTML mode.
3. Upload `images/cover.png`, `images/studio-home-desktop.jpg`,
   `images/studio-context-desktop.jpg`, `images/studio-context-phone.jpg` and
   `images/studio-check-phone.jpg`. Replace each matching relative `src` with its
   actual Blogger image URL. Keep the descriptive alt text and captions.
4. Inspect the article on desktop and phone, including image clarity, status and
   invite-only availability. Preview before publishing.
5. After publication, replace the URL placeholder in `share.md` and add the
   published link to the posts index. Publication and external sharing remain
   Chinedum’s handoff.

## Images and credits

`screens/` contains unaltered screenshots of the actual local portal, captured
by `apps/tribestudio/scripts/collection-browser.test.mjs`. All accounts, activity,
totals and contributions are clearly labelled synthetic preview fixtures. They
are not evidence of live production use or linguistic accuracy.

`images/` contains the cover and branded device/browser framing made by the
local `render-post-art.mjs` renderer from the blue `art.json` specification. The framing is an
illustration; screenshot content is actual product UI. Indigen World branding,
UI and illustration: Indigen World. No external stock image or credit is used.

Use `art.json` and the raw `screens/` as the design source when regenerating
the framed images. Finished upload-ready assets are supplied in `images/`.

## Verification

- TribeStudio typecheck, workflow suite and production build.
- Contributor backend tests, including metadata bounds, old-client preservation,
  immutable retries, label alignment and successful-revision participation.
- Real Firestore transactions: simultaneous preference/submission updates,
  active-account isolation, private-public filtering and admin goal permissions.
- Contributor Firestore rules: owner reads, denied client writes and revoked
  access.
- Browser checks at 1440, 768, 390 and 360 pixels: real preview UI, practice,
  section navigation, structured autosave, review/cancel/confirm, advancing work,
  dark theme and disabled decorative motion. No horizontal overflow.
- The portal inherits the existing blue brand tokens; the browser check verifies
  that its primary and workspace accents match the shared blue palette.

Detailed implementation and rollout:
[`docs/product/contribution-studio.md`](../../../../docs/product/contribution-studio.md).

## Production release evidence

- Functions source: `c4bed522`; final blue frontend source: `2fb5c2d`.
- Hosting released: 2026-10-13T22:41:49.298Z. Version: `54d849f4af318e83`.
- Live verification: 2026-10-13T22:42:33.898Z. All seven Functions are ACTIVE on
  Node.js 22 and return the expected JSON UNAUTHENTICATED response to anonymous
  calls. No production contribution was created during verification.
- Live HTML, main JavaScript/CSS and contributor JavaScript/CSS match the
  production build by SHA-256. The contributor workspace uses the shared blue.
- Production sign-in checked at 1440 and 390 pixels in light and dark modes:
  blue workspace accents, email/password controls, no horizontal overflow and
  no page errors. Captures use reduced motion so entrance animations have settled.
- Clean release checkout: 62 backend tests and 79 portal tests passed;
  TribeStudio typecheck and production build passed. The earlier four-width
  local browser and 11-test Firestore emulator checks also passed.
- Existing submissions authUid/lifecycle.updatedAt descending index
  `CICAgLjy8IAK` is READY; existing contributor access rules are live.
- Deployment used the unchanged TribeStudio Hosting configuration and its
  production guard/build/check hooks, scoped to that site.

Remaining production smoke check: use authorised contributor and reviewer
accounts to verify cross-device metadata/preferences, a revision and a reviewer
approval. No signed-in production journey has been exercised by this release.
The article has not been published and no sharing message has been sent.
