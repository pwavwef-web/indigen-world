# Help Fill the Jars, with more room to see our progress

Status: **Deployed to the public website and verified on 2026-10-04. Product screenshots and deployment evidence included. Blogger article unpublished; no community messages sent. Publication and sharing handoff remain with Chinedum.**

| Field | Value |
|---|---|
| Title | Help Fill the Jars, with more room to see our progress |
| Labels | Public website, Progress, Community, Contributions, Design |
| Search description | Explore a full-screen progress page with colourful liquid, growing bubbles, and popup controls that keep the community's contributions in view. |
| Custom permalink | immersive-community-progress |
| Article | post.html |
| Sharing copy | share.md |

## Images and credits

Credit: Indigen World. Use verified product screenshots from this implementation, with no private contributor information visible.

- `images/progress-fullscreen-desktop.png`: Desktop progress page showing the compact controls and vessels, with the website header and footer hidden on this route.
- `images/progress-popup-mobile.png`: Phone-width progress page with a popup open, showing its labelled choices and close control.
- `images/progress-live-traditional-pots.jpg`: Verified live phone layout at 390 × 844, showing the traditional-pot view and production word count of 357. Captured from `https://indigenworld.com/progress` on 2026-10-04 after deployment, with motion paused.

The two PNG assets are actual product screenshots captured during local browser verification on 2026-10-04; the new JPG shows the verified live release. If sample targets are used to demonstrate the colour range, keep the sample notice visible and label the screenshot and caption as a sample preview.

Blogger: Insert image → Upload from computer for all three assets. Replace the relative image `src` values in `post.html` with the uploaded Blogger URLs. Preserve descriptive alt text and captions, then preview desktop and phone widths.

## Implementation and release evidence

The requested scope is a full-screen progress route, popup controls replacing dropdowns, long explanations accessible through buttons, and liquid colour/bubble animation tied to each category's fill percentage.

Implementation reviewed in `apps/website/src/pages/ProgressPage.tsx`, the progress vessel components, `ProgressDialog.tsx`, `liquidAppearance.ts`, and route configuration. The page uses `Choose your view`, `Progress options`, `How progress works`, `Launch pace`, and `Add your voice` popups; category explanations open from `About & how to help`. Native modal dialogs support Escape, focus containment, and restoring focus to the opening button. Colours blend from red at 0% through yellow at 25% and blue at 50% to green at 75%; bubble count and size rise with fill, with at most 14 decorative bubbles per vessel and none in empty vessels.

`node apps/website/scripts/validate-progress.mjs` passed on 2026-10-04. This executes the actual liquid appearance and calculation helpers to verify colour stages, fill clamping, missing/invalid targets, increasing bubble count/size, and live/sample separation. Source checks cover route header/footer hiding, popup controls, Escape handling, and focus restoration. Local typecheck and focused progress validation passed. Local browser verification confirmed no global header/footer or dropdowns, Escape dismissal, focus restoration, body scroll lock, and a phone-width popup without horizontal overflow. The full workspace check stopped at a legacy title assertion in validate-site.mjs expecting the old SectionHeading title prop; the new page renders an h1. Release checkout full checks and deployment were not completed because the user requested stopping and pushing the current changes. No live release is claimed.

Availability limits: live counts depend on the existing public progress data service; categories with unconfigured targets retain their target-setting state. Confirmed production category targets were preserved. Demonstration velocities, pledge totals, trends, milestones and contributor recognition are restricted to the labelled development fixture preview. Production has no pace projection until a measured weekly rate is available. This update does not establish a new launch date or publish a Blogger article.

## Publishing steps

Merge verification on 2026-10-04: reconciled with current main, preserving its newer header layout changes. `npm run build:web-ui` and `npm run check:website` passed in the isolated release checkout, including public route validation, progress calculation and popup checks, all four liquid appearance tests, and the production build.

Deployment on 2026-10-04 resumed at the user's request. `npm run deploy:website` successfully released only the `indigen-world` Hosting site in `project-kassena-7e026`, from clean `origin/main` commit `761213f7b532d31cfffe920b124e79a1c7a8778f`. The production-source guard, website typecheck, 13 public-route checks, progress checks, four liquid appearance tests, and production build all passed. Firebase also ran the configured dictionary and TribeStudio predeploy checks; their Hosting sites were not released.

Live asset verification at 16:44 UTC returned HTTP 200 for `/progress` and ten JavaScript/CSS assets on both `https://indigenworld.com` and `https://indigen-world.web.app`. All 22 responses matched the tested build by SHA-256; see `deployment-verification.json`. Live browser verification confirmed production aggregate counts, the view-selection popup, data table, traditional pots, and pause motion. The phone layout was visually inspected at 390 × 844. This evidence supersedes the earlier stopped-deployment status above. Available now: [public progress page](https://indigenworld.com/progress).

1. Review the confirmed deployment evidence above before publishing the article.
2. Upload both product screenshots, replace article image URLs, and preview the article in Blogger.
3. Set the title, labels, description, and custom permalink above. Chinedum decides when to publish.
4. Replace the published article URL placeholder in `share.md` before community sharing.

Preparing these files does not publish externally or send community messages.
