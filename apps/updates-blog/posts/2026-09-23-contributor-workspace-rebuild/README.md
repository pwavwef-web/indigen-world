# A rebuilt workspace for Kasem contributors

Status: **Draft article. Implemented and tested locally on branch
`feat/contributor-workspace-rebuild` (uncommitted when this was written). Not
deployed. Nothing is published or shared.** Prepared September 23, 2026.

| Field | Value |
|---|---|
| Topic | The TribeStudio contributor portal rebuilt as a workspace: navigation, honest review counts, community activity, Platform guide, Kawuri Intelligence, account settings and verified payment details |
| Title | A rebuilt workspace for Kasem contributors |
| Labels | `Contributors`, `TribeStudio`, `Feature`, `Kasem` |
| Search description | Invited Kasem contributors get a rebuilt TribeStudio workspace: clear review status, guidance, Kawuri suggestions and checked payment details. |
| Custom permalink | `contributor-workspace-rebuild` |
| Cover | `cover.png` (1200×630) |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The Overview in a browser and the editor on a phone | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/workspace-overview.jpg` | 1600×1100 | The Overview on desktop | `REPLACE-WITH-UPLOADED-workspace-overview.jpg` |
| 3 | `images/on-a-phone.jpg` | 1600×1150 | The Overview and a returned expression on a phone | `REPLACE-WITH-UPLOADED-on-a-phone.jpg` |
| 4 | `images/kawuri-intelligence.jpg` | 1600×1130 | Kawuri Intelligence with labelled suggestions and sources | `REPLACE-WITH-UPLOADED-kawuri-intelligence.jpg` |
| 5 | `images/payment-details.jpg` | 1600×1180 | A bank account that needs action | `REPLACE-WITH-UPLOADED-payment-details.jpg` |

Every image has alt text and a caption in `post.html`.

**Where the pictures come from.** Real screens of the workspace's dev-only design
preview (`/contributor/preview` in TribeStudio), which uses sample data and sends
nothing. The preview banner is removed and its placeholder translations are cleared
before capture, so no Kasem is invented. The Kawuri screen shows the preview's sample
response, which says on screen that it was not produced by Kawuri; the caption says so
too. The payment screen shows an automated statement check, which is **off** in the
backend until `CONTRIBUTOR_STATEMENT_CHECK=enabled` is set; the article says it is off.

- Capture the screens: start the `tribestudio` dev server on port 5199, then
  `node apps/updates-blog/posts/2026-09-23-contributor-workspace-rebuild/mockups/capture.mjs`
  (set `PREVIEW_ORIGIN` for another port).
- Frame them: `node apps/updates-blog/posts/2026-09-23-contributor-workspace-rebuild/mockups/render.mjs`.
  Both need Google Chrome installed.

In Blogger's **Compose view**, replace each broken image in order with **Insert image →
Upload from computer**, keeping the cover first. Then check in HTML view that each `<img>`
kept its `alt` text.

## What the article claims, and the evidence

Every feature described is implemented on the branch above and covered by tests:

- `npm run test:contributor-portal`: 44 backend unit tests and 47 Studio workflow tests pass.
- `npm run test:contributor-e2e`: 7 emulator end-to-end tests pass (payment details, finance
  decisions, statement links, MoMo without SMS, profile and settings, community activity,
  Kawuri assist).
- `npm run test:rules` 198/198, `npm run test:storage-rules` 21/21,
  `npm run test:function-helpers` 539/539 and the existing `npm run test:e2e` 34/34 pass.
- The Functions, TribeStudio and Admin production builds pass.
- Details: [the contributor portal documentation](../../../../docs/product/contributor-portal.md#workspace-rebuild--2026-09-23).

Not verified: any signed-in production flow, SMS delivery of MoMo codes, and the signed
statement link, which needs the Token Creator IAM grant described in the documentation.
The article says rates, payment schedules and review times are not published, because
they are not. Do not add figures unless the team publishes them.

## Publishing handoff

1. Deploy the Functions, Firestore rules, Storage rules, TribeStudio and Admin changes listed
   in the documentation, grant the `finance` claim to the finance reviewers, and complete a
   signed-in smoke test: Overview counts, a returned expression, Kawuri, a bank submission
   and a finance decision, and a MoMo code on a real handset.
2. In `post.html`, update the **Availability** note so it no longer says the update is
   waiting for release, and adjust the last line of **Getting started** to match.
3. In Blogger, create a post with the title above. Paste `post.html` in HTML view. Set the
   labels, search description and custom permalink above.
4. Upload the images as described, preview with the Updates theme, and check the
   contributor link.
5. Publish when Chinedum approves. Replace `[PUBLISHED_POST_URL]` in `share.md` with the
   article URL, then give Chinedum the sharing copy.

No external publication, deployment or message has been made.
