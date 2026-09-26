# Approved expression rewards

- Title: Points for approved contributor expressions
- Labels: Contributors, TribeStudio, Rewards
- Search description: Contributors earn points after their expressions are approved, including eligible earlier work.
- Status: Historical approval backfill completed; deployment and live verification pending.

## Release evidence

- The production read-only audit found 13 approved and 14 awaiting review among 27 earlier submitted expressions. No original submission records were missing or mismatched.
- Backfill outcome: 13 approved expressions credited for 130 points. Fourteen submitted expressions remain awaiting approval. A final idempotence audit is pending.

## Publishing steps

1. Deploy the Functions, TribeStudio, and Admin updates from the pushed production commit.
2. Verify the points balance for an account with an earlier approved expression, and verify a newly approved expression earns points once while a pending expression earns none.
3. Update this status and the article availability sentence with confirmed live evidence. Paste `post.html` into Blogger and publish.
4. Replace the URL placeholder in `share.md` and share it.
