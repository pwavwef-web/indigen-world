# Music, reimagined (Indigen World 0.1.25)

Update post for the Music upgrade planned in `docs/product/music-collection-upgrade.md`.

Status: **Draft. The 0.1.25 (34) production bundle was built and signed on 2026-09-24 (SHA-256 `12a9ea0e…19dd4`, jar verified; see `docs/product/releases/0.1.25+34.md`). A user reports that a Google Play testing track installed it and that it closes at the system splash screen. Hold this article until the 0.1.26 startup fix is available.**

- Verified: `dart analyze lib test` is clean, and the music, shared, collection and app test folders pass (170 tests).
- Full suite: 1507 tests passed. One reel-editor test timed out during the 20-minute run and passes on its own.
- A physical-phone check was not done before the 0.1.25 build. A user has since reported the Play-installed startup failure, and the preserved bundle reproduces it on an emulator.

**Version.** The post says **0.1.25 (34)**. The earlier 0.1.24 (33) bundle was built locally but never uploaded. This release also contains everything from 0.1.23 (32), which was built without this work and never uploaded.

| Field | Value |
|---|---|
| Title | Music, reimagined: its own navigation bar, a home in the colours of what's playing, and a now-playing screen that moves with the song (Indigen World 0.1.25) |
| Topic | Music becomes a place of its own. It has its own navigation bar (Home, Search, Artists, Library), which the app's bar turns into as you enter. A new home takes its colours from the playing song's cover and runs a Kassena wall-painting band that moves only while music plays. The now-playing screen grows out of the player bar: swipe the cover to change song, and read the words full screen. There are new artist pages, a refreshed player bar, and movement on the main navigation bar. Audiobooks share all of it. |
| Labels | `Release`, `Feature`, `Mobile app`, `Music`, in that order (related posts follow the first label) |
| Search description | Indigen World 0.1.25: Music gets its own navigation bar, a home in the colours of what's playing, and a now-playing screen you swipe. (133 characters) |
| Permalink (custom) | `music-reimagined` |
| Reading time | about 6 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | Music home and now playing, beside the title | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/music-home.jpg` | 1600×1150 | The Music home in light and dark mode | `REPLACE-WITH-UPLOADED-music-home.jpg` |
| 3 | `images/now-playing.jpg` | 1600×1150 | Now playing, then paused | `REPLACE-WITH-UPLOADED-now-playing.jpg` |
| 4 | `images/artist-page.jpg` | 1600×1150 | The Indigen World artist page, with notes | `REPLACE-WITH-UPLOADED-artist-page.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the new Flutter code with the render check at 1170×2532. See `screens/`.
  - **Songs shown.** Music shows the two songs that are really published: *De N Lei — Come Learn Kasem* (Indigen World) and *Beyond the reef* (Francis Pwavwe).
  - **Covers.** *De N Lei* uses its real cover, `assets/music/de-n-lei/cover.png`. *Beyond the reef* uses the cover the website uses for it, `apps/website/public/beyond-the-reef/images/cover-512.jpg`. On a phone each song shows whatever cover its record carries.
  - **Words.** The words on the now-playing screen are the published lyrics from `assets/music/de-n-lei/lyrics.txt`.
  - **Colours.** The page colours were worked out from the covers by the app's own code (`extractArtworkTint`).
  - **Differences from a phone.**
    - Shadows are drawn solid rather than soft, because the test renderer turns blur off.
    - Text is drawn in Roboto.
    - The player bar's title is caught mid-scroll: *De N Lei — Come Learn Kasem* is longer than the bar, so it scrolls while the song plays.
  - **Not pictured.** The Browse by kind and New in the archive shelves are not shown, because the archive does not have enough songs for them yet (see the note in the post). A render with nine sample songs was made for review only and is not used here.
- **Regenerating the images:** re-render with `node apps/updates-blog/posts/2026-09-24-music-reimagined/mockups/render.mjs`. It needs Google Chrome installed.

## Before publishing

**Hold publication until the 0.1.26 startup fix is available on Google Play and checked on a phone.** The article body still names 0.1.25; update that version before publication so readers are directed to the working build.

- **Check on a real phone first.** Open Music from Collection and confirm:
  - the navigation bar hands over;
  - the tile grows into Music;
  - now playing grows out of the bar and folds back when pulled down;
  - the cover swipe changes song;
  - the band and the bars stop when paused.
- **Check Reduce animations.** Turn on Android's *Remove animations* setting and confirm nothing loops.
- **Nothing on the server changes.** This is an app-only update. There is no Functions, rules or hosting deploy.
- **Related draft.** `2026-09-24-music-player-bubble` announces 0.1.23 (the bubble player). If both are published, publish that one first and link to it from "The player bar" section here.

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

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`) come from the Updates theme. They render as plain blocks until that theme is uploaded. The post has eleven `h2` and `h3` headings, so the table of contents builds itself.
