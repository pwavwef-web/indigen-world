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

All three require an authenticated creator-equivalent role. Production App
Check follows the same `ENFORCE_APP_CHECK` setting as the other callables.
Provider credentials are Firebase secrets and are never returned to clients.

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

## Spend controls

The backend currently permits at most:

- 3 new jobs per creator per 10 minutes;
- 20 new jobs per creator per fixed 24-hour window;
- 250 new jobs platform-wide per fixed 24-hour window.

`clientRequestId` makes creation idempotent, so retrying a request returns the
existing job instead of purchasing another generation. These are safety
ceilings, not billing quotas. Configure hard provider-account budgets as well.

Planning rates are snapshotted as `2026-09-01` in
`studio-video-policy.ts`. Update and re-test them when provider pricing changes.

## Provider registration and secrets

1. Create a Runway developer organisation, enable billing, buy API credits, and
   create a server API key.
2. Create a fal team/account, add prepaid credit, and create an **API-scoped**
   key. An Admin key is not required for model calls.
3. Store the values without printing or committing them:

   ```powershell
   firebase functions:secrets:set RUNWAYML_API_SECRET
   firebase functions:secrets:set FAL_KEY
   ```

4. Ensure the Firebase project is on the Blaze plan and Secret Manager,
   Functions, Firestore, and Storage are enabled.
5. Ensure the runtime service account can sign short-lived Storage URLs. It
   needs `iam.serviceAccounts.signBlob`; Google's predefined role is Service
   Account Token Creator (`roles/iam.serviceAccountTokenCreator`).
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

The UI polls `refreshStudioVideoJob`, shows the private output, and can attach it
directly to TribeStudio's normal post editor.
