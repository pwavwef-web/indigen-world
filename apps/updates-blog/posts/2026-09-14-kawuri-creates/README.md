# Kawuri can now make and see (Indigen World 0.1.20)

Update post for the Android release **0.1.20 (29)**, release note
`docs/product/releases/0.1.20+29.md`.

| Field | Value |
|---|---|
| Title | Kawuri can now make and see: images, video, voice and media analysis in Indigen World 0.1.20 |
| Topic | Kawuri, the Indigen World assistant, gains image and video creation, English voice input and media analysis |
| Labels | `Release`, `Feature`, `Mobile app` (in that order: related posts follow the first label) |
| Search description | Indigen World 0.1.20: Kawuri creates images and short videos, turns English speech into text, and explains photos, clips and recordings with care. (146 characters) |
| Permalink (custom) | `kawuri-creates-images-video-voice` |
| Reading time | about 10 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | Kawuri home and an analysis in two phones, with the AI-generated courtyard | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/kawuri-home-and-recent.jpg` | 1600×1600 | Home screen tools and the live Recent section | `REPLACE-WITH-UPLOADED-kawuri-home-and-recent.jpg` |
| 3 | `images/create-image-and-video.jpg` | 1600×1150 | Create image form, and the video confirmation | `REPLACE-WITH-UPLOADED-create-image-and-video.jpg` |
| 4 | `images/image-made-and-analysed.jpg` | 1600×1150 | A real Kawuri-generated image and Kawuri's analysis of it | `REPLACE-WITH-UPLOADED-image-made-and-analysed.jpg` |
| 5 | `images/video-generating-and-frame.jpg` | 1600×1150 | A video in progress, and a frame from a real Kawuri video | `REPLACE-WITH-UPLOADED-video-generating-and-frame.jpg` |
| 6 | `images/english-voice-input.jpg` | 1600×1600 | The voice message sheet with the English-only notice | `REPLACE-WITH-UPLOADED-english-voice-input.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **App screens:** rendered from the 0.1.20 Flutter code with the render check, at 1170×2532. See `screens/`. The screens use sample creations; the analysis text is a real Kawuri answer from testing.
- **Generated media:** the courtyard picture (`screens/generated-courtyard.png`) and the painted-wall frame (`screens/veo-frame.png`) are real output from Vertex AI during testing on 2026-09-14. Both are labelled AI-generated in the post.
- **Regenerating the images:** re-render the mockups with `node apps/updates-blog/posts/2026-09-14-kawuri-creates/mockups/render.mjs`. It needs Google Chrome installed.

## Before publishing

**Publish only after 0.1.20 is live on Google Play.** On 2026-09-14 the backend was deployed, but the AAB was built and not uploaded. The post says "Shipped" and "Update from Google Play", which is only true once the rollout has started. Older app versions still show the tools as "Coming soon".

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

**Formatting.** The callout classes (`iw-lede`, `iw-ship`, `iw-tip`, `iw-note`, `iw-warn`, `iw-cols`) come from the Updates theme, which passed `npm run validate:updates-blog` on 2026-09-14. They render as plain blocks until that theme is uploaded. The post has 14 `h2` and `h3` headings, so the table of contents builds itself.
