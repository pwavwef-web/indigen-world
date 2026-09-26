# Help before contributor sign-in

Status: **Implemented and locally tested; deployment pending. WhatsApp inactive. Blogger draft, not published.**

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
- Public support page visually inspected in Edge.
- An Indigen World Meta business portfolio was created with owner authorization. No WhatsApp number has been registered or migrated. Sent's current signup did not offer Ghana phone verification.
- Web deployment, live staff inbox, SMTP delivery and WhatsApp activation still need confirmation. Follow `docs/operations/contributor-support.md`.

## Publishing handoff

1. Update the availability paragraph and release evidence after verified deployment.
2. Paste `post.html` into Blogger with the metadata above and preview desktop/mobile.
3. Chinedum publishes when ready and replaces the URL placeholder in `share.md`.
4. Do not claim WhatsApp is live before a real inbound and delivered outbound message are verified.
