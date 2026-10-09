# Reliable contributions, clearer sources and offline listening

Status: **Prepared 2026-10-09. Web clients and compatible backend deployed and verified on Firebase. Mobile0.1.31+40 AAB is being prepared; no Play upload, Blogger publication or external sharing. Runtime limitations remain in the engineering handoff.**

| Field | Value |
| --- | --- |
| Title | Reliable contributions, clearer sources and offline listening |
| Labels | Contributors, TribeStudio, Kasem, Dictionary, Mobile, Accessibility |
| Search description | Account draft recovery, clearer reviewer evidence and source browsing, direct Downloads playback and a discoverable low-data preference. |
| Custom permalink | reliable-contributions-sources-offline-listening |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Cover | `images/draft-recovery-desktop.png` (verified product screenshot) |

## Evidence and images

The article embeds real saved assets, not image placeholders. Additional phone,
tablet and desktop captures are in `images/`. Web captures use the existing product
components and synthetic previews, with external network requests blocked. Reviewer
captures use isolated Auth/Firestore emulators and synthetic accounts. No private
corpus, raw user data or credentials are included. The mobile widget screenshot
was recaptured with the existing app palette and SDK Roboto as a test-only font
fallback, then inspected for readable title, actions and synthetic track details.
Do not publish claims of physical-device audio or handset font verification.

| Embedded image | Credit and context |
| --- | --- |
| draft-recovery-desktop.png | Indigen World product screenshot; synthetic test text; refresh/Continue draft verified |
| review-desktop.png | Indigen World product screenshot; isolated emulator queue and synthetic sources |
| contributions-tablet.png | Indigen World product screenshot; existing synthetic contribution preview |
| reference-desktop.png | Indigen World product screenshot; source illustration: A Basic Grammar of Kasem, P. L. Hewer, GILLBT; already public in the existing guide |
| mobile-downloads-test.png | Indigen World Downloads widget; synthetic track and entitlement overrides; existing app palette with SDK Roboto test fallback; no device/audio claim |

Other files show the same journeys at 390px, 768px and 1440px widths. They are
review evidence; choose the clearest images for Blogger without changing captions.
The source illustration retains the existing publication/attribution context;
this branch does not grant additional rights to redistribute book contents.

## Blogger handoff

1. Confirm deployment and staging verification using `docs/operations/ten-improvements-verification.md` and the candidate rollout note. Keep the availability paragraph until a live release is confirmed.
2. Create a Blogger draft with the title, labels, permalink and description above.
3. Upload the five embedded assets from this folder through Insert image → Upload from computer. Use the recovery screenshot as the first image. Keep the mobile caption's test-font and physical-device limitations.
4. Paste `post.html` in HTML view. Replace each relative `images/...` source with that asset's Blogger-hosted URL. Keep descriptive alt text, captions and source credits.
5. Preview on phone and desktop. Ensure images fit, links open the current product destinations, and captions still identify synthetic fixtures and the mobile device limitation.
6. Only after the release is available, revise the availability paragraph using confirmed evidence, publish, and replace the article URL placeholder in `share.md`. Chinedum performs this publishing/sharing handoff; no external action was taken here.

## Release prerequisites

Deploy compatible functions before new submission clients. The private candidate
index requires triggers, a reviewed dry run/backfill, readiness and the environment
flag in the documented order. The triggers are deployed, but no production
backfill/readiness change was performed and the candidate reader remains disabled.
Firebase authority, permissions, counting rules, launch targets and paid offline
limits remain unchanged. GitHub Actions billing prevents normal CI execution;
local results and unverified runtime boundaries are recorded in the handoff.
