# A Community feed built around culture and choice

- **Title:** A Community feed built around culture and choice
- **Labels:** Indigen World, Community, Cultural discovery, Language learning, Development preview
- **Search description:** A development preview of Following and For You, cultural discovery, optional activity personalization and clear recommendation controls.
- **Suggested permalink:** community-feed-culture-and-choice
- **Prepared:** October 2, 2026
- **Publication:** Blogger draft; not published or shared.
- **Deployment:** Not deployed. `COMMUNITY_RECOMMENDATIONS` defaults to false.

## What this update covers

The implemented `cultural-balance-v2` pipeline adds opt-in decaying private activity
features, emerging-contributor retrieval and expiring distinct-actor public trends
to the existing feed prototype. Following remains explicit and chronological.
Scores bound popularity and favor cultural relevance, learning and freshness.
Hard safety filters and diversity limits apply separately from the weighted score.
The complete design, models, API contracts, indexes, limitations and scale plan are
in `docs/product/community-recommendations.md`.

This post supersedes the earlier development preview's statement that activity
does not yet influence ranking. Older release drafts are preserved. No live
release, complete bot/harm detector, collaborative model or million-user SLA is
claimed. Viewing-duration/skip ingestion is supported but accurate mobile
instrumentation remains future work. Share events represent share intent.

## Image credits and upload

- `images/feed-pipeline.svg`: original vector workflow illustration created for
  this update. Credit: **Indigen World — original workflow illustration, 2026**.
- `images/feed-pipeline.png`: raster rendering of that illustration for Blogger.
  It contains no member content, externally sourced photography or app screenshot.
- Both files explicitly identify the development-preview status. The article's
  caption identifies the illustration. No image placeholders are used.
- `images/article-preview.png`: actual locally rendered article preview, verified
  visually with the illustration loaded. QA reference; no need to upload it.

1. Create a Blogger draft with the title, labels, search description and permalink.
2. Paste `post.html` into Blogger's HTML editor.
3. Upload the actual `images/feed-pipeline.png` asset using Blogger's image control.
4. Replace `images/feed-pipeline.png` with the uploaded Blogger image URL. Keep
   the descriptive alt text, caption and responsive width.
5. Preview desktop and mobile layouts. Preserve the development-preview wording
   unless deployment and app-release evidence has been verified.
6. Chinedum publishes and shares when ready; replace the placeholder in `share.md`.

## Verification and release handoff

Local checks passed: Functions build, 18 backend unit tests, 12 Firestore
integration tests, the 251-test Community suite, eight updated client/preferences
tests and clean Flutter analysis. The illustration and article were rendered and
visually checked. Exact evidence and limits are recorded in the product design.
The backend includes authentication, rate limiting, owner-bound sessions,
consent/idempotency checks, current safety rechecks and server-only feature/event
collections. The scheduled trend sampler is bounded and logs saturation.

Before enabling: deploy the five callables, indexing trigger and
`updateCommunityFeedTrends`, rules and indexes to the chosen staging project;
backfill retrieval metadata using the documented dry-run/apply script; curate
representative cultural and emerging posts; confirm index/TTL readiness; verify
two accounts, private communities, blocked accounts, consent on/off, pagination
and topic controls; measure load/cost and exercise rollback. Enable the Flutter
flag only in a build targeting that verified backend. App Check must be configured
before enforcing it for consuming clients.

Repository preparation does not deploy, publish or send messages.
