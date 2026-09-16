# Beyond the Reef, now an interactive music film

Status: **Live — deployed 2026-09-16 to the `indigen-world` Hosting site and checked in
production.** The article itself is a draft until Chinedum publishes it.

| Field | Value |
|---|---|
| Title | Beyond the Reef, now an interactive music film on indigenworld.com |
| Topic | A new full-screen page presents the song Beyond the Reef as a music film: lyrics that rise in time with the song over a generated journey from shore to horizon, in eleven chapters, with player controls, keyboard shortcuts, a phone layout and a reduced-motion mode. |
| Labels | `Website`, `Release`, `Feature`, `Community`, in that order (related posts follow the first label) |
| Search description | Beyond the Reef is now an interactive music film on indigenworld.com: lyrics that rise with the song over a journey from shore to horizon. (140 characters) |
| Permalink (custom) | `beyond-the-reef-music-film` |
| Reading time | about 5 minutes |
| Cover | `cover.png` (1200×630) |
| Article | `post.html` |
| Sharing copy | `share.md` |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The film on a laptop and a phone at the reef crossing | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/journey.jpg` | 1600×900 | Four chapters on a computer: city, reef, storm, island | `REPLACE-WITH-UPLOADED-journey.jpg` |
| 3 | `images/on-a-phone.jpg` | 1600×1150 | Opening screen, storm and closing screen on a phone | `REPLACE-WITH-UPLOADED-on-a-phone.jpg` |

Every image has alt text and a caption in `post.html`.

**Where the pictures come from.** Real captures of the live page at
`https://indigenworld.com/beyond-the-reef`, taken with headless Chrome at 1440×900 (computer)
and 390×844 at 3× (phone), then framed in a laptop and phone.

- Capture: `node apps/updates-blog/posts/2026-09-16-beyond-the-reef/mockups/capture.mjs`
- Frame: `node apps/updates-blog/posts/2026-09-16-beyond-the-reef/mockups/render.mjs`

Both need Google Chrome installed.

## Release evidence

- Feature commit `f5dc895` on `main`, deployed with `npm run deploy:website` (all hosting
  predeploy checks passed). Follow-up commits are listed in `git log -- apps/website`.
- Production checks: `/beyond-the-reef` returns 200 with its own title, canonical URL and link
  preview image; `/`, `/about`, `/dictionary` and `/project-kassena` still return 200 and unknown
  paths still return 404; audio, video and images are served with the right content types, a
  week of browser caching, and byte-range support.
- In Google Chrome against the live site: lyrics, chapter captions and film clips matched the
  song at every sampled position; pause, seek, restart, replay and the keyboard shortcuts
  worked; the closing screen appeared at the end; reduced motion removed clips and camera
  movement; the phone layout had no horizontal overflow.
- How the page and its media were made: `apps/website/scripts/beyond-the-reef/README.md`.

## Before publishing

- **Song credit.** The post does not name who wrote or performed the song, or how the music was
  made. The MP3's own tags say it was *made with Suno* and credit the artist `pwavwef`. Decide how
  the song should be credited, and whether the music tool's terms require an attribution, before
  this post (or the page) is shared widely.
- **Browsers.** Verified in Google Chrome on a computer-sized and a phone-sized screen. It was
  not tested in Safari or Firefox, or on a physical phone. A quick play-through on an iPhone is
  worth doing before announcing: Safari plays the MP4 clips and may play the MP3 fallback rather
  than the remuxed audio.
- **Lyric timing.** The choir section (4:23–4:43), "...Yeah." (3:27) and the outro's first line
  (4:51) were the hardest to time from the recording. If a line feels early or late, its number
  is in `apps/website/src/features/beyond-the-reef/lyrics.ts`.

## Publishing in Blogger

1. Go to **Posts → New post** and enter the title.
2. Switch to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**. For each broken image, in order:
   - click it and delete it
   - use **Insert image → Upload from computer** to add the file from the table above, in the same place
   - keep the cover as the first image
4. Back in **HTML view**, check each new `<img>` still has its `alt` text. Blogger sometimes drops
   it when an image is replaced; copy it back from the original `post.html` if so.
5. In **Post settings**:
   - add the labels in the order given
   - add the search description
   - under **Permalink**, choose Custom and enter the permalink above
6. **Preview**, then **Publish**.

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`) and `iw-kbd`
come from the Updates theme. The post has 8 `h2` headings, so the table of contents builds itself.
