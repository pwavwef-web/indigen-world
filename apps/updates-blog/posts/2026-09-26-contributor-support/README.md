# Help before contributor sign-in

Status: **Website and staff inbox deployed September 26, 2026. Live email delivery unverified. WhatsApp inactive. Blogger draft, not published.**

| Field | Value |
|---|---|
| Title | Help when you cannot get into your contributor workspace |
| Labels | Contributors, TribeStudio, Support, Feature |
| Search description | A support page before sign-in, private case links, recovery guidance and a team inbox for contributor concerns. |
| Custom permalink | contributor-support-before-sign-in |
| Article | post.html |
| Sharing copy | share.md |

## Release evidence

- Functions build, TribeStudio checks (47 existing tests), and Admin checks pass.
- Nine support integration tests passed against demo Auth and Firestore emulators. They exercise access control, recovery and WhatsApp processing with a fake transport; they do not prove live delivery.
- The three Firestore indexes and six website/email support functions deployed successfully to `project-kassena-7e026`. TribeStudio and Admin hosting deployed successfully from clean `origin/main` at `e59108f6787014adfc711e4348fb761a87ff928e` (PRs #22 and #23).
- The public support page at `https://tribestudio.indigenworld.com/contributor/support` and authenticated Admin → Contributors → Issues → Support inbox were inspected in Edge after deployment. The staff inbox loads successfully with no cases yet.
- The hosted support API returned HTTP 200 with WhatsApp disabled. Invalid private-case access and unauthenticated staff access returned HTTP 403. No production test cases or test emails were sent.
- GitHub Actions could not start because the GitHub account is locked due to a billing issue. Local checks passed; remote CI success is not claimed.
- An Indigen World Meta business portfolio and WhatsApp Business account exist. Contact information was saved and the account displays “Review in Progress.” Meta rejected number connection as already registered; the linked existing account is not accessible to the current owner session. No number has been migrated or disconnected. Sent's current signup did not offer Ghana phone verification.
- SMTP acceptance/delivery, a complete production case exchange, number connection and WhatsApp activation still need verification. Follow `docs/operations/contributor-support.md`. Do not treat deployment as proof of message delivery.

## Publishing handoff

1. Review the availability paragraph and remaining limits before publication.
2. Paste `post.html` into Blogger with the metadata above and preview desktop/mobile.
3. Chinedum publishes when ready and replaces the URL placeholder in `share.md`.
4. Do not claim WhatsApp is live before a real inbound and delivered outbound message are verified.
