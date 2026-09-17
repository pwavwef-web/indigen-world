# A clearer workspace for Kasem expression contributors

Status: **Draft — deployed 2026-09-16 (TribeStudio hosting, and the invite
functions with the corrected tribestudio.indigenworld.com links); the production
invitation-to-review flow still needs verification.** Prepared September 16,
2026, for the contributor portal and subsequent draft/revision improvements.

| Field | Value |
|---|---|
| Title | A clearer workspace for Kasem expression contributors |
| Labels | `TribeStudio`, `Feature`, `Kasem` |
| Search description | A dedicated workspace for invited Kasem contributors, with assigned expressions, saved drafts, recovery copies and reviewer feedback. |
| Custom permalink | `kasem-expression-contributor-workspace` |
| Cover | `cover.png` (1200×630) |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The workspace in a browser and on a phone | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/contributor-workspace.jpg` | 1600×1000 | Progress, expression list and editor on desktop | `REPLACE-WITH-UPLOADED-contributor-workspace.jpg` |
| 3 | `images/on-a-phone.jpg` | 1600×1150 | The list and the editor on a phone | `REPLACE-WITH-UPLOADED-on-a-phone.jpg` |
| 4 | `images/reviewer-feedback.jpg` | 1600×1000 | Reviewer feedback on an expression that needs revision | `REPLACE-WITH-UPLOADED-reviewer-feedback.jpg` |

Every image has alt text and a caption in `post.html`.

**Where the pictures come from.** Real screens of the portal's dev-only design preview
(`/contributor/preview` in TribeStudio), which uses sample expressions and sends nothing.
The preview's placeholder translations and its preview banner are cleared before capture,
so no Kasem is invented. The sample reviewer feedback is the preview's own text.

- Capture the screens: start the `tribestudio` dev server on port 5199, then
  `node apps/updates-blog/posts/2026-09-16-contributor-portal/mockups/capture.mjs`.
- Frame them: `node apps/updates-blog/posts/2026-09-16-contributor-portal/mockups/render.mjs`.
  Both need Google Chrome installed.

In Blogger's **Compose view**, replace each broken image in order with **Insert image →
Upload from computer**, keeping the cover first, then check in HTML view that each `<img>`
kept its `alt` text.

## Release evidence

Based on commits `48516b3`, `c2d96cd`, and `1d3da64`, and
[the contributor portal documentation](../../../../docs/product/contributor-portal.md).
This is an invitation-only workflow. The staff-side assignment screen was added
to the repository on 2026-09-17 and is covered by the separate contributor
management release post; this article still does not announce public enrolment
or prove either surface is live in production.

## Publishing handoff

1. Verify the production invitation, activation, draft recovery,
   submission and review flow described in the product documentation.
2. In Blogger, create a post with the title above. Paste `post.html` in HTML view.
3. Set the labels, search description and custom permalink above.
4. Preview the article with the Updates theme and check the contributor link.
   The cover is the first image, so it becomes the share image.
5. Publish when availability is confirmed. Replace `[PUBLISHED_POST_URL]` in
   `share.md` with the article URL, then give Chinedum the sharing copy.
