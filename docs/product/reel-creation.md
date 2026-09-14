# New reel: the three-stage creator

How a member makes a reel in the mobile app after the 2026-09-14 upgrade, what
it writes, what the backend must do to finish the job, and what is still not
built.

Code: `apps/mobile/lib/features/explore/create_reel_screen.dart` (the frame) and
`apps/mobile/lib/features/explore/create_reel/` (everything else). Tests:
`apps/mobile/test/features/explore/create_reel/`.

## 1. The flow

Explore's **New reel** still opens `CreateReelScreen`, still behind sign-in and a
community profile (`explore_screen.dart` is unchanged). The one-page form became
three stages over one `ReelEditorController`, so moving between them loses
nothing.

| Stage | What the member does |
| --- | --- |
| **Media** | Record or choose a video, replace it, play/pause, trim start and end on a thumbnail timeline (playhead, reset, selected vs. maximum length), pick a cover (frame, current frame, uploaded picture, or automatic), keep or remove the original sound, add captions, and — for square and landscape clips — set the focal point on a preview drawn with Explore's own `ReelFramedMedia`, with a crop warning. One tool panel open at a time. |
| **Tell the story** | Under a small preview and "Give this reel meaning": caption (optional, 500 characters, line breaks kept, blank refused), topic (Storytelling, Music, Dance, Traditions, Food, Clothing, Craft, History, Community life, Other), community (searchable list of *joined* communities or none, with where it will appear), "What is happening?" (required, 10–1000 characters, feeds Explore's Context sheet), who made it (pre-filled with the member's name; or someone else plus an optional source organisation), and a required rights declaration. |
| **Review** | An Explore-accurate preview, a summary of every choice with Edit links back, problems with Fix links, the upload panel, and **Publish**. |

Limits come from where they are enforced, not restated: `CommunityMediaPicker.maxVideoDuration`
(3:00), `CommunityRepository.maxVideoBytes` (128 MB, matching the Storage rule)
and `CommunityRepository.maxPostLength` (500, matching the Security Rules — the
old form's 400 was stricter than the backend).

## 2. What is written

A reel is still an ordinary community post (`communityPosts/{id}`, or
`communitySpaces/{slug}/posts/{id}` for a private community), so likes, replies,
reporting, blocking and deletion work unchanged. Additions, all optional and
ignored by older app versions:

- **On the media item:** `trimStartMs`, `trimEndMs`, `originalSound: false`
  (only when removed), `captions {language, source, reviewed, cues[{startMs,
  endMs, text}]}` (≤ 300 cues, ≤ 200 characters each, stored inline — no caption
  files, so no Storage change), and `focalPoint {x, y}` (square/landscape only).
  `durationSeconds` is the *selected* length. The cover is a 720-px JPEG (or the
  uploaded picture) at `…/0_poster_<time>.<ext>` as `thumbnailUrl`.
- **On the post:** `reel {version: 1, topic, rights, context, originalCreator,
  sourceOrganisation, ownWork, draftId}`, and `category` mapped from the topic
  (`story`, `music`, `culture`, or none) so the feed rail and Explore's topic row
  work without learning new words.

Explore maps `reel.context` to the Context sheet's **Cultural context**,
`attributionLine` to **Creator's stated source**, the rights declaration to
**Permission**, and the topic to the card label (`DANCE`).

## 3. Trimming, sound and compression: played, not cut

The app's media stack (`image_picker`, `video_player`, `video_thumbnail`) has
**no transcoder**. So:

- The **whole recording is uploaded**. Trim points and the sound choice travel as
  data and are honoured at playback by `ClipWindowGuard` (`lib/core/clip_window.dart`)
  in the Explore card, the community feed's inline tile and the full-screen
  viewer. The progress bar and remaining-time label measure the selection.
- **Nothing is compressed on the phone.** There is no "Compressing" upload state,
  because nothing would be happening during it.
- **App versions older than this one play the full file with its sound**, and
  show no captions.

**Backend dependency (not built):** a Cloud Function (ffmpeg or Transcoder API)
that, for media with `trimStartMs`/`trimEndMs`/`originalSound: false`, renders a
trimmed, compressed, optionally silent file, replaces `url`/`storagePath`, clears
the trim fields, and **shifts caption cue times by `trimStartMs`** (cues are in
the original file's time). Until it exists, a 10-minute clip trimmed to 3:00
still costs its uploader and its viewers the full file, up to 128 MB.

## 4. Drafts and publishing

- **Drafts live on the phone** (`LocalReelDraftStore`): text and choices in shared
  preferences (`explore.reelDrafts.v1`), files in
  `<documents>/reel_drafts/<draftId>/`. There is no remote draft storage in the
  architecture, and uploading unpublished recordings would spend members' data.
  The picked file is *moved* (renamed) out of the picker's cache once, never
  re-copied. Text autosaves 800 ms after typing stops, on every stage change,
  before a picker opens, and when the app goes to the background. Save draft,
  resume (drafts sheet or the "Resume a draft" row), delete with confirmation,
  and "Edited today at 14:05" are all there. A draft whose video file vanished
  resumes without its video and says so.
- **Publishing** (`ReelPublisher`) goes Preparing → Uploading (real bytes from the
  Storage task; Pause/Resume/Cancel) → Processing (cover, then the post) →
  Published, with Retrying and Failed/Cancelled in words. The post id is reserved
  and saved *before* the first byte; the uploaded video's path is saved as soon as
  it lands; `writeAttempted` is saved just before the document write. So a retry
  does not re-send a stored video, and a retry after a write that landed unheard
  finds the post instead of making a second one. A second tap while publishing
  does nothing. Membership of the chosen community is checked against the server
  before writing.
- **Leaving** mid-upload offers Continue upload / Save and leave / Cancel upload;
  leaving with work offers Keep draft / Discard (confirmed).
- **Not recoverable:** an upload interrupted by the process dying restarts from
  byte zero next time — the Flutter Storage plugin exposes no resumable session
  that survives a restart. What survives is everything already recorded above.

## 5. Captions

Upload `.srt`, `.vtt` or `.txt` (≤ 512 KB). A transcript's lines are spread over
the selection and marked "timing estimated". Captions can be written and timed
against the preview in the caption editor, with a language (Kasem, English,
French, Twi, Hausa, or typed). **Captions are published only after the creator
ticks "I have checked these captions match what is said"**, and any later edit
unticks it. There is **no automatic generation**: no transcription service exists
in the project. `CaptionSource.automatic` exists so that, when one is added, its
captions are hidden until reviewed (`CaptionTrack.isShowable`).

## 6. Backend changes and deploys

| Area | Change | Deploy |
| --- | --- | --- |
| Firestore rules | `validReelDetails` on both post create rules: `reel` optional; when present, only the known keys, known topic, `rights` required and known, text limits, and "someone else made it" cannot be declared "created". Verified against the emulator (13 cases, incl. private-community posts and posts without `reel`). | **Deployed 2026-09-14** with release 0.1.19 (28) |
| Firestore indexes | None — no new queries. | — |
| Storage rules | None — video ≤ 128 MB and image ≤ 12 MB already cover the video and cover; captions are inline. | — |
| Functions | None required to ship. The render function in §3 is future work. | — |
| Migration | None. Old posts have no `reel` and read exactly as before. | — |

The rights declaration has been enforced server-side since that deploy.

## 7. Not built in this iteration

Text overlays, filters, stickers, voiceover mixing, a licensed music catalogue,
transitions, multi-clip sequencing and AI effects all need a video rendering
pipeline (on the phone or server) that does not exist; faking them with overlays
that older clients and the community feed cannot draw would split one reel into
several different-looking ones. They wait on the render function in §3.

Also not done: caption display in the community feed's inline tiles (Explore
shows them); the admin Reports screen does not surface `reel` details; and no
review-desk step — community reels publish immediately, like every community post.

## 8. Verified, and not

Tests (108 in `test/features/explore/create_reel/`): validation messages for every
rule, draft JSON round trips, the on-device store (move, delete, vanished files,
corrupted store, racing saves), SRT/VTT/transcript parsing, clip-window playback
correction, the publisher's phases, real byte progress, retry without re-upload,
duplicate prevention, cancel, pause/resume, cover failure, community refusal, the
controller (cancelled pick, oversized/unsupported file, long clip auto-trim,
timeline, covers, sound, stages, autosave, resume, delete, publish), the caption
editor, and the whole screen on a 320×568 phone with a 260-px keyboard (no
overflow; the action bar steps aside). Also a render check of all three stages at
360×760, and the Firestore rules on the emulator.

Found and fixed by those checks: the drafts sheet crashed in debug builds when a
draft was deleted; the action bar never hid for the keyboard; the creator name
pre-fill could miss a late profile; the community picker overflowed on short
phones; the stepper cut "Tell the story" on narrow phones.

**Not verified:** recording and gallery selection on a real device or emulator,
real video decoding for the timeline and covers, real Storage uploads, pause and
resume against Firebase, and backgrounding mid-upload. Those need a signed-in
account on a device.

`apps/mobile/integration_test/reel_media_device_test.dart` covers the native half
without signing in: probing real portrait and landscape clips, refusing `.avi`,
corrupt and oversized files, timeline frames, cover JPEGs, moving a clip into a
draft folder, and the real player looping inside a trim. It has **not run yet**:
two attempts on the Pixel 7 emulator on 2026-09-14 died of memory exhaustion on
the build machine (Gradle's 8 GB heap plus the emulator on 16 GB). To run it with
nothing else open:

```bash
cd apps/mobile
flutter test integration_test/reel_media_device_test.dart -d emulator-5554 --flavor development --dart-define=APP_ENV=development
# when the log says "REEL_DEVICE waiting", from another terminal:
adb push portrait.mp4 /sdcard/Android/data/world.indigen.mobile.dev/files/portrait.mp4
adb push landscape.mp4 /sdcard/Android/data/world.indigen.mobile.dev/files/landscape.mp4
```

A test build regenerates `GeneratedPluginRegistrant.java` with `integration_test`;
build release bundles with `npm run build:mobile-aab`, which removes it.
