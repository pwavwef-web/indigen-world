# Thoughtful steps, useful contributions: the new contributor studio

- **Prepared:** 13 October 2026.
- **Labels:** TribeStudio, Contributors, Kasem, Language data, Product updates.
- **Search description:** A guided contributor studio brings short sections, useful context, small sessions and recognition for reviewer-approved Kasem work.
- **Implementation:** Complete in the repository. Local verification listed below.
- **Deployment:** Pending. No signed-in production check has been performed.
- **Blogger:** Unpublished. Publish and share after release availability is verified.

## Publishing steps

1. Confirm the Functions and TribeStudio release and update the status paragraph
   in `post.html` to state the actual availability. Do not describe preparation
   as a live release.
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
existing `render-post-art.mjs` renderer from `art.json`. The framing is an
illustration; screenshot content is actual product UI. Indigen World branding,
UI and illustration: Indigen World. No external stock image or credit is used.

Regenerate this post’s art only:

```powershell
node apps/updates-blog/scripts/render-post-art.mjs 2026-10-13-contribution-studio
```

## Verification and release needs

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
Deploy the seven changed/new Functions named there and TribeStudio hosting
together, then perform the authorised cross-device and review smoke check.
Neither this article nor the repository preparation deploys or publishes anything.
