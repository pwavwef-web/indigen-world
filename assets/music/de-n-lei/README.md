# De N Lei — Come Learn Kasem

Source audio: `C:\Users\DELL\Music\Music\De N Lei — Come Learn Kasem.wav`, supplied with the request on 2026-09-23. The 48 kHz stereo WAV runs 3:01.2. Its embedded comment says “made with suno”; it does not identify human performers. The Music credit is **Indigen World**, as requested. The MP3 here is a playback copy encoded with FFmpeg `libmp3lame -q:a 2`; `lyrics.txt` preserves the supplied text and performance cues.

`cover.png` was generated for this song with the built-in image generation tool. It illustrates a teacher and group learning together and carries the exact title. It depicts a scene, not documented performers. Prompt:

> Create a square, warm editorial illustration for “De N Lei — Come Learn Kasem”: a welcoming outdoor communal learning circle, one teacher and a multigenerational group responding, acoustic guitar and modest percussion, golden late-afternoon light, tactile paper texture, legible title and subtitle, no logos, flags, invented symbols, or additional words.

Run `node firebase/seed/seed-de-n-lei.mjs` to validate the local assets and preview the target. Add `--commit` to publish to the configured Firebase project after reviewing the target and metadata. This does not deploy an app binary. The mobile Music collection reads published audio records from Firestore and shows the lyrics from `body`.
