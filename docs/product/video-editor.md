# TribeStudio video editor

Repository status: implemented and tested 2026-09-27/28; **functions, rules and TribeStudio hosting deployed 2026-09-30**. The music and
sticker library it draws on **is live** in production Firestore (see
[media-library.md](media-library.md)). See "Going live" below.

## What it is

A project-based editor at `/studio/editor` (the list) and `/studio/editor/:projectId`
(one project). It replaced the old in-browser editor, which kept nothing when you left,
recorded exports in real time as WebM, split captions evenly with no audio sync, and had
no music, stickers or server renderer.

**Starting points** (New video): from an idea (the planner writes scenes), from a script
(split into scenes word for word; the planner never rewrites or invents Kasem), from
footage (each clip or picture becomes a scene; clips shaped differently from the frame get
a blurred fill), from a recording (a title card plus scenes laid over the audio), a blank
project, or a finished AI Video job (`?job=`).

**Panels**: Scenes (plan fields, AI make/remake per scene with cost estimates, reorder,
duplicate, delete, title/end cards), Media (upload, record narration, import AI videos,
replace a scene's picture), Music, Stickers, Text (titles, name-and-place, labels, cards),
Captions, Sound (levels and how far music dips under speech: off/light/medium/strong),
Continuity (people, places, objects and branding kept the same across AI scenes).

**Timeline**: a magnetic scene track with transitions centred on each cut (cut, fade,
flash, slide, wipe), lanes for text, stickers, captions, voice and music; drag to move,
drag edges to trim, Alt+←/→ to reorder a scene, S to split, Delete, Ctrl/⌘Z/Shift+Z.

**Stage**: the preview draws scenes with their transitions, looks (vivid, warm, cool,
mono, dusk), Ken Burns and fit; text, stickers and captions on a canvas in layer order;
music and voice with fades and ducking. Stickers are dragged, resized from the corner and
rotated from the knob; the inspector adds size, rotation, opacity, mirror, entrance and
exit animation, timing, layer order, duplicate and delete.

**Captions and lyrics**: time supplied words to any audio in the project (a script or
lyrics in any language, Kasem included — FFmpeg finds *when* speech happens, not what is
said), or transcribe English or French. Both are a first pass: every cue is editable on
the timeline and in the list, with ±0.1 s shifts and a tap-along mode. Styles: subtitle,
bold words, karaoke (the spoken word lights up), minimal.

**Export**: Preview render (540 px short side, fast) and Export at 720p or 1080p, Standard
or High, in 9:16 (TikTok, Reels, Shorts, WhatsApp Status), 1:1 (feed posts) or 16:9
(YouTube, websites). Progress, cancel, retry, a checked result (size, resolution,
duration), download, "Post to TribeStudio", and the project's export history. Final
exports are loudness-normalised for social platforms (about −14 LUFS).

## How it works

| Piece | Where |
| --- | --- |
| Editor UI | `apps/tribestudio/src/creator/editor/` (model, stage, timeline, panels, inspector, export) |
| Renderer | `services/functions/src/video-editor/` (render spec, plan, looks, animation, captions, planner, worker) |
| Projects | `videoProjects/{projectId}` (+ `media` subcollection), owner-only; `lastRender` is server-written |
| Renders | `videoRenders/{uid}_{requestId}` (idempotent), dispatched through `videoRenderDispatches` |
| Library | `videoMusicTracks`, `videoStickers` (published rows are world-readable) |
| Storage | `video-projects/{uid}/{projectId}/media/…`, `…/layers/{requestId}/…`, `video-renders/{uid}/{renderId}/…`, `media-library/…` |

Functions: `startVideoRender`, `retryVideoRender`, `cancelVideoRender`, `getVideoRenderUrl`,
`copyVideoRenderForPost`, `deleteVideoProject`, `planVideoScenes`, `alignVideoCaptions`,
the trigger `onVideoRenderDispatched` (FFmpeg via `ffmpeg-static`; 8 vCPU, 16 GiB, 540 s,
no automatic retry, leases), and the scheduled `sweepVideoRenders` (every 10 minutes:
lost workers, stuck queues, 30-day expiry, and layers left by exports abandoned mid-upload).

The browser draws text, captions and cards as PNG layers for the chosen frame and uploads
them three at a time; an upload that makes no progress for 20 s is cancelled and retried
twice before the member is told. The server composes everything else — scene trims, speed
and fit, looks as colour matrices, transitions with `xfade`, sticker transforms and
animation, the caption frames, and a music bus that dips under every voice recording —
then probes the file and only then marks it finished.

## Verified

- Renderer suite (`firebase/tests/videoEditor.test.mjs`): 24 tests, including a real 9:16
  and a real 16:9 render checked for size, length, sticker pixels, caption presence and
  music levels. TribeStudio's suite (61 tests, including the editor model's) and its
  validator pass.
- End to end against the emulators (2026-09-27/28), in the browser, with the files
  downloaded and inspected:
  - **Vertical reel**, 9:16 1080p Standard: 1080×1920, 20.0 s, H.264 + AAC, −13.7 LUFS;
    captions timed to the narration, a sticker moved, resized to 45 % and rotated 30°
    with pop-in/fade-out timing, a label sticker, music ducked to about −25 dB in speech
    pauses, 2.5 s fade-out.
  - **Landscape video**, 16:9 1080p High: 1920×1080, 20.0 s, −13.8 LUFS, true peak
    −1.4 dBFS; title card, fade, wipe, slide and flash transitions, a warm look, a portrait
    clip over a blurred fill, karaoke captions *transcribed* from the narration (word for
    word), a lower third, two stickers, strong ducking (about −37 dB in pauses).
- Fixed during that pass: dialog layout and backdrop, handle and button sizes clashing with
  the studio shell, a media row whose delete button covered the file (a click deleted the
  upload), photo scenes cancelling sticker drags (native image drag), "Export in full
  quality" staying in preview mode, title cards appended at the end, replaced cards keeping
  their name, stalled layer uploads, the music list's layout and waveform, and sticker and
  text layers invisible on their first frame.

## Limits

- One render: up to 5 minutes, 80 layers, 1,200 caption frames, 1.5 GB of source media.
  Long 1080p High exports have not been timed against the 540 s ceiling.
- Transcription is English and French only and takes about half a minute for a short clip;
  Kasem needs its words supplied (then timing works).
- The preview plays levels above 100 % at 100 %; the export applies them. Fonts and
  anti-aliasing can differ slightly between the preview canvas and the export.
- AI scene generation uses TribeStudio's existing AI Video jobs and allowance; it was not
  exercised in the end-to-end pass (cost).
- The Firebase Storage emulator can drop a response under concurrent uploads; the uploader
  now retries, but it is an emulator quirk worth knowing when testing locally.

## Going live

1. Rules: `firebase deploy --only firestore:rules,storage` (videoProjects, videoRenders,
   dispatches, library collections; the Storage paths above).
2. Functions, with an explicit list: the ten above (`startVideoRender … sweepVideoRenders`)
   — build the unpatched bundle; ensure `services/functions/functions.yaml` is absent and port 8791 is clear.
3. TribeStudio hosting from the approved deploy worktree, using the single-site config after a successful build/check; this deployment was not committed or pushed.
4. Signed-in smoke test: make a 20-second project, preview, export 1080p, download.

### Deployment evidence — 2026-09-30

- Deployed only from `C:/Users/DELL/Desktop/indigen-world-deploy`, branch `deploy/2026-09-29-loop-editor`: main `f1519fe`, uncommitted merge of `c463581`, plus transplanted editor/language-loop changes. Everyday Expressions UI was excluded from TribeStudio. No commit, push, reset or merge abort was performed.
- Firestore rules/indexes and Storage rules deployed with exit 0. All ten video functions created successfully with exit 0. TribeStudio hosting subsequently deployed with exit 0; its temporary single-site config was deleted after deployment.
- All eight callable probes (`startVideoRender`, `retryVideoRender`, `cancelVideoRender`, `getVideoRenderUrl`, `copyVideoRenderForPost`, `deleteVideoProject`, `planVideoScenes`, `alignVideoCaptions`) returned HTTP 401 and JSON `UNAUTHENTICATED` / "Sign in is required.". No HTML 403 or invoker repair was needed.
- `npm run build:console-ui` and `npm run check:tribestudio` passed: typecheck, validator, 59/59 tests, and production build. Live `/studio/editor` returned HTTP 200; entry `index-Bx880A3t.js` points to the deployed build. Live `EditorPage-E9AoZg16.js` returned HTTP 200, contains "Transcribe and time", and exactly matches the local built asset.
- Final `firebase functions:list` succeeded: 146 before, 157 after. Added: `requestQueueWord`, `alignVideoCaptions`, `cancelVideoRender`, `copyVideoRenderForPost`, `deleteVideoProject`, `getVideoRenderUrl`, `onVideoRenderDispatched`, `planVideoScenes`, `retryVideoRender`, `startVideoRender`, `sweepVideoRenders`. Removed: none.
- Functions bundle SHA-256 remained `be7564bf2025e3ce271efe948057cefd9ee4176448871c61e339919be26c2f69` (unpatched). Deploy logs and probes are retained in the deploy worktree.

Authenticated production project creation, rendering and download have not been exercised in this deployment. The signed-in smoke test above remains pending. `submitExpression`, WhatsApp support functions, the website and knowledge-workspace functions were not deployed. Everyday Expressions remains a separate pending release. Production now differs from `origin/main`; commit and PR the deploy branch only on the owner's request.
