# Kawuri media on Vertex AI

Status: implemented, tested and **deployed on 2026-09-14**: Firestore rules and indexes, Storage rules, 10 new functions and 7 updated ones. The app side ships in 0.1.20 (29); see `docs/product/releases/0.1.20+29.md`. The optional lifecycle rule is not applied.

Kawuri's four media tools are backed by real Vertex AI models: image generation, video generation, English speech-to-text, and image/video/audio analysis. Nothing is mocked in production. The only stand-in is `emulatorFake()` in `kawuri-vertex.ts`, and it switches on only inside the Functions emulator on a `demo-` project.

## Architecture

The architecture is the same one `kawuriChat` and the Studio's Veo generator already use:

- Firebase callables run in `us-central1`.
- They authenticate the member with Firebase Auth, which the callable framework verifies from the ID token.
- They call Vertex AI as the functions runtime service account, through Application Default Credentials.
- There is no API key, service-account file or provider token anywhere, and none in the app.

| Piece | File |
|---|---|
| Rules: config, validation, schemas, error codes, capabilities, timeouts | `services/functions/src/kawuri-media-policy.ts` (Firebase-free, unit-tested) |
| Vertex adapter (official Google Gen AI SDK `@google/genai` 2.22.0) | `services/functions/src/kawuri-vertex.ts` |
| Callables, recovery sweep, Storage/Firestore wiring | `services/functions/src/kawuri-media.ts` |
| Shared AI-video spend ceilings (moved out of `studio-video.ts`) | `services/functions/src/studio-video-policy.ts` → `VIDEO_SPEND_LIMITS` |
| App: capability manifest, repository, providers | `apps/mobile/lib/features/kawuri/kawuri_media_{models,repository}.dart` |
| App: create image/video, creation detail, library, voice input, analysis card | `kawuri_create_screen.dart`, `kawuri_creation_screen.dart`, `kawuri_library_screen.dart`, `kawuri_voice_input.dart`, `kawuri_analysis_card.dart` |

**Why the SDK here and REST elsewhere.**

- `kawuriChat` and the Studio Veo adapter hand-roll REST calls. Both are deployed and working, so they were not rewritten in this change.
- The new tools use the Gen AI SDK because it is the supported client for Gemini image output, JSON-schema output and Veo long-running operations.
- The deprecated `@google-cloud/vertexai` SDK is not used anywhere.
- The SDK retries nothing unless asked. Generation calls are never given retry options, because a retry would be a second bill. Operation status checks retry, because they are free.

## Callables

| Logical operation | Callable | Billable |
|---|---|---|
| getKawuriCapabilities | `getKawuriCapabilities` | no, and guests may call it |
| createImageGeneration | `createKawuriImage` | yes |
| createVideoGeneration | `createKawuriVideo` | yes |
| getAiTask | `getKawuriTask` | no; also advances an in-flight video |
| cancelAiTask | `cancelKawuriTask` | no |
| transcribeEnglishAudio | `transcribeKawuriAudio` | yes |
| analyseMedia | `analyseKawuriMedia` | yes |
| listRecentCreations | `listKawuriCreations` | no |
| deleteAiCreation | `deleteKawuriCreation` | no |
| (recovery) | `sweepKawuriTasks`, every 2 minutes | — |

**Idempotency.** Every billable request carries a `requestId`, and the task lives at `kawuriTasks/{uid}_{requestId}`. A retry or double tap reads the existing task. A task is claimed inside a transaction, so taps that arrive together buy one generation. Only a task that never reached Vertex (`billed: false`) and has failed, or has been abandoned for more than 3 minutes, may run again.

**App Check.**
- Enforced when `ENFORCE_APP_CHECK=true`, the same switch the rest of the backend uses. It is currently unset.
- When it is on, billable callables also consume their token, and the app already sends a limited-use token on exactly those calls.

## Models (confirmed live on `project-kassena-7e026`, 2026-09-14)

| Use | Default | Endpoint | Fallback |
|---|---|---|---|
| Image | `gemini-3.1-flash-image` (GA) | `global` | `gemini-2.5-flash-image` |
| Video | `veo-3.1-fast-generate-001` (GA) | `us-central1` | none |
| Video, creator-tools plan | `veo-3.1-generate-001` (GA) | `us-central1` | — |
| Transcription | `gemini-3.8-flash` (GA) | `global` | `gemini-2.5-flash` |
| Analysis and pre-generation screening | `gemini-3.8-flash` (GA) | `global` | `gemini-2.5-flash` |

**Where each model runs.** On this project, Gemini 3.x models answer only on the `global` endpoint, and Veo answers only on regional endpoints. That is why video has its own location.

**Fallback.** A model that answers 404 or "unsupported region" is skipped to the next model and remembered for 10 minutes. When every model in a chain is failing, the capability manifest reports `model_unavailable`.

## Environment variables

All are optional, and all are server-side (`services/functions/.env`). Do not set `GOOGLE_CLOUD_PROJECT`; the runtime reserves and sets it.

```
VERTEX_PROJECT_ID=                 # empty = the functions project
GOOGLE_CLOUD_LOCATION=global
VERTEX_VIDEO_LOCATION=us-central1
VERTEX_IMAGE_MODEL=gemini-3.1-flash-image
VERTEX_IMAGE_FALLBACK_MODEL=gemini-2.5-flash-image
VERTEX_VIDEO_MODEL=veo-3.1-fast-generate-001
VERTEX_VIDEO_PLAN_MODEL=veo-3.1-generate-001
VERTEX_TRANSCRIPTION_MODEL=gemini-3.8-flash
VERTEX_MEDIA_ANALYSIS_MODEL=gemini-3.8-flash
VERTEX_TEXT_FALLBACK_MODEL=gemini-2.5-flash
VERTEX_OUTPUT_BUCKET=              # empty = default Firebase bucket
KAWURI_DISABLED_CAPABILITIES=      # e.g. videoGeneration,speechToText
```

**Constraint on video models.** A video model must appear in the Veo price table in `studio-video-policy.ts`. The spend ceilings are in cents, so an unpriced model is reported as unavailable rather than guessed at.

## APIs and IAM

All of these were verified present on 2026-09-14:

- `aiplatform.googleapis.com` is enabled, and billing is enabled.
- The runtime SA `111428711822-compute@developer.gserviceaccount.com` has `roles/editor`, which covers `roles/aiplatform.user`.
- The same SA has `roles/iam.serviceAccountTokenCreator` on itself. Signed creation links need this.
- `cloudscheduler.googleapis.com` is enabled. The sweep needs it.
- The Vertex AI service agent can read the project's own bucket. Files over 7 MB go to Gemini as `gs://` URIs; this was proven with real calls.

Minimum roles if Editor is ever removed:

| Role | Needed for |
|---|---|
| `roles/aiplatform.user` | Vertex calls |
| `roles/iam.serviceAccountTokenCreator` on the SA itself | signed URLs |
| `roles/datastore.user` | task records |
| `roles/storage.objectAdmin` on the bucket | uploads and creations |
| `roles/firebasecloudmessaging.admin`, or the default FCM access | push |

Vertex quota cannot be read in advance. A 429 from Vertex becomes `QUOTA_EXCEEDED`, and the task shows "Kawuri is very busy".

## Data

**Firestore `kawuriTasks/{uid}_{requestId}`.** The shared task record has these fields:

- identity and grouping: `id, userId, conversationId, type, category, listed, status`
- provider and request: `model, provider:'vertex', prompt, negativePrompt, sourceMedia[], outputMedia[]`
- progress: `operationName` (the full Vertex name, persisted as soon as Veo answers), `progress` (null unless Vertex reports a percentage; Veo does not)
- options: `aspectRatio, duration, resolution, language, intention`
- results: `result`, `turns[]` (analysis)
- outcome: `errorCode, errorMessage, moderationStatus, aiGenerated, billed`
- timestamps: `createdAt, updatedAt, completedAt`

Details:

- **Types:** `image_generation`, `video_generation`, `speech_to_text`, `image_analysis`, `video_analysis`, `audio_analysis`.
- **Statuses:** `draft`, `uploading`, `queued`, `generating`, `processing`, `ready`, `failed`, `rejected`, `cancelled`, `expired`.
- **No base64 in Firestore.** Images and videos live in Storage, and the record holds the path, MIME type, size, dimensions and the AI-generated flag.
- **Transcripts** are kept for 24 hours (`purgeAfter`) so a retry can be answered, then the sweep deletes the record.
- **Billing records.** Billable attempts are also written to `auditLogs` (`action: kawuri.<type>`), which outlives a deleted creation.

**Rules (`firebase/firestore.rules`).** The owner reads `kawuriTasks`. Nobody else does, staff included, and no client writes.

**Indexes (`firebase/firestore.indexes.json`, 3 new).**
- `(userId, listed, createdAt desc)`: Recent and "All"
- `(userId, category, createdAt desc)`: library filters
- `(status, createdAt asc)`: the sweep

The emulator does not enforce composite indexes, so a missing one fails only in production.

**Storage (`firebase/storage.rules`).**
- **`kawuri-uploads/{uid}/{audio|media|reference}/{uploadId}/{fileName}`:** owner create-once and owner read, typed and sized per purpose. Audio is under 10 MB; reference images are under 20 MB; media is under 20 MB for images, 200 MB for video and 25 MB for audio. This path is temporary. Transcription audio is deleted when the request ends.
- **`kawuri-creations/{uid}/{taskId}/{file}`:** the owner reads, and only the backend writes. It is never expired; a creation is removed only by `deleteKawuriCreation`.
- **Lifecycle backstop:** `firebase/storage-lifecycle.json` deletes anything under `kawuri-uploads/` after 7 days. It is not applied yet (see below). The bucket currently has no lifecycle rules, so applying it replaces nothing.

## Limits, safety and cost (nothing invented)

**Allowance.**
- **Image, transcription and analysis** each spend one message from the member's existing Kawuri allowance: the per-minute limit plus `TIER_BENEFITS.kawuriDailyMessages`.
  - **Product decision still open:** there is no image-specific quota or price in the billing configuration, so an image currently costs the same as a chat message against the allowance.
- **Video** requires an approved creator (`role` claim) or an active `creator` plan (`creatorTools`), plus explicit `confirmSpend: true`.
  - It spends from the Studio's existing ceilings: 3 per 10 minutes, 20 per day and 2,000¢ per day per person; 250 per day and 25,000¢ per day platform-wide.
  - Those buckets are shared, so one allowance covers both surfaces.
  - The fast model is the default. The standard model is offered only to `creatorTools` plans.
  - Resolution follows the Studio rule: 1080p for landscape, 720p for portrait.
  - **Sound (added 2026-09-14).** The request carries `generateAudio`; only an explicit `true` turns Veo's soundtrack on, because builds up to 0.1.20 never send it and tell the member their video is silent. The capability manifest advertises `videoAudio`, and the app shows a Sound switch (on by default) only when it does. Any speech Veo makes is not Kasem, and the switch says so. Spend is charged at the published with-audio rate ($0.40/s standard, $0.15/s fast) whether sound is on or off, so the switch can never push a member past a ceiling. The Studio still generates silent video.
  - **People of every age (added 2026-09-14).** Image and video requests ask Vertex for `ALLOW_ALL` / `allow_all` first. If Vertex refuses the setting itself (Veo gates `allow_all` behind a Google allow-list), the adapter steps down to adults-only and remembers that for ten minutes. A refused setting is an invalid argument and is not billed. A Veo job that fails on the setting after it has started marks it refused for the retry. Live check on 2026-09-14: `gemini-3.1-flash-image` accepted `ALLOW_ALL` and drew a family with children. Veo's `allow_all` has not been tried live.

**Screening.**
- Every image and video request, reference image included, passes a platform screen (`MODERATION_INSTRUCTION`) before anything is bought. If the screen cannot give a readable answer, the request is refused.
- The screen exists because Vertex's own filters allowed a photorealistic "head of state arrested, with injuries" image in a live test.
- Refusals cover:
  - real, identifiable people, adults or children
  - children in sexual, suggestive, violent, abusive or frightening scenes (children in ordinary scenes are allowed: family, school, play, folktales)
  - sexual content
  - gore
  - hate
  - realistic news or politics
  - sacred rites presented as documentation
- Vertex safety blocks and filtered videos also end as `rejected`.

**Media checks.**
- **Speech-to-text** is English only. The request must say `en`, and the language actually spoken must also be English. Kasem or French speech is refused with the English-only message. Limits are 2 minutes and 10 MB, and the length is read from the file's own header.
- **Analysis** keeps observations, possible context and uncertainty in separate fields. `requiresCommunityVerification` is forced on whenever interpretation or language guesses appear, and the prompt forbids stating identity, ethnicity, language, ritual, place or history as fact. A translation question inside an analysis is grounded through `dictionaryContextFor`, just as chat is.

**Failure and recovery.**
- A task never stays in flight forever. Limits are 10 minutes for images, 30 minutes for video and 5 minutes for speech; a video with no operation after 5 minutes has failed. `getKawuriTask` and the sweep end stale tasks.
- A video resumes from its persisted operation name on any instance.
- Finished or failed videos push to the existing `indigen_account` channel. The notification opens `/kawuri/creations/{taskId}`.

**Stable error codes.**

| Area | Codes |
|---|---|
| Vertex and model | `VERTEX_AUTH_FAILED`, `VERTEX_API_DISABLED`, `MODEL_UNAVAILABLE`, `UNSUPPORTED_REGION`, `QUOTA_EXCEEDED` |
| Limits and eligibility | `RATE_LIMITED`, `ALLOWANCE_EXHAUSTED`, `NOT_ELIGIBLE`, `CONFIRMATION_REQUIRED`, `CAPABILITY_UNAVAILABLE` |
| Content and media | `SAFETY_REJECTED`, `INVALID_MEDIA`, `UNSUPPORTED_LANGUAGE`, `UPLOAD_MISSING` |
| Outcome | `OPERATION_TIMEOUT`, `GENERATION_FAILED`, `STORAGE_FAILED`, `CANCELLED` |
| Access and request | `INVALID_REQUEST`, `NOT_FOUND`, `PERMISSION_DENIED`, `UNAUTHENTICATED` |

Codes travel in `HttpsError.details.reason` and on `task.errorCode`. Provider text is never returned or logged.

**Known limit.** Vertex cannot cancel a Veo operation that has started. Cancelling stops delivery and says plainly that the generation still counts.

## Deploying

Steps 1 to 3 were run on 2026-09-14, with the project owner's approval; step 4 was not. The results are in the 0.1.20 release note.

1. `npm run build:functions`, then `firebase deploy --only functions --project project-kassena-7e026`. This deploys 10 new functions, including the scheduled `sweepKawuriTasks`, and updates `kawuriChat` (dictionary briefing wording) and the Studio functions (shared constants).
   - Regenerate `functions.yaml` first if one exists (see the functions deploy manifest note).
   - The Cloud Build install picks up `@google/genai` from `services/functions/package.json`.
2. `firebase deploy --only firestore:rules,firestore:indexes --project project-kassena-7e026`. Wait for the three indexes to finish building before the app relies on Recent.
3. `firebase deploy --only storage --project project-kassena-7e026`.
4. Optional lifecycle backstop: `gcloud storage buckets update gs://project-kassena-7e026.firebasestorage.app --lifecycle-file=firebase/storage-lifecycle.json`.
5. Ship the app. The media tools stay hidden or marked unavailable until step 1 is live, because the app shows only what `getKawuriCapabilities` returns.

## Testing done on 2026-09-14

**Live against real Vertex AI (ADC, project `project-kassena-7e026`).**
- **Adapter checks:**
  - image generation, including 404 fallback to the older model
  - English transcription, with French refused
  - image, video and audio analysis, including `gs://` reads from our own bucket
  - the safety screen: harmful prompt refused, real-person reference refused, cultural illustration allowed
  - Veo started in one process and finished from its persisted name in another (real 4-second, 9 MB MP4)
- **Full stack:** the real callables in the Functions emulator (with local Auth, Firestore and Storage) calling real Vertex:
  - image ready, 1200×896 PNG
  - blocked prompt rejected
  - transcript returned and its temporary audio deleted
  - French refused
  - image, video and audio analysis, plus a follow-up turn
  - video refused for a plain member; for a creator it started, persisted its operation name and was imported (720×1280, 7.2 MB)
  - Recent listed the newest tasks
- **Signed URLs** cannot be minted in the emulator (no service-account signer). They fail softly there and work in production with the existing grant.

**Automated suites.**

| Suite | Result |
|---|---|
| `firebase/tests/kawuriMedia.test.mjs` (pure) | 28 |
| `firebase/tests/kawuriMediaFunctions.test.mjs` (emulator e2e, including simultaneous duplicate presses; `npm run test:kawuri-e2e`) | 12 |
| `kawuriTasks.rules.test.mjs` | 3 |
| Storage rules | 2 new |
| Flutter `test/features/kawuri/kawuri_media_test.dart` (includes 320/412 px keyboard and large-text checks) | 17 |
| All function helpers | 493 |
| Existing e2e | 34 |
| Firestore rules | 188 |
| Storage rules | 20 |
| Flutter suite | 1,283 |

`tsc --noEmit` and `flutter analyze` are clean. `npm run build:mobile-aab` produced a signed production bundle: 0.1.19 (28), 90.6 MB. The version was not bumped, so Play needs a new versionCode before upload.

**Not tested:** a physical Android device; the deployed callables, which await the deploy above; a real push notification; and App Check enforcement, which is off.
