# TribeStudio AI-assisted video: first release

Status: backend and creator interface deployed; first paid end-to-end generation still to verify.

## Release boundary

The first release deliberately separates visual generation from Kasem speech:

1. Runway creates a silent visual clip from a visual-direction prompt and an
   optional creator-owned reference image.
2. A creator writes a purpose-built Kasem script and a consenting speaker records it.
3. fal Sync Lipsync combines the private video and audio assets.
4. The trusted backend imports the result into private Firebase Storage.
5. Publication still uses TribeStudio's existing submission, validation, and
   publication workflow. A generated result is not automatically approved.

No Kasem TTS or voice cloning is part of this release.

## Trusted backend surface

The following callable Functions are exported from `services/functions`:

- `getStudioVideoCapabilities` returns supported operations, models, limits,
  and the versioned planning rates used by the UI.
- `createStudioVideoJob` validates policy, records an audited idempotent job,
  applies burst/daily spend guards, and submits it to Runway or fal.
- `refreshStudioVideoJob` polls the provider and imports successful output to
  `studio-video-jobs/{uid}/{jobId}/output.mp4`.
- `getStudioVideoPlaybackUrl` returns short-lived signed playback and download
  URLs for a finished job. The creator's browser never fetches the object
  directly: a `getBlob` read is an XHR and needs bucket CORS, which failed on
  the deployed origin and looked like a broken video rather than a missing
  header. A signed URL also streams instead of buffering the file into the tab,
  and expires, which a Storage download token does not.

And one scheduled Function:

- `sweepStudioVideoJobs` (every 2 minutes) advances jobs nobody is watching.
  Browser polling used to be the only thing that could complete a job, so
  closing the tab abandoned a generation that had already been paid for at the
  provider. The sweep imports the result regardless, and fails any job still
  unfinished after 30 minutes so nothing stays non-terminal forever.

  It needs the **Cloud Scheduler API** enabled on the project. After deploying,
  confirm it exists:

  ```powershell
  firebase functions:list --project project-kassena-7e026
  ```

Both the callable and the sweep advance jobs, and both import inline, so each
one first claims the job by compare-and-set on `advanceLeaseUntil`. Without
that claim they raced on the same deterministic object path, and a failed
import's cleanup could delete a file the other had just written — leaving a
job that read SUCCEEDED with no video behind it.

All callables require an authenticated creator-equivalent role — that is, an
approved membership, because every job buys a generation. TribeStudio hides the
video nav entries and routes to an explanatory panel for accounts without one,
rather than offering a form whose every request is refused. Production App
Check follows the same `ENFORCE_APP_CHECK` setting as the other callables;
note that enforcing it requires the tribestudio build to carry
`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, or every video callable rejects with
`unauthenticated`. Provider credentials are Firebase secrets and are never
returned to clients.

### Required Firestore indexes

Two composite indexes on `studioVideoJobs`, both declared in
`firebase/firestore.indexes.json` and deployed with
`firebase deploy --only firestore:indexes`:

- `ownerUid` ASC + `createdAt` DESC — the creator's own job list.
- `status` ASC + `createdAt` ASC — the sweep, which takes the oldest in-flight
  jobs first so no creator is starved by document-id ordering.

The emulator does not enforce composite indexes, so a missing one fails only in
production, as `FAILED_PRECONDITION` on the list query.

## Governance enforced before provider submission

Every request must explicitly record:

- permission for external AI processing;
- ownership or sufficient rights;
- cultural permission;
- whether a recognisable person appears;
- participant, voice, and likeness consent where applicable;
- the creator-written Kasem script, dialect, ISO language code `xsm`, and
  consent-form version.

Creators do not need to turn a video script into a separate content submission.
An optional `submissions/{id}` reference may preserve reviewed provenance; when
present, it must belong to the creator, be `APPROVED` or `PUBLISHED`, use `xsm`,
and match the submitted dialect and transcript exactly.

The initial implementation rejects material involving minors and third-party
material. Lip-sync requires a written transcript plus participant, voice, and
likeness consent. Source files must live under the caller's dedicated private
`creator-submissions/{uid}/studio-video/` prefix or be their earlier generated
video output.

Short-lived signed URLs are created only after these checks. Provider output is
downloaded into the Indigen World bucket rather than relying on an expiring
provider URL.

## Providers and models

Three providers serve two operations. Which provider serves a request is a
property of the **model**, not of the operation — `generate_visual` is served by
both Runway and Gemini — and the capability response tells the client which one
each model belongs to, so the browser never hardcodes it.

| Model | Provider | Lengths | Shapes | Rate |
|---|---|---|---|---|
| `gemini-omni-1.1-flash-preview` | Gemini (Vertex AI) | 4, 6, 8, 10s | landscape, portrait, 1080p | $0.155/s |
| `gen4.5` | Runway | 5, 10s | landscape, portrait (square needs an image) | $0.12/s |
| `gen4_turbo` | Runway | 5, 10s | any, image required | $0.05/s |
| `lipsync-2`, `lipsync-2-pro` | fal | 5, 10s | — | $0.05/s, $0.083/s |

Gemini Omni is the default in the model picker. It replaced Veo 3.1
(`veo-3.1-generate-001` at $0.40/s and `veo-3.1-fast-generate-001` at $0.15/s,
4, 6 or 8 seconds) on 2026-09-19. Veo is no longer offered, but it is still
known to the backend: a job started on it before the switch is collected when
it finishes, and a studio page opened before the switch that still lists Veo is
told to reload rather than "unknown model".

Lengths are **per model**: Runway takes 5 or 10 seconds and Omni 4, 6, 8 or 10.
The client reads each model's own list and snaps an illegal length rather than
letting the provider reject it, because a submit-time rejection reads to a
creator as "the video failed" for a request that was never askable. Omni has no
1:1 aspect ratio, so square is absent from its lists rather than offered and
refused.

### Gemini video specifics

Gemini Omni is reached through Vertex AI's **Interactions API** on the global
endpoint — `POST .../v1beta1/projects/{project}/locations/global/interactions`
with `background: true`, then `GET .../interactions/{id}` until it finishes —
using the function's own Application Default Credentials. **There is no API key
for this provider**, in Secret Manager or anywhere else. The project needs
`aiplatform.googleapis.com` enabled and the runtime service account needs
`roles/aiplatform.user`; Kawuri already requires exactly this, so a deployment
running Kawuri needs nothing further. The interaction id is stored as the job's
`providerTask.providerTaskId`, exactly where a Veo operation name used to go.

What was measured on `project-kassena-7e026` on 2026-09-19, and is now pinned by
`firebase/tests/studioVideo.test.mjs`:

- A background create answers in about 1.5 s. The first call of the day took
  29 s, so the create is given 90 s: a create abandoned after Vertex accepted it
  is a video billed with no id to collect it by.
- Ten seconds of portrait 1080p took about 95 s and came back **inline**: a
  13 MB MP4 inside 17 MB of JSON, in a `model_output` step. A poll therefore
  gets 120 s.
- A refusal is `status: "failed"` with `errors: [{ code: "content_blocked" }]`,
  and bills only the prompt and the model's thinking. The creator sees
  "Gemini declined this prompt: …" so they rephrase rather than retry.
- Every video carries a Google-signed C2PA manifest and an AAC soundtrack.

Omni has **no parameters** for sound, negative prompts or who may appear, so
those are said in words after the creator's prompt (`omni-video.ts`):

- **Silence.** Omni cannot be told `generateAudio: false` as Veo was. It would
  otherwise voice its people in a language that is not Kasem, over footage
  meant to represent Kassena life, so the prompt asks for a silent soundtrack.
  Measured: −66 dB mean, against −42 dB for a gentle ambience — nobody hears it.
  The file is not edited afterwards, because removing the audio track would
  break the C2PA signature. The Kasem the creator recorded is the audio; it
  arrives through lip-sync or in editing, and is never invented by a model.
- **Adults only.** The governance model refuses minors outright, and Omni has
  no `personGeneration` setting, so the prompt says everyone shown is an adult.
- **The video comes back as bytes.** Vertex returns the encoded video unless it
  is given a Cloud Storage URI to write into, and giving it one would mean
  granting the Vertex service agent read and write access to the prefix holding
  creators' unpublished media. A reference image travels the same way, outbound,
  as the opening frame (`task: image_to_video`), for the same reason — which is
  why it is capped smaller than the bucket allows.

The Studio renders Omni at 1080p in both orientations. Omni is priced in
tokens — $17.50 per million video-output tokens at 8,688 tokens a second of
1080p, plus a little thinking — which the table rounds up to $0.155/s.

## Spend controls

The backend currently permits at most:

- 3 new jobs per creator per 10 minutes;
- 20 new jobs per creator per fixed 24-hour window;
- 250 new jobs platform-wide per fixed 24-hour window;
- **$20 of provider spend per creator per fixed 24-hour window**;
- **$250 of provider spend platform-wide per fixed 24-hour window.**

The last two exist because counting jobs stopped being enough once the models
stopped costing the same: a 10-second Gemini Omni generation is two and a half
times a 5-second Runway one, so twenty jobs a day is a bill anywhere between
$12 and $31 depending only on which model was picked (it was $64 under Veo
3.1). `consumeRateLimit` takes a
`units` argument for this, and the video generator spends the estimate in cents
against the same fixed window it uses to count calls.

These are runaway guards, not billing quotas — generous enough that ordinary
work never meets them. **When a membership plan covers video**, the per-creator
ceiling becomes the number a tier supplies rather than a constant:
`benefitsForUid` in `subscriptions.ts` already resolves a creator's tier and
`TIER_BENEFITS` in `subscription-catalog.ts` already carries a `creatorTools`
benefit to hang it on, so replacing `CREATOR_DAILY_SPEND_CENTS` in
`studio-video.ts` is the whole change. Note the tier catalogue is mirrored in
two files and both must move together.

`clientRequestId` makes creation idempotent, so retrying a request returns the
existing job instead of purchasing another generation — unless that job never
reached a provider, in which case it is resubmitted, because nothing was bought.
Configure hard provider-account budgets as well.

Planning rates are snapshotted as `2026-09-19` in
`studio-video-policy.ts` (Omni's own rates live in `omni-video.ts`). Update and
re-test them when provider pricing changes.

## Provider registration and secrets

1. Create a Runway developer organisation, enable billing, buy API credits, and
   create a server API key.
2. Create a fal team/account, add prepaid credit, and create an **API-scoped**
   key. An Admin key is not required for model calls.
2b. Gemini video needs **no key**. Enable `aiplatform.googleapis.com` and give
   the functions runtime service account `roles/aiplatform.user`. If Kawuri
   already answers on this project, this is already done. Gemini Omni is a
   Preview model served from the `global` location; confirm the project can
   reach it before a deploy relies on it. A free check: create a background
   interaction with the real model id and `duration: "99s"`. A reachable model
   accepts it and then fails it ("exceeds maximum duration 10") with empty
   usage; an unreachable one answers 400 "Unsupported model interaction".
3. Store the values without printing or committing them:

   ```powershell
   firebase functions:secrets:set RUNWAYML_API_SECRET
   firebase functions:secrets:set FAL_KEY
   ```

4. Ensure the Firebase project is on the Blaze plan and Secret Manager,
   Functions, Firestore, and Storage are enabled.
5. Ensure the runtime service account can sign short-lived Storage URLs. It
   needs `iam.serviceAccounts.signBlob`; Google's predefined role is Service
   Account Token Creator (`roles/iam.serviceAccountTokenCreator`), granted on
   the runtime account itself:

   ```powershell
   gcloud iam service-accounts add-iam-policy-binding PROJECT_NUMBER-compute@developer.gserviceaccount.com --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"
   ```

   Skipping this breaks nothing at deploy time. Every finished video then
   refuses to preview or download ("could not be opened"), lip-sync and
   reference-media jobs fail to start, and the function log shows
   `Permission 'iam.serviceAccounts.signBlob' denied`. Production shipped
   without it until 2026-09-12.
6. Deploy Functions and rules only after emulator tests pass.

Never use a `VITE_*` variable for either provider key and never paste a key into
an issue, commit, test fixture, or chat transcript.

## Creator interface

The deployed interface provides a short creator flow:

- write a Kasem script and name its dialect or community variety;
- choose new visuals or lip-sync, with provider details hidden under advanced options;
- add only the media needed for that operation;
- confirm rights, cultural permission, provider processing, and participant consent;
- review the cost estimate and explicitly create the job.

The UI polls `refreshStudioVideoJob` every 15 seconds with a single request in
flight at a time, shows the private output through a signed playback URL, and
can attach it directly to TribeStudio's normal post editor.

`/studio/video/jobs` lists every job this creator has started, newest first,
and refreshes itself while any is running. A ready video can be watched there
in place, downloaded, or sent to the post editor — it is private until
published, so this list is the only place its maker can see it. It is the recovery path: before it
existed a job lived only in the `?job=` parameter of the tab that started it, so
a reload or a closed laptop left a paid-for video with no way back to it.
