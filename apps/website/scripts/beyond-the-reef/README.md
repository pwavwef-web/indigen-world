# Beyond the Reef — media pipeline

`/beyond-the-reef` presents the song *Beyond the Reef* as an interactive music film: the recording,
lyrics that rise in time with it, and a visual journey (shore → reef → open water → storm →
discovery → horizon) made from generated stills and silent clips.

Everything in this folder runs **on a developer's machine, once**. The page ships only the
finished files in `apps/website/public/beyond-the-reef/`; a visitor's browser never calls an AI
service and never needs credentials.

## Where things live

| What | Where |
| --- | --- |
| Lyrics, word for word as written | `lyrics.txt` (this folder) |
| Lyric timing (plain data — edit by ear) | `src/features/beyond-the-reef/lyrics.ts` |
| Visual timeline: shots, clips, drifts, chapters | `src/features/beyond-the-reef/scenes.ts` |
| Timing math (pure functions) | `src/features/beyond-the-reef/timeline.ts` |
| Player, stage, lyric stream, controls | `src/features/beyond-the-reef/*.tsx`, `useSongPlayer.ts` |
| Page | `src/pages/BeyondTheReefPage.tsx`, styles in `src/styles/beyond-the-reef.css` |
| Prompts, the boat and the film's look | `plan.mjs` (this folder) |
| Shipped media | `public/beyond-the-reef/{audio,images,video}` |

Correcting a lyric time or moving a cut is a one-number edit in `lyrics.ts` or `scenes.ts`;
nothing else needs to change. `npm test --workspace @indigen-world/website` checks that the lyrics
still match `lyrics.txt` word for word, that times run forward, that shots cover the whole song
without gaps, and that every file the page names exists (and nothing unused ships).

## How playback stays in sync

- The `<audio>` element is the only clock. Lyrics and visuals subscribe to it and are redrawn
  from its `currentTime` on every animation frame while playing, and once after every pause,
  seek and restart. No independent timers.
- The audio ships twice with identical sound: `beyond-the-reef.m4a` is the supplied MP3's own
  frames remuxed into an MP4 container (stream copy, decoded samples bit-identical), listed
  first; `beyond-the-reef.mp3` is the original, listed as the fallback. Reason: browsers seek a
  VBR MP3 by estimating byte offsets. Measured in Chrome for this file, the sound landed up to
  ±1.1 s away from the `currentTime` it reported after a seek; with the MP4 container every seek
  landed within the measuring tool's own 40–50 ms latency.
- Video clips follow the song: each clip's position is derived from the song time and its
  playback rate, and it is only re-seeked when it drifts more than 0.35 s.

## Requirements (to regenerate)

- Node.js 22.12+ and the repository installed (`npm install`). `@google/genai` comes from the
  functions workspace.
- **Build the functions first**: `npm run build:functions`. Model names are not hard-coded here;
  they come from the functions' own config readers (`readKawuriMediaConfig`,
  `readIllustrationConfig`), so the same environment variables steer the product and this
  pipeline.
- **Google Cloud credentials** through Application Default Credentials:
  `gcloud auth application-default login` as an account with `roles/aiplatform.user` on the
  Vertex project, and the Vertex AI API (`aiplatform.googleapis.com`) enabled. There is no API key
  or service-account file, and none should be added to this folder.
- **ffmpeg** on `PATH`, in `FFMPEG_PATH`, or copied to the gitignored `.tooling/ffmpeg/`.
- **Google Chrome** (or `CHROME_PATH`) to render the social card with the site's font.
- Optional, for lyric timing: Python 3 with `pip install faster-whisper` (runs locally on CPU;
  downloads the `medium.en` model, about 1.5 GB, on first use).

| Variable | Default | Used for |
| --- | --- | --- |
| `VERTEX_PROJECT_ID` | `project-kassena-7e026` | Project billed for Vertex calls |
| `GOOGLE_CLOUD_LOCATION` | `global` | Gemini image and analysis endpoint |
| `VERTEX_VIDEO_LOCATION` | `us-central1` | Veo endpoint |
| `VERTEX_IMAGE_PRO_MODEL` / `VERTEX_IMAGE_MODEL` | `gemini-3-pro-image` / `gemini-3.1-flash-image` | Stills (best tier first) |
| `VERTEX_VIDEO_PLAN_MODEL` / `VERTEX_VIDEO_MODEL` | `veo-3.1-generate-001` / `veo-3.1-fast-generate-001` | Clips (standard model first) |
| `VERTEX_MEDIA_ANALYSIS_MODEL` | `gemini-3.8-flash` | Lyric verification |
| `BTR_WORK_DIR` | `.tmp/beyond-the-reef` | Raw generations (gitignored) |
| `BTR_SOURCE_AUDIO` | `public/beyond-the-reef/audio/beyond-the-reef.mp3` | The recording |
| `BTR_IMAGE_SIZE`, `BTR_CLIP_SECONDS`, `BTR_CLIP_RESOLUTION` | `2K`, `8`, `1080p` | Generation size |

## Steps

Run from the repository root.

```bash
# 1. Lyric timing: word timestamps (local), then alignment + Gemini check, then write lyrics.ts
python apps/website/scripts/beyond-the-reef/whisper-words.py
node apps/website/scripts/beyond-the-reef/align-lyrics.mjs --write

# 2. Stills (Nano Banana Pro), in dependency order: boat reference sheet first
node apps/website/scripts/beyond-the-reef/generate-stills.mjs

# 3. Silent clips (Veo, image-to-video from each still); billed per second of video
node apps/website/scripts/beyond-the-reef/generate-clips.mjs

# 4. Web encodes: WebP stills, VP9 + H.264 clips, poster/rest frames, audio remux, social card
node apps/website/scripts/beyond-the-reef/encode-media.mjs
```

Every step skips work that already exists; pass ids (`generate-stills.mjs 03-city`) to limit it,
or `--force` to redo it. A Veo job's operation name is saved the moment Veo accepts it, so an
interrupted run resumes waiting instead of paying for the clip again.

## How the lyric times were made

Asking Gemini for timestamps directly was tried first and rejected: over the whole song it
invented evenly spaced times that ran past the end of the recording, and on short windows it heard
the words correctly but placed them about 1.5 s late. Whisper's word timestamps were then aligned to
`lyrics.txt` with a global sequence alignment, checked with 2.6-second Gemini cuts at every line
start, and a handful of lines were corrected by hand from that evidence (`OVERRIDES` in
`align-lyrics.mjs`, each with its reason). A 0.15 s lead is applied so a line lights just before it
is sung.

**Still worth a listen:** the choir post-chorus (4:23–4:43: "Carry the language … Beyond the reef"),
"...Yeah." (3:27) and the outro's "I built a boat from restless dreams" (4:51) were the hardest to
hear through the mix and are the most likely to want a nudge.

## Generated media

All stills: `gemini-3-pro-image` (2K, 16:9) with the boat reference sheet attached, so every frame
carries the same canoe, lantern and traveller. All clips: `veo-3.1-generate-001`, 8 s, 1080p,
`generateAudio: false`, image-to-video from the matching still.

Veo's third-party-content check refused the first attempts at three clips whose prompts described
glowing sparks around a canoe at night. `02-stars` and `13-island-mist` passed once reworded in a
plain documentary register; `16-nightfall` was refused from its frame however it was worded, so that
shot is a still with a camera drift.

People appear only as one adult traveller seen from behind; no faces, no text, no real places or
cultural regalia are depicted. The page credits the imagery as generated with Google's Gemini and
Veo models.
