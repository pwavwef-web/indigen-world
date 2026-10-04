# Help Fill the Jars, with more room to see our progress

Status: **Draft prepared on 2026-10-04. Implementation and local popup review complete; product screenshots included. Work stopped at the user’s request before deployment. Full website verification is incomplete. Blogger article unpublished. Publication and sharing handoff remain with Chinedum.**

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

Both assets are actual product screenshots captured during local browser verification on 2026-10-04. If sample targets are used to demonstrate the colour range, keep the sample notice visible and label the screenshot and caption as a sample preview.

Blogger: Insert image → Upload from computer for each asset. Replace the relative image `src` values in `post.html` with the uploaded Blogger URLs. Preserve descriptive alt text and captions, then preview desktop and phone widths.

## Implementation and release evidence

The requested scope is a full-screen progress route, popup controls replacing dropdowns, long explanations accessible through buttons, and liquid colour/bubble animation tied to each category's fill percentage.

Implementation reviewed in `apps/website/src/pages/ProgressPage.tsx`, the progress vessel components, `ProgressDialog.tsx`, `liquidAppearance.ts`, and route configuration. The page uses `Choose your view`, `Progress options`, `How progress works`, `Launch pace`, and `Add your voice` popups; category explanations open from `About & how to help`. Native modal dialogs support Escape, focus containment, and restoring focus to the opening button. Colours blend from red at 0% through yellow at 25% and blue at 50% to green at 75%; bubble count and size rise with fill, with at most 14 decorative bubbles per vessel and none in empty vessels.

`node apps/website/scripts/validate-progress.mjs` passed on 2026-10-04. This executes the actual liquid appearance and calculation helpers to verify colour stages, fill clamping, missing/invalid targets, increasing bubble count/size, and live/sample separation. Source checks cover route header/footer hiding, popup controls, Escape handling, and focus restoration. Local typecheck and focused progress validation passed. Local browser verification confirmed no global header/footer or dropdowns, Escape dismissal, focus restoration, body scroll lock, and a phone-width popup without horizontal overflow. The full workspace check stopped at a legacy title assertion in validate-site.mjs expecting the old SectionHeading title prop; the new page renders an h1. Release checkout full checks and deployment were not completed because the user requested stopping and pushing the current changes. No live release is claimed.

Availability limits: live counts depend on the existing public progress data service; categories with unconfigured targets retain their target-setting state. Confirmed production category targets were preserved. Demonstration velocities, pledge totals, trends, milestones and contributor recognition are restricted to the labelled development fixture preview. Production has no pace projection until a measured weekly rate is available. This update does not establish a new launch date or publish a Blogger article.

## Publishing steps

1. Confirm deployment and live page verification; update this status, the article's availability paragraph, and sharing status with the release evidence.
2. Upload both product screenshots, replace article image URLs, and preview the article in Blogger.
3. Set the title, labels, description, and custom permalink above. Chinedum decides when to publish.
4. Replace the published article URL placeholder in `share.md` before community sharing.

Preparing these files does not publish externally or send community messages.
