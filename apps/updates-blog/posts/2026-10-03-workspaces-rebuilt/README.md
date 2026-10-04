# Workspaces rebuilt around the work

Status: **Deployed to TribeStudio Hosting on 2026-10-04, with the three compatible review Functions updates. Live routes, release assets and anonymous authentication gates verified. This article is unpublished; no community sharing performed.**

| Field | Value |
|---|---|
| Title | A clearer home for creating, contributing and reviewing |
| Labels | TribeStudio, Contributors, Validators, Product updates, Workspaces |
| Search description | Rebuilt Indigen World workspaces connect creation, contributions and review with clearer navigation, consistent controls and recoverable workflows. |
| Custom permalink | workspaces-rebuilt-around-the-work |
| Article | post.html |
| Sharing copy | share.md |

## Images and credits

All five images under `images/` (four JPEGs and one native PNG) are actual browser screenshots of this implementation, captured against local Firebase emulators. Credit: Indigen World. Test accounts and test records are used; no screenshot represents a real community submission or a production rollout. No generated photography or third-party stock imagery is included. Final local verification continued on 2026-10-04.

- creator-overview.jpg: creator entry, actions and saved draft.
- creator-editor-mobile.png: real saved video project, labelled tools and title-scene preview at a 390-pixel viewport.
- contributor-workspace.jpg: contributor assignment and actual test activity.
- validator-review.jpg: filtered queue, source evidence and revision context.
- contributor-mobile.jpg: contributor overview at a 390-pixel viewport.

Blogger: use Insert image → Upload from computer for each image. Replace each relative `src` in post.html with its Blogger image URL. Keep descriptive alt text and captions. Preview desktop and phone widths. The small native screenshots are compressed; do not upscale them to imply extra detail.

## Implementation and release evidence

The preservation inventory and detailed verification record are in `docs/product/workspace-reconstruction-2026-10-03.md`. Production source 934614410ccf9befde013dd52e5032cebbc36c78 was deployed to `hosting:tribestudio`; `decideSubmission`, `decideAdCampaign` and `decideKasemNameRequest` updated successfully from reconstruction source 8e063b4. Both tribestudio.indigenworld.com and tribestudio.web.app served the release index on creator, contributor, review and corpus routes, with no-cache headers. Nine entry assets matched the release bytes. All three anonymous review requests returned 401 UNAUTHENTICATED. Native-browser checks verified live sign-in screens, including the corrected desktop alignment and phone layout. The reconciled frontend passed 68 tests, typecheck and build; 71 backend regression tests and the Functions build also passed. Existing authentication, role permissions, consent and financial services remain the source of truth. Older clients remain compatible with the optional review guards.

Signed-in production journeys, real microphone hardware, paid AI, handset SMS and bank/finance delivery were not exercised during this deployment. Local authenticated workflow checks and screenshots are separate evidence. The public website, dictionary, admin Hosting sites, security rules and indexes were not deployed.

## Publishing steps

1. Verify any authenticated production journeys and configured external-service outcomes to be claimed in the announcement. Deployment and public entry checks are confirmed; private production flows remain unverified.
2. Keep the availability paragraph and service limits accurate using the evidence above.
3. Upload the included images, replace article image URLs and preview the HTML in Blogger.
4. Set the title, labels, description and permalink above. Chinedum can publish the article.
5. Replace the clearly marked article URL placeholder in share.md before sharing.

The owner separately authorised this deployment. Preparing this article does not authorise Blogger publication or sending messages; those remain with Chinedum.
