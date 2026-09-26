# Points for approved contributor expressions

Status: **Draft article. Deployed September 26, 2026; signed-in production end-to-end verification remains pending. Nothing is published or shared.**

| Field | Value |
|---|---|
| Topic | Approval-based contributor points, earlier work, and manual reward delivery |
| Title | Points for approved contributor expressions |
| Labels | Contributors, TribeStudio, Rewards, Kasem |
| Search description | Contributors earn points after their expressions are approved, including eligible earlier work, and can request airtime or data. |
| Custom permalink | approved-expression-rewards |
| Cover | images/cover.png (1672 × 941) |
| Article | post.html |
| Sharing copy | share.md |

## Images

Upload in this order. The first image is the cover and share card.

| # | File | Size | What it shows | Placeholder in post.html |
|---|---|---|---|---|
| 1 | images/cover.png | 1672 × 941 | Contributors, an approved contribution and points | REPLACE-WITH-UPLOADED-cover.png |
| 2 | images/rewards-guide.png | 1672 × 941 | Submission, approval, reward request and delivery tracking | REPLACE-WITH-UPLOADED-rewards-guide.png |

Both images were generated with the built-in image generation tool and visually checked. They are editorial illustrations, not portal screenshots. Generation prompts are recorded in [images/prompts.md](images/prompts.md).

The article uses the same Updates theme markup as the other posts: a separator cover, iw-lede introduction, iw-note availability callout, section headings, a captioned figure, an iw-tip callout and a Getting started link. Image presentation comes from the theme rather than inline styles.

## Release evidence

- Production code commit: 2a074d7, pushed to main.
- All seven rewards/submission Functions deployed successfully. TribeStudio and Admin hosting releases completed.
- Both live sites returned HTTP 200 and referenced the freshly built asset filenames. The rewards endpoint rejected an unauthenticated request with HTTP 401.
- Across 11 contributor accounts and 27 submitted expressions, the backfill credited 19 approved expressions for 190 points: 13 in the first approval pass and six more in the final release pass. Eight submissions were not yet approved. No original submission records were missing or mismatched.
- The final pass recognized all 13 earlier credit records without crediting them again. Awards use approval dates and the configured daily cap.
- Backend tests: 48 passed. TribeStudio workflow tests: 47 passed. Contributor and Admin typechecks/builds passed.
- A signed-in production approval-to-redemption workflow has not been exercised end to end; manual airtime/data delivery remains an administrator action.

## Publishing handoff

1. Review the article and complete the signed-in production workflow check before announcing it as fully verified.
2. In Blogger, create a post with the metadata above. Paste post.html in HTML view.
3. In Compose view, replace each image placeholder in order with Insert image → Upload from computer. Keep the cover first. In HTML view, check that each image retains its alt text and the guide retains its caption.
4. Preview with the Updates theme on desktop and mobile. Check the contributor link and that both uploaded images load.
5. Publish when Chinedum approves. Replace the published article URL placeholder in share.md before sharing.

The update is deployed. No Blogger publication or message has been made.
