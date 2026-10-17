# See the meaning: illustrations for the Kasem word of the day

- **Prepared:** 15 October 2026.
- **Labels:** Kasem, Community, Word of the day, Learning, Product updates.
- **Search description:** Zem Botarebu now uses Gemini to illustrate a published Kasem word's meaning, with actions for verbs and clear subjects for nouns.
- **Implementation:** Complete; Functions build, ten policy tests and twelve Firestore/Storage emulator tests pass.
- **Deployment:** Confirmed live on 15 October 2026. Both Functions are ACTIVE; the deployed Scheduler job generated and attached today's real Gemini illustration. Public image returned HTTP 200 and was visually inspected.
- **Blogger:** Unpublished. Publication and sharing remain Chinedum's handoff.

## Publishing steps

1. Check the final deployment evidence below and review the linked live word post.
2. Create a Blogger draft with the title and labels above; copy `post.html` in HTML mode.
3. Upload the supplied `images/cover.png` and `images/live-word-illustration.jpg`. Replace their relative `src` values with Blogger's uploaded image URLs. Keep the captions and descriptive alt text.
4. Preview on desktop and phone. Preserve the AI illustration disclosure and availability limits.
5. After publishing, replace the article URL placeholder in `share.md` and link the published article from the posts index.

## Images and credits

`screens/live-word-illustration.png` is the unaltered image downloaded from the actual public word-of-the-day post after production generation. It is AI-generated artwork, not a screenshot, photograph or cultural evidence. Gemini model and linked word are recorded in the production evidence below.

`images/cover.png` and `images/live-word-illustration.jpg` are the supplied Blogger assets, made with `render-post-art.mjs` and `art.json`. Their branding and framing are illustration; the generated picture is kept unaltered inside its frame. Credits: Indigen World; illustration generated with Google Gemini. No external stock assets.

## Production evidence

- Deployment completed at approximately 11:08 UTC, project `project-kassena-7e026`, Node.js 22, `us-central1`.
- Word function revision: `postzembotarebudaily-00003-niw`, ACTIVE. Recovery revision: `recovercommunityautomation-00005-cow`, ACTIVE.
- Actual production Scheduler invocation: 11:08:34 UTC. Schedule remains ENABLED, `0 7 * * *`, `Africa/Accra`.
- Verified at 11:08:53 UTC: [di — to eat](https://indigen-world.web.app/post/daily_zem-botarebu_2026-10-15), one image upgrade attempt, `gemini-3.1-flash-image`. Public image HTTP 200, `image/png`, 1024 × 1024. Visually checked: a person actively eating from a spoon, no lettering. The existing post was updated; the original card is retained in a private image revision.
- Tested Functions bundle SHA-256: `7b3f0bb39b1d531e588cbd0ab437949dbc7bed04e36734ac7b890178992ed636`.
- `deployment-verification.json` contains the small public release record. Detailed operator logs and downloaded image remain under ignored `.tooling/community-automation/`.
- No hosting or mobile deployment was required. Blogger publication and external sharing are pending Chinedum.
