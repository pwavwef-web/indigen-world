# Video music and sticker library

Status: **50 music tracks and 48 stickers published to production** (`videoMusicTracks`,
`videoStickers`, Storage `media-library/`) on 2026-09-28. The editor that uses them is not
deployed yet — see [video-editor.md](video-editor.md).

Nothing is hard-coded: the editor lists whatever is published in Firestore today.

## Where it came from

Generated through **AZ Studio's job API** (the separate `az-learner` project), driven the
way its own acceptance suite drives it: `prepareAll` + `createJobs` with a confirmed cost,
processed by AZ Studio's deployed worker, which records the spend against its limits. No
AZ Studio code is copied into this repository and nothing here imports it; the driver is
compiled against an AZ Studio checkout at run time.

| | Music | Stickers |
| --- | --- | --- |
| Model | Lyria 3.5 (Gemini Developer API, via AZ Studio) | Nano Banana Pro — `gemini-3-pro-image` (Vertex AI, via AZ Studio) |
| Published | 50 instrumentals, 42–108 s each, 51.5 minutes in all | 48 stickers, up to 512 px, transparent |
| Grouped as | ten moods × five: cinematic, upbeat, warm, playful, reflective, suspenseful, ambient, travel, educational, promotional | reactions 8, labels 9, emphasis 7, arrows 6, celebrations 6, travel 6, playful 6 |
| Generations | 93 (retries included) | 85 (edits and retries included) |
| Estimated cost | about $7.40 at AZ Studio's $0.08 per song | at most about $11.80 (some refusals were not billed) |

Briefs: `tools/media-library/briefs/music.json`, `…/stickers.json`. Driver:
`tools/media-library/run-az-studio.mjs` (needs `AZ_STUDIO_DIR`; resumable; state in the
ignored `tools/media-library/.work/`).

## How every file was checked

**Music** (`publish.mjs verify music`): decodes; length 20–150 s; no long silences;
usable loudness; tempo measured (octave errors corrected against the brief); and a
listening check by Gemini (`gemini-3.8-flash`, majority of up to three listens) for any
human voice. A check that could not run (network, quota) is retried, never taken as a
verdict.

**Stickers**: generated on a flat green (or magenta) background and cut out by
`cutout.py` — flood fill from the edges, enclosed holes, soft edges, despill — then
checked: flat background, nothing cut off, sensible coverage, no key colour left, clean
edge, one piece, white border. Gemini reads any lettering letter by letter against the
brief. A human visual review is recorded in `tools/media-library/review/stickers.json`.

### What Lyria taught us

"Instrumental only" is not enough on its own. Takes in beat-making styles (afrobeats,
EDM) came back with imitation producer tags and DJ drops; a brief describing advertising
music produced a fake stock-library voice watermark; folk and work-song framings drew
humming. Recasting those briefs as a live band, a chamber piece, a film cue or a jazz big
band got clean takes. Lyria also often ignores a brief's instruments, so the editor shows
the listening check's description of each track rather than the brief's intended style.

## Terms (checked 2026-09-27)

Stored on every row as `license` and shown in the editor under "Conditions of use":

- **Music**: AI-generated with an inaudible SynthID watermark — not to be presented as
  composed or performed by a person; not exclusive (Google claims no ownership but may
  generate similar music for others) — not to be claimed as one's own composition or
  registered with Content ID; Google's Generative AI Prohibited Use Policy applies; library
  rule: for use inside videos made with TribeStudio, not for release on its own.
- **Stickers**: AI-generated with SynthID (the cut-out copy no longer carries the
  original's C2PA credentials); not exclusive — not to be registered as one's own
  trademark or artwork; the Prohibited Use Policy applies.

Sources: Gemini API and Google Cloud service terms, and the Generative AI Prohibited Use
Policy (URLs are on each row).

## Publishing again

```bash
node tools/media-library/publish.mjs verify music
node tools/media-library/publish.mjs publish music --production
```

Publishing is idempotent and refuses production without `--production`; with
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST` set it publishes to the
emulators instead. A track or sticker that no longer passes its checks is hidden, and a
sticker listed under `rejected` in the review file is never published.
