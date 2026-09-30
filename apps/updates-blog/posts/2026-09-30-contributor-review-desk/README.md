# The review desk comes to the contributor portal

Status: **Draft article. TribeStudio Hosting deployed September 30, 2026; custom-domain HTML and assets verified against the release build. Signed-in production verification pending. Article not published or shared.**

| Field | Value |
|---|---|
| Title | The review desk comes to the contributor portal |
| Labels | `TribeStudio`, `Contributors`, `Validators`, `Feature`, `Kasem` |
| Search description | Review contributions, sentences, adverts and name requests in TribeStudio’s contributor portal with existing validator permissions. |
| Custom permalink | `contributor-review-desk` |
| Article | `post.html` |
| Sharing copy | `share.md` |
| Image | `images/review-desk.png` (1200 × 630) |

## Evidence and limits

- Route: `/contributor/review`, guarded before any queue listeners mount. It uses the existing `canValidate` permission policy (validator, reviewer, admin, super_admin). Review access is independent of contributor invitation status.
- Contributor overview button, sidebar and mobile More menu, plus TribeStudio Tools navigation, show the link only to authorized roles.
- Four queue collections and their decisions follow the mobile desk. Decisions use existing callables: `decideSubmission`, `decideGrammarNote`, `decideAdCampaign`, `decideKasemNameRequest`; private sentence audio uses `readGrammarAudio`.
- Dictionary comparisons use the existing published-headword lookup. Sentence judgments mirror the evidence review dimensions and pass the revision to the server. The newer dictionary output choices are implemented in the working source but hidden in the deployed UI until their backend release is verified; current `origin/main` lacks that support.
- Validation: the initial workspace passed 64 tests. The production source, based on current `origin/main` plus only this review-desk change, passed `npm run check:tribestudio` (typecheck, 50 tests and production build). New tests exercise direct review access across all roles, invitation independence, no queue mounting for guests or ordinary contributors, decision states, feedback, publication/training consent, linked-entry requirements and external link protocols.
- No backend, rules or production data changes were deployed. All five review/audio callables were confirmed ACTIVE before deployment; their live environment reports evidence writes enabled. Queues show up to 60 items; this is not full pagination. Legacy sentence notes can require migration and permission before review.
- Signed-in production access, attachments and decision flows have not been verified in this task.

## Deployment evidence — September 30, 2026

- Firebase project: `project-kassena-7e026`; Hosting site: `tribestudio`; 44 files deployed, release completed successfully.
- Source: isolated managed checkout at `C:/Users/DELL/.codex/worktrees/review-desk-release/indigen-world`, base `origin/main` at `f1519fe4f188a747100297391910fe713d10d899`, release commit `b4dca837e6b4b8f7b722dab33f1626cce818cb01`. It preserves the newer portal design, onboarding and streak display; unrelated unfinished work from the original checkout was excluded. The release commit is saved locally and has not been pushed.
- The original checkout is on another branch with unrelated uncommitted changes. Deployment used a temporary config containing only the current main TribeStudio Hosting configuration. The clean-main predeploy gate was replaced for this explicitly authorized scoped release by isolated dependency installation, shared UI builds and the full TribeStudio check; no repository deployment policy files were edited.
- Live `/contributor/review`, `/contributor` and `/studio` returned HTTP 200 and exactly matched the released `index.html` (SHA-256 `9ec0c45f6edee12e093a2af8fa1c96a44ec4c00f732b0bb6c901a9486446ba7d`).
- Live `ContributorPortal-Bgl46h-6.js` matched the local build (SHA-256 `d61a0fff1bf0df640cc16f2057bcc588e449798f0aa8df360d1310ad3115cc84`) and contains the review route and all four decision callables. The portal stylesheet, main stylesheet and main JavaScript also matched their local files.
- Signed-in decisions and media playback remain unverified; the public HTTP check confirms the deployed files, not an authenticated review flow.

## Image credit and upload steps

`images/review-desk.svg` is an original repository-created workflow illustration; `images/review-desk.png` is its raster rendering. Credit: **Indigen World — workflow illustration, September 2026**. It depicts the implemented queue categories and access policy. It contains no member data and is explicitly labelled as an illustration, not a screenshot.

Regenerate the PNG from the repository root with `node apps/updates-blog/posts/2026-09-30-contributor-review-desk/render-image.mjs`.

1. Create a Blogger draft with the title, labels, description and permalink above.
2. Paste `post.html` in HTML view.
3. Upload the actual `images/review-desk.png` asset through Blogger’s Insert image → Upload from computer. Replace the local `images/review-desk.png` source with its Blogger URL, preserving the alt text and caption.
4. Smoke-test the deployed desk with an authorized account, an ordinary contributor account and a signed-out browser. Check all four queue types and permitted decisions using designated test records.
5. Update the availability paragraph and this status only when verified, then let Chinedum publish and share the article. Copy the published URL into `share.md`.

Publication and sharing remain with Chinedum.
