# Music that makes room (Indigen World 0.1.23)

Update post for the Android release **0.1.23 (32)**. The release note is `docs/product/releases/0.1.23+32.md`.

Status: **Draft — the production bundle was built and checked on 2026-09-24 but has not been uploaded to Google Play.** Nothing in this post is on anybody's phone yet.

| Field | Value |
|---|---|
| Title | Music that makes room: a player you can minimise, a close button that closes, and more context for Kasem sayings in Indigen World 0.1.23 |
| Topic | The music player bar folds into a bubble that floats over the screen and can be dragged to either edge; tapping it brings the bar back, and playback is never interrupted. Closing the player now stops the music, clears the notification and forgets the resume point. The contribution form takes a saying's literal translation and usage context, and a French meaning. Free accounts can see a Google advert where no Indigen World campaign is available; paid members stay ad-free. |
| Labels | `Release`, `Feature`, `Mobile app`, `Music`, in that order (related posts follow the first label) |
| Search description | Indigen World 0.1.23: minimise the music player into a bubble you can move, close it for good, and add context to Kasem sayings. (128 characters) |
| Permalink (custom) | `music-player-bubble` |
| Reading time | about 6 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The player bar in daylight and the bubble at night, beside the title | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/music-bubble.jpg` | 1600×1150 | Music with the player bar, then the same screen minimised to the bubble | `REPLACE-WITH-UPLOADED-music-bubble.jpg` |
| 3 | `images/bubble-anywhere.jpg` | 1600×1150 | The bubble dragged to the left edge, and the bubble in dark mode | `REPLACE-WITH-UPLOADED-bubble-anywhere.jpg` |
| 4 | `images/saying-fields.jpg` | 1600×1150 | The contribution form for a saying, beside a note on each of its three new optional boxes | `REPLACE-WITH-UPLOADED-saying-fields.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the 0.1.23 Flutter code with the render check at 1170×2532. See `screens/`.
  - Music shows the two songs that are really published in Music: *De N Lei — Come Learn Kasem* (Indigen World) and *Beyond the reef* (Francis Pwavwe), read from the live collection as a guest on 2026-09-23. *De N Lei* is shown playing.
  - Artwork is not drawn: the render check cannot load network images, so the covers show the app's own placeholder. On a phone, *De N Lei* shows its cover art in the list, the bar and the bubble.
  - The contribution form is shown empty. The notes beside it quote each box's hint exactly as the app shows it. No Kasem saying was invented for the picture.
  - No dictionary page is shown with the new details: none of the 349 published entries had them when this post was written, and the post does not use made-up Kasem.
  - The player is mounted exactly as the app mounts it, in `MaterialApp.builder` above the Navigator. The first render of the bar showed its buttons as error boxes, which led to the tooltip fix in 0.1.23 (see "Fixed - the player bar's tooltips" in the release note). The pictures were re-rendered after that fix.
  - Text is drawn in Roboto. The app uses Noto Sans, so letter shapes differ slightly from a phone.
- **Regenerating the images:** re-render with `node apps/updates-blog/posts/2026-09-24-music-player-bubble/mockups/render.mjs`. It needs Google Chrome installed.

## Before publishing

**Publish only after 0.1.23 is live on Google Play.** The post says "Shipped" and "Update from Google Play", which is only true once the rollout has started.

**Check the advertising section against AdMob.** The post says a Google advert *can* fill an empty place. Before publishing, open AdMob and check the app's status. If it is still not approved for serving, Google adverts will not appear yet; the section stays accurate, but do not describe Google adverts as already showing anywhere else.

**Already live on the backend (deployed 2026-09-23):** the contribution callable that keeps the literal translation, usage context and French meaning, and both dictionary websites that show them. Older apps ignore the new fields.

**Nothing changes for older apps.** The bubble, the new close behaviour, the new form boxes and the Google fallback all arrive with 0.1.23.

**Related drafts.** This release is what the two earlier drafts were waiting for:
`2026-09-20-mobile-admob-fallback` (the advertising fallback) and
`2026-09-21-kasem-contribution-context` (the contribution fields). Publish those as well
once their own checks pass, or keep this post as the single announcement. If they are
published first, link to them from the matching sections here.

## Publishing in Blogger

1. Go to **Posts → New post** and enter the title.
2. Switch to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**. For each broken image, in order:
   - click it and delete it
   - use **Insert image → Upload from computer** to add the file from the table above, in the same place
   - keep the cover as the first image
4. Back in **HTML view**, check each new `<img>` still has its `alt` text. Blogger sometimes drops it when an image is replaced; copy it back from the original `post.html` if so. The `<figcaption>` lines stay as they are.
5. In **Post settings**:
   - add the labels in the order given
   - add the search description
   - under **Permalink**, choose Custom and enter the permalink above
6. **Preview**, then **Publish**.
7. Replace `[PUBLISHED_POST_URL]` in `share.md` with the published link before sharing.

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`) come from the Updates theme. They render as plain blocks until that theme is uploaded. The post has 10 `h2` and `h3` headings, so the table of contents builds itself.
