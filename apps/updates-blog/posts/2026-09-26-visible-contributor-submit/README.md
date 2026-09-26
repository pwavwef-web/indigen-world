# A clearer final step for contributor submissions

Status: **Implemented and checked locally. Production deployment pending. Blogger draft, not published.**

| Field | Value |
|---|---|
| Title | A clearer final step for your contributions |
| Labels | Contributors, TribeStudio, Accessibility, Design |
| Search description | Visible sharing permissions and a bold Submit for review button make it easier to send saved Kasem expression drafts to the Review Desk. |
| Custom permalink | clearer-contributor-submissions |
| Article | post.html |
| Sharing copy | share.md |

## Release evidence

- The expression editor exposes the required sharing permission in an expanded panel; the optional AI choice remains unticked by default.
- A prominent Submit for review action opens the existing review dialog. Confirm submission remains necessary before any submission is sent.
- Phone layouts keep the submission action at the bottom of the screen, reserve space underneath the form, and bring missing required fields into view.
- Save draft sits beside the autosave status. The status strip no longer overlays form content while scrolling.
- Existing recovery, failed-save, consent, review and revision safeguards are retained. Regression coverage verifies that the reachable submission action cannot send without explicit sharing permission.
- `npm run check:tribestudio` passed: TypeScript, studio validation, all 47 workflow/PWA tests and the production build.
- Edge checks covered the desktop layout and 375px/320px mobile previews. A missing permission brought the visible checkbox into view. A simulated mobile submission required explicit consent and final confirmation, advanced only after success, and left AI training disallowed. Empty-translation guidance also brought the textarea into view.
- Production deployment will be recorded here after release. Browser workflow checks used sample data; no contributor submission was created by these checks.

## Publishing handoff

1. Confirm production availability and update the article's availability paragraph using release evidence.
2. Paste `post.html` into Blogger with the metadata above; preview on desktop and mobile.
3. Chinedum publishes the article and replaces the article URL placeholder in `share.md`.
4. The article and sharing copy are drafts; no publication or community message is implied by this repository change.
