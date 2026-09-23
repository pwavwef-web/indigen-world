# Beyond the Reef — Video Export Pipeline

This tooling captures the finished, canonical *Beyond the Reef* web experience into two standalone, production-ready MP4 music videos:
1. **YouTube version (16:9)**: `exports/beyond-the-reef/beyond-the-reef-youtube-16x9.mp4` (1920 × 1080, 30fps)
2. **TikTok / Reels / Shorts version (9:16)**: `exports/beyond-the-reef/beyond-the-reef-vertical-9x16.mp4` (1080 × 1920, 30fps)

---

## Non-Invasive Architecture

As required:
- Claude's original implementation in `apps/website/src/features/beyond-the-reef/`, `BeyondTheReefPage.tsx`, `lyrics.ts`, `scenes.ts`, and all media assets remain **100% untouched**.
- No production redeployment is needed.
- The pipeline runs entirely locally in this isolated `tools/beyond-the-reef-export/` folder.

---

## How it Works

1. **Deterministic Local Serving (`server.ts`)**:
   Starts an ephemeral static HTTP server pointing directly to the compiled web application in `apps/website/dist`. The server implements HTTP 206 Partial Content (range requests) ensuring stutter-free streaming and seeking for HTML5 `<video>` and `<audio>` elements.

2. **Clean Capture Environment (`capture.ts`)**:
   Launches headless Chromium at the exact target dimensions (`1920x1080` for 16:9 or `1080x1920` for 9:16). In the capture environment, browser chrome, scrollbars, mouse cursor, and interactive web player dock controls (`.btr-dock`) are omitted so only the cinematic film and rising lyrics appear.

3. **Sample-Accurate Start Synchronization**:
   - The page waits for all web fonts (`document.fonts.ready`), audio metadata, and opening media to be fully preloaded.
   - At playback start, a 1-frame visual marker is briefly rendered and `.btr-begin` is clicked.
   - FFmpeg detects this exact scene change timestamp $T_{marker}$ in the recorded stream. Trimming from $T_{marker} + \Delta t$ discards the entire loading screen and button preparation, beginning the video at the exact start of the cinematic experience ($t = 0.00$s).

4. **Direct Lossless Audio Muxing**:
   The pristine original audio (`apps/website/public/beyond-the-reef/audio/beyond-the-reef.mp3`) is muxed directly into the MP4 with FFmpeg using high-bitrate AAC (48 kHz, 320 kbps), guaranteeing exact sample-accurate synchronization across the full 5:16 song duration without audio drift.

5. **Encoding Specifications**:
   - **Video Codec**: H.264 (`libx264`, high profile)
   - **Pixel Format**: `yuv420p`
   - **Quality**: Constant Rate Factor `CRF 18` (crisp typography, zero blocking)
   - **Frame Rate**: `30 fps` constant frame rate (CFR)
   - **Audio Codec**: AAC (48000 Hz, 320 kbps stereo)
   - **Container**: MP4 with `-movflags +faststart` (web/streaming optimized)

---

## Usage

From the repository root:

```bash
# Export both YouTube (16:9) and TikTok/Reels/Shorts (9:16)
npm run export:beyond-the-reef

# Or export individually:
npm run export:beyond-the-reef:youtube
npm run export:beyond-the-reef:vertical
```

---

## Automated Validation & QA (`validate.ts`)

After encoding, each file is automatically inspected with FFmpeg for:
- Resolution compliance (`1920x1080` and `1080x1920`)
- Exact duration match against the canonical 315.98s track length
- Audio presence, sample rate (48000 Hz), and codec (AAC)
- Video codec (H.264 yuv420p)

Additionally, 5 visual QA milestone frames are extracted for verification:
- `000pct_beginning_intro.png` (~1.5s): Opening title transition, shore scene, first sung lyric ("I built a boat from restless dreams")
- `025pct_verse_chorus_sync.png` (~78.0s): Chapter 04 ("Beyond the Reef")
- `050pct_midpoint_nightfall.png` (~158.0s): Chapter 07 ("Nightfall" transition)
- `075pct_discovery_dawn.png` (~237.0s): Chapter 09 ("Discovery", island mist, choir section)
- `100pct_ending_finale.png` (~314.5s): Outro boat scene, finale resolution
