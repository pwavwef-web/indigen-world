# Explore keeps your place, and My Space gets simpler (Indigen World 0.1.28)

Update post for the 20 app upgrades planned and built on 2026-09-27: the Explore scrolling fixes, the My Space reorganisation, the removals and the other fixes. Release record: `docs/product/releases/0.1.28+37.md`. Explore behaviour in detail: `docs/product/explore-feed.md` §6.

Status: **Draft. Implemented and tested in the repository only. No 0.1.28 bundle has been built, nothing is on Google Play, and none of the three backend steps has run.** Do not publish until the checklist under *Before publishing* is done.

- Verified:
  - `dart analyze lib test` is clean.
  - `flutter test`: 1,555 passed and 1 skipped (the full suite, run on 2026-09-27 after the last code change).
  - `npm run test:rules`: 201 passed, including the new `savedWordIds` tests.
- Not verified: nothing has run on a physical phone. Real network video, the 30-second release of players, double-tap feel and memory use need a device.

| Field | Value |
|---|---|
| Title | Explore keeps your place, and My Space gets simpler (Indigen World 0.1.28) |
| Topic | Explore comes back to the reel you left, stops reshuffling as it loads, keeps the previous reel ready and adds double-tap to appreciate. My Space becomes You, Membership and Settings, with your profile, library and work on one page. Translate a word is the first card on Contribute, your submissions are one list with filters, saved words follow your account, and sign-out on a shared phone is safer. |
| Labels | `Release`, `Feature`, `Mobile app`, `Explore`, in that order (related posts follow the first label) |
| Search description | Indigen World 0.1.28: Explore keeps your place and adds double-tap to appreciate, and My Space becomes You, Membership and Settings. (132 characters) |
| Permalink (custom) | `explore-keeps-your-place` |
| Reading time | about 5 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | My Space's You page (dark) and an Explore reel with the double-tap heart, beside the title | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/explore.jpg` | 1600×1150 | An Explore reel with the gold heart, and the four Explore changes | `REPLACE-WITH-UPLOADED-explore.jpg` |
| 3 | `images/my-space.jpg` | 1600×1150 | The top of the You page, and its library and work further down | `REPLACE-WITH-UPLOADED-my-space.jpg` |
| 4 | `images/contribute.jpg` | 1600×1150 | The Contribute tab with Translate a word first, and Your submissions with its filters | `REPLACE-WITH-UPLOADED-contribute.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the new Flutter code with the render check at 1170×2532 (`screens/`), then framed in phones by `mockups/*.html`. The render test itself was temporary and is not in the repository.
- **Sample data — say so if asked.** Everything in the screens is illustrative:
  - the member "Amina Ayaribisa" (@amina_paga), her bio, the counts (184 contributions, 131 approved, 1,310 points) and the 12 saved words;
  - the submissions (*kukuri*, *Harvest song from Chiana*, *nabiina*, *How the crocodiles of Paga came to stay*) and the reviewer's note;
  - the top contributors (Amina Ayaribisa, Kofi Ayamga, Abla Nsoh).
  The Explore reel is shown as published by Indigen World. Its like (48) and reply (6) counts are also sample values.
- **Photograph:** the Explore reel uses `apps/mobile/assets/places/tono-dam.png`, the irrigation channel below the Tono dam, by Apiu Akwojong Ezekiel, from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tono_Dam_AWC_Water_for_life_4.png), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The app already bundles it for the Collection place stories. The caption and the closing note credit it.
- **Differences from a phone.**
  - Text is drawn in Roboto, and the ✣ motif in Segoe UI Symbol, because the test renderer has neither Noto Sans nor Noto Sans Symbols.
  - Shadows are drawn solid rather than soft, because the test renderer turns blur off.
  - The heart is caught about a third of the way through its animation.
- **Regenerating the figures:** `node apps/updates-blog/posts/2026-09-27-explore-and-my-space/mockups/render.mjs`. It needs Google Chrome installed, and it re-frames the PNGs already in `screens/`.

## Before publishing

1. **Build and ship 0.1.28 (37)** to Google Play, and check it on a phone. Use the checklist in `docs/product/releases/0.1.28+37.md`: Explore topic switching, coming back, swiping back, double-tap, the data-saver switch, the three-tab My Space, sign-out only in Settings, and saved words on a second phone.
2. **Explore's video feed:** the section *More community videos* is only true once both of these are done, in this order:
   - the `hasVideo` backfill has run (`node services/functions/scripts/backfill-community-has-video.mjs`, then `--commit`);
   - the Firestore index `communityPosts (hasVideo, isReply, createdAt desc)` has been deployed and has finished building.
   If either is still pending at publication, delete that section (its `h3` and paragraph) before publishing.
3. **Submissions order:** deploy the `collectionContributions (authUid, createdAt desc)` index too. Until it exists, the list shows fifty submissions in no particular order for somebody who has sent more than fifty. The counts are exact either way.
4. **Rules:** deploy the Firestore rules, so the saved-words list on `learnProgress` has its bound of 2,000. Saved words sync without it; nothing in the article depends on it.
5. Replace `[PUBLISHED_POST_URL]` in `share.md` after publishing.

## Publishing in Blogger

1. Go to **Posts → New post** and enter the title.
2. Switch to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**. For each broken image, in order:
   - click it and delete it;
   - use **Insert image → Upload from computer** to add the file from the table above, in the same place;
   - keep the cover as the first image.
4. Back in **HTML view**, check that each new `<img>` still has its `alt` text. Blogger sometimes drops it when an image is replaced. If so, copy it back from the original `post.html`. Leave the `<figcaption>` lines as they are.
5. In **Post settings**:
   - add the labels in the order given;
   - add the search description;
   - under **Permalink**, choose Custom and enter the permalink above.
6. **Preview**, then **Publish**.
7. Replace `[PUBLISHED_POST_URL]` in `share.md` with the published link before sharing.

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-note`) come from the Updates theme. They render as plain blocks until that theme is uploaded. The post has eighteen `h2` and `h3` headings, so the table of contents builds itself.
