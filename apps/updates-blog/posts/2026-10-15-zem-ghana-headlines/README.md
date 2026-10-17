# Meet Zem Ghana: Ghana headlines, with sources

- **Prepared:** 15 October 2026.
- **Topic:** New automated community account @zem_ghana that posts sourced Ghana headlines with Indigen-branded cards.
- **Labels:** Community, News, Ghana, Automation, Product updates.
- **Search description:** Zem Ghana posts one Ghana headline four times a day in the Indigen World community feed: a neutral AI summary, the outlet's name and a link to the full report.
- **Implementation:** Complete. Functions typecheck and build pass. `npm run test:community-automation` passes: 19 policy/renderer tests and 16 Firestore/Storage emulator tests, 9 and 4 of them new for Zem Ghana. A production dry run on 15 October fetched all four live feeds (135 items) and made real Vertex selection and source-check calls. It rendered the card in this post and wrote nothing.
- **Deployment:** **Live since 15 October 2026.** `postZemGhanaNews` was created that afternoon, then updated twice that afternoon with summary-length fixes (final update 13:35:39 UTC). The live function list went from 223 to 224, with no other change. The account was provisioned (`--news-prepare`) and enabled (`--news-publish`). The first post, [news_zem-ghana_2026-10-15_11](https://indigen-world.web.app/post/news_zem-ghana_2026-10-15_11), was published by the deployed Scheduler job at about 13:30 UTC. `--news-verify` at 13:36 UTC reported: function ACTIVE, Scheduler ENABLED (`0,30 7-21 * * *`, Africa/Accra), automated claim set, sign-in disabled, profile artwork present, card HTTP 200, post page HTTP 200.
- **Blogger:** Unpublished. Publication and sharing remain Chinedum's handoff.
- **First-post correction:** the first summary was published reading "7. 4%" and "4. 9%", because the first version of the summary-fitting code split decimals. The code was fixed and redeployed at 13:35 UTC. With the owner's approval, the live post's text was then corrected to 7.4% and 4.9%. The original text is kept in a private revision under its run record, and likes and counts were unchanged (0/0).

## Publishing steps

1. Optionally re-check with `node services/functions/scripts/community-automation.mjs --news-verify`.
2. Create a Blogger draft with the title and labels above, then paste `post.html` in HTML mode.
3. Upload `images/cover.png`, `images/headline-card.jpg` and `images/profile-cover.jpg`. Replace each relative `src` with Blogger's uploaded URL. Keep the alt text and captions.
4. Preview on desktop and phone. After publishing, replace the placeholder in `share.md` and add the article link to the posts index.

## Images and credits

- `screens/headline-card.png`: the unaltered card downloaded from Zem Ghana's first live post (`--news-verify`). Zem Ghana's own renderer (`newsCardSvg`) drew it from a MyJoyOnline headline. The headline text belongs to MyJoyOnline and is shown with attribution.
- `screens/profile-cover.png`: the account's cover. `zem-ghana-art.mjs` renders it from the Indigen World mark and Ghana's flag colours. No AI generation and no external assets.
- `images/cover.png`, `images/headline-card.jpg` and `images/profile-cover.jpg` are the Blogger assets. `render-post-art.mjs` made them from `art.json`, with the frames and backgrounds as illustration. Credits: Indigen World. Noto Sans is used under the SIL Open Font License.

## How it works (for reviewers)

- Code: `services/functions/src/community-news-policy.ts` (feeds, filters, slots, text and card) and `community-news.ts` (fetch, Vertex, render, publish).
- Schedule: `postZemGhanaNews` runs every 30 minutes from 07:00 to 21:30 Africa/Accra. It publishes the due slot (07, 11, 15 or 19) once, with leases and at most three attempts. A missed slot is abandoned after three hours.
- Architecture notes and operation commands: `docs/architecture/community-automation.md`, section "Zem Ghana".
