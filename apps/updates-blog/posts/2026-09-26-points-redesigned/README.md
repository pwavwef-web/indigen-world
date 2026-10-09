# Points, with a little more spark

## Blogger metadata

- **Title:** Points, with a little more spark
- **Labels:** Indigen World, Android, Contributions, Product updates
- **Search description:** A fresh look for contribution points: an animated score, a contributor podium, and clear ways to earn your next points.
- **Suggested permalink:** points-with-a-little-more-spark

## Release and deployment status

- **Prepared:** 2026-09-26.
- **Implemented:** A redesigned mobile contribution leaderboard, personal score card, animated emblem and score, compact earning tiles, contributor podium, and a rules sheet.
- **Verification:** Focused Flutter checks and local light/dark visual review passed; details below.
- **Availability:** Repository implementation only. No new Android bundle, Play upload, or live rollout is confirmed for this redesign. No release version has been assigned.
- **Publication:** Draft. The article and sharing copy have not been published or sent. Chinedum owns that handoff.
- **Scope:** The contribution points page reached through **Contribute → Top contributors**. The Learn progress sheet is separate. Scores, review requirements, and point values retain the existing backend behavior. No backend deployment is needed for this visual update.

## Verification record

- Flutter analysis of the leaderboard source and its screen test: no issues.
- All 15 points-screen widget tests passed, covering real score updates, ties, unknown rank, empty/error states, contribution navigation, the information sheet, reduced motion, and 320px layouts at 200% text in both appearances.
- The 12 existing contribution-hub and leaderboard-entry tests passed, as did all five Learn contribution-point tests.
- Two local render checks passed. Light and dark previews were visually inspected with fixture accounts, without reading production member data. Previews use the SDK's Roboto font as the platform fallback and are available locally at `apps/mobile/artifacts/points-redesign/`.
- No Android device was attached. Device installation, a new signed bundle, and Play availability remain unverified.

## Publish in Blogger

1. Confirm the Android build containing this redesign is available to the intended audience. Update the availability callout in `post.html` with that verified version and release status.
2. Create a new Blogger post with the title above.
3. Switch to HTML view and paste `post.html`.
4. Apply the labels, search description, and custom permalink above.
5. Preview on mobile and desktop, then publish when ready.
6. Replace `[PUBLISHED_ARTICLE_URL]` in `share.md` with the published article link before sharing. Use the preview wording until availability is confirmed.
