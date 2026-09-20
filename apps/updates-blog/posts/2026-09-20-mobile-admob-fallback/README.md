# First-party community campaigns now have a privacy-aware fallback

Status: **Draft — implemented and configured, not released.** The consent
message is published with *Do not consent* enabled, and the Play Data Safety
answers were corrected and sent for review on 2026-09-20. Still pending:
app-ads.txt deployment, AdMob app verification against it, and a production
app release. No advert has served.

| Field | Value |
|---|---|
| Title | First-party community campaigns now have a privacy-aware fallback |
| Labels | `Mobile app`, `Advertising`, `Membership` |
| Search description | Indigen World keeps community campaigns first, adds a privacy-aware advertising fallback for free users, and keeps paid memberships ad-free. |
| Custom permalink | `privacy-aware-mobile-advertising-fallback` |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Release evidence

The Flutter implementation, tests, Android manifest configuration, consent
flow, privacy disclosures, and build-time safeguards are in the local feature
branch. The AdMob app is linked to the existing Play listing and the three
native units exist, but the account/app are not yet approved and serving.

## Publishing handoff

1. Complete the owner decisions and verification steps in
   `docs/product/mobile-admob-integration.md`.
2. Release and verify the production app, including membership suppression,
   consent, first-party priority, Google fill, and no-fill behavior.
3. Confirm AdMob is approved and serving before changing the article's
   availability note or saying the fallback is live.
4. In Blogger, create the title above and paste `post.html` in HTML view.
5. Add the labels, search description, and custom permalink above; preview and
   publish only after availability is confirmed.
6. Replace `[PUBLISHED_POST_URL]` in `share.md` before Chinedum shares it.
