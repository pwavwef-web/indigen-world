# Make the whole video in TribeStudio

Update post for the TribeStudio video editor and its music and sticker library, built
2026-09-27/28. How it works: `docs/product/video-editor.md`; the library:
`docs/product/media-library.md`.

Status: **Draft. The editor is implemented and tested in the repository and NOT deployed.
The music and sticker library is live in production Firestore (published 2026-09-28).** Do
not publish until the checklist under *Before publishing* is done.

- Verified (2026-09-27/28):
  - End to end against the emulators, in the browser, with the exported files downloaded
    and inspected: a vertical 1080p reel (1080×1920, 20.0 s, −13.7 LUFS) and a landscape
    1080p High video (1920×1080, 20.0 s, −13.8 LUFS, true peak −1.4 dBFS) — titles,
    transitions, looks, stickers moved/resized/rotated with timing, music with fades and
    ducking, captions timed to a narration and transcribed from it.
  - A third export, made for this post's pictures (2026-09-29): landscape 1080p standard,
    1920×1080, 21.0 s, −13.5 LUFS, H.264 + AAC; its SHA-256 matched the renderer's record.
  - Renderer tests (24, including two real renders), TribeStudio tests (61) and validator.
  - Library: 50 tracks and 48 stickers, each checked (decoding, length, loudness, a
    listening check for voices; cut-out quality and lettering), published to production
    and served.
- Not verified: the editor on the deployed site (not deployed), with real signed-in
  creators, or on a tablet. AI scene generation was not exercised (cost). Long 1080p High
  exports have not been timed against the renderer's limit.

| Field | Value |
|---|---|
| Title | Make the whole video in TribeStudio |
| Topic | TribeStudio's new video editor: saved projects started from an idea, a script, footage or a recording; a scene timeline with transitions; 50 original instrumentals and 48 stickers; captions and lyrics timed to the voice in any language; preview renders; 1080p exports for TikTok, Reels, Shorts and YouTube. |
| Labels | `Release`, `Feature`, `TribeStudio`, `Video`, in that order |
| Search description | TribeStudio's new video editor: scenes, 50 original music tracks, 48 stickers, captions timed to your voice, and 1080p exports for every platform. (151 characters) |
| Permalink (custom) | `tribestudio-video-editor` |
| Reading time | about 4 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | The editor in a browser frame, beside the title | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/editor.jpg` | 1600×1150 | The whole editor, with the map pin sticker selected | `REPLACE-WITH-UPLOADED-editor.jpg` |
| 3 | `images/library.jpg` | 1600×1150 | The Music panel (Travel selected) and the Stickers panel | `REPLACE-WITH-UPLOADED-library.jpg` |
| 4 | `images/export.jpg` | 1600×1150 | The finished export playing in the export window, and three frames from the MP4 | `REPLACE-WITH-UPLOADED-export.jpg` |

Every image already has alt text and a caption in `post.html`.

**Where the pictures come from.**

- **Screens** (`screens/`): the editor running locally against the Firebase emulators, in
  headless Chrome at 1440×900 and 2× pixel density. The project is *Water for the dry
  season*, made for this post through the editor itself:
  - New video → From footage → Landscape, with the one photograph;
  - a title card and an end card, with fades;
  - the narration uploaded at 0:03, then Captions → Transcribe and time, in the Karaoke
    style. The transcription heard "Ton Yo Dam"; that one caption was retyped as "below the
    Tono dam." in the inspector;
  - *Postcards from the Coast* from the Music panel (Travel), ducking set to Medium;
  - the *Map pin* sticker, dragged, resized and rotated on the picture, shown from 4.2 s to
    11 s.
- **Export frames** (`screens/frame-*.jpg`): taken with FFmpeg at 1.6 s, 6.9 s and 19.6 s
  from the MP4 the renderer produced and the editor downloaded (1920×1080, 21.0 s,
  −13.5 LUFS, SHA-256 `127f1ddb…83e4a7`).
- **Photograph:** `apps/mobile/assets/places/tono-dam.png`, the only photograph used. It is
  the Tono dam irrigation channel by Apiu Akwojong Ezekiel,
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tono_Dam_AWC_Water_for_life_4.png),
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). It is 592×446, so it is
  soft at 1080p.
- **Narration:** a generated voice (Gemini TTS, `gemini-2.5-pro-tts`, voice *Kore*) reading
  three English sentences written for the post. The music and the sticker are the published
  library's.
- **Regenerating the figures:** `node apps/updates-blog/posts/2026-09-28-tribestudio-video-editor/mockups/render.mjs`
  (needs Google Chrome; re-frames what is already in `screens/`).

## Before publishing

1. **Deploy**, each with approval: Firestore and Storage rules; the ten video functions
   (`startVideoRender`, `retryVideoRender`, `cancelVideoRender`, `getVideoRenderUrl`,
   `copyVideoRenderForPost`, `deleteVideoProject`, `planVideoScenes`, `alignVideoCaptions`,
   `onVideoRenderDispatched`, `sweepVideoRenders`), explicit list and regenerated manifest;
   then TribeStudio hosting.
2. **Smoke test signed in** on the live site: a 20-second project, a preview, a 1080p
   export, download, post to TribeStudio.
3. Replace `[PUBLISHED_POST_URL]` in `share.md` after publishing.
