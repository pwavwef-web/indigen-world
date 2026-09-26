# Approved expression rewards

- Title: Points for approved contributor expressions
- Labels: Contributors, TribeStudio, Rewards
- Search description: Contributors earn points after their expressions are approved, including eligible earlier work.
- Status: Deployed September 26, 2026; Blogger draft, not published.

## Release evidence

- Production code commit: 2a074d7, pushed to main.
- All seven rewards/submission Functions deployed successfully. TribeStudio and Admin hosting releases completed.
- Both live sites returned HTTP 200 and referenced the freshly built asset filenames. The rewards endpoint rejected an unauthenticated request with HTTP 401.
- Across 11 contributor accounts and 27 submitted expressions, the backfill credited 19 approved expressions for 190 points: 13 in the first approval pass and six more in the final release pass. Eight submissions were not yet approved. No original submission records were missing or mismatched.
- The final pass recognized all 13 earlier credit records without crediting them again. Awards use approval dates and the configured daily cap.
- Backend tests: 48 passed. TribeStudio workflow tests: 47 passed. Contributor and Admin typechecks/builds passed.
- A signed-in production approval-to-redemption workflow has not been exercised end to end; manual airtime/data delivery remains an administrator action.

## Publishing steps

1. Review the article and, before announcing the complete workflow as verified, check it with an authorized contributor/admin account.
2. Upload images/cover.png and images/rewards-guide.png using Blogger’s image uploader. Replace the two relative image src values in post.html with their uploaded URLs. Keep the cover first so it can serve as the post thumbnail.
3. Paste post.html into Blogger with the title, labels, and search description above. Preview desktop and mobile layouts, then publish.
4. Replace the URL placeholder in share.md and share it. Publication and sharing remain with Chinedum.

## Visual assets

- [Cover](images/cover.png): 1672 × 941 landscape illustration, also suitable for sharing.
- [Rewards guide](images/rewards-guide.png): matching illustrated workflow.
- Both were visually checked and generated with the built-in image generation tool; they are illustrations, not portal screenshots. Prompts are recorded in images/prompts.md.
