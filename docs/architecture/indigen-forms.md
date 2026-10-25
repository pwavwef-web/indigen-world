# Indigen Forms

Indigen Forms lets authorised admins build, version, publish and review
contribution forms from the admin console, without code changes or a new
deployment for routine work. Contributors fill them in the contributor portal
(TribeStudio, `/contributor/forms`); reviewers decide on responses in the
review desk (`/contributor/review?desk=forms`) or in the admin console.

This page is the design record. The admin how-to is
[`docs/product/indigen-forms-admin-guide.md`](../product/indigen-forms-admin-guide.md).

## Moving parts

| Piece | Where |
|---|---|
| Form schema, rules engine, validation, templates, CSV/JSON export | `packages/contracts/forms.mjs` (+ `forms.d.ts`, `forms-templates.mjs`) — shared verbatim by the backend and both apps |
| Callable request/response types | `packages/contracts/forms-api.d.ts` |
| Backend helpers (collections, permissions, audit, notifications, links) | `services/functions/src/forms-common.ts` |
| Admin callable `formsAdmin` (`onStaffCall`) | `services/functions/src/forms-admin.ts` |
| Contributor callable `formsContributor` (`onCall`) | `services/functions/src/forms-contributor.ts` |
| Upload sessions, signature inspection, cleanup | `services/functions/src/forms-uploads.ts` |
| Review callable `formsReview` (`onStaffCall`) | `services/functions/src/forms-review.ts` |
| Points on approval (existing ledger) | `services/functions/src/form-rewards.ts` |
| Approved-response destinations | `services/functions/src/forms-destinations.ts` |
| Shared React renderer and response viewer | `packages/console-ui/src/forms/` |
| Admin screens (dashboard, builder, responses) | `apps/admin/src/forms/` |
| Contributor and reviewer screens | `apps/tribestudio/src/contributor/forms/` |

Nothing executes administrator-supplied code. Conditions are data — a field, one
of ten fixed operators and a value — and may only refer to **earlier** top-level
questions, which makes circular dependencies impossible by construction
(`validateDefinition` reports any forward or self reference).

## Data model (all server-only)

Firestore rules deny every client read and write to these collections; the three
callables are the only way in.

### `indigenForms/{formId}` — the form head

`FormDoc` in `forms-common.ts`: title, category and languages (for the
dashboard), `status` (`draft | published | paused | closed | archived`),
`currentVersion` (latest published), `draftVersion` + `draftRevision` (the open
draft and its save counter), `publishedVersions`, `retiredVersions`, `counts`
per response status, `totalSubmitted`, the current `audience` and
`reviewerGroup`, schedule, `lastActivityAt`.

### `indigenForms/{formId}/formVersions/{n}` — versions

`VersionDoc`: `state` (`draft | published | retired`), the full validated
`definition` (`FormDefinition`), a `revision` save counter while a draft,
`schemaHash` (sha256 of the stable JSON) once published.

* Versions are numbered 1, 2, 3… A form has at most one draft version.
* **Published versions are immutable.** No code path writes `definition` on a
  version whose state is not `draft`.
* Editing a published form: `startDraft` copies the current published
  definition into version `n+1` (state `draft`). Publishing it makes it the
  current version. The previous version stays `published` so drafts on it can
  still be submitted, until an admin retires it.
* **Answer keys are stable.** A field's `id` is its answer key. Labels and option
  labels can change freely; `versionCompatibilityIssues` refuses to publish a
  version that reuses an earlier key for a different question type.
* **Concurrent admin edits:** `saveDraft`, `discardDraft` and `publish` carry
  the draft `version` and `expectedRevision`. Draft revisions only ever
  increase for a form and discarded version numbers are never reused, so a
  stale builder can never hit a later draft that happens to share a number. A
  mismatch throws `aborted` with
  `{ reason: 'conflict', version, revision, updatedByName, updatedAt }`; the
  builder keeps the admin's edits and offers to reload or overwrite
  deliberately. `discardDraft` reports success only for the draft it was asked
  to discard (or a retry of that discard, tracked by `lastDiscarded`).
* **Lossless drafts:** when a saved definition does not validate, the version
  keeps the admin's raw input as `draftInput` (plain JSON, size-bounded) next
  to the normalised `definition`, so a rule or setting that is incomplete is
  shown again rather than silently dropped. Publishing validates that raw copy
  with the publish checks and refuses on any issue; the published version
  stores the normalised definition only.
* **Publishing keeps a paused or closed form paused or closed**; only a draft
  or published form becomes published.
* **Cohort edits** carry `expectedUpdatedAt`; a mismatch is a `conflict`.

### `indigenFormResponses/{responseId}` — responses

`ResponseDoc`: `formId`, `formVersion` (the exact version), `contributorUid`,
`status`, `revision` (submitted revisions), `draftRevision` (contributor save
counter), working `answers`, `consents` (wording + response, per consent
field), `grantedPurposes`, `attachmentIds`, `referenceId` (`IWF-XXXX-XXXX`,
assigned at first submission), language facets, review routing fields,
`feedback`, `reward` and `routing` outcomes.

* `formRevisions/{revision}` — immutable snapshot of every submission
  (answers, consents, version, time). A correction after "changes requested"
  creates revision 2, 3… and never touches earlier ones.
* `formHistory/{eventId}` — every lifecycle event: created, submitted,
  resubmitted, review started, changes requested, approved, rejected, points,
  routing, attachment links issued, version moved. Events carry actor uid and
  role; contributors only see role-level names ("Indigen World reviewer").

Response statuses: `draft → submitted → under_review → changes_requested |
approved | rejected`; `changes_requested → submitted` (resubmission). Allowed
decisions and their source statuses are `REVIEW_DECISIONS` in the contract and
are enforced on the server.

When a form does not require review, submissions stay `submitted` ("Received");
they never earn points and are never routed.

### Other collections

| Collection | Purpose |
|---|---|
| `indigenFormUploads/{uploadId}` | Upload registry: owner, response, field, storage path, declared and detected type, size, generation, sha256, inspection status |
| `indigenFormCohorts/{cohortId}` | Admin-managed named groups for audience targeting (`memberUids`) |
| `indigenFormRequests/{key}` | Idempotency records for contributor saves/submits and reviewer decisions |
| `formAwards/{responseId}` | One marker per response that earned points |
| `indigenFormRoutes/{responseId}` | Record of what an approved response created in its destination |
| `settings/indigenForms` | Publisher/exporter allow-lists, Finance-owned points limits |
| `auditLogs` | Canonical audit rows with `domain: 'indigen-forms'` and a `summary` |

Storage: `form-uploads/{uid}/{uploadId}`. `storage.rules` deny all client
access; uploads go through server-issued resumable sessions, downloads through
five-minute signed links pinned to the object generation.

## Drafts and versions (contributors)

* A contributor draft is a response in status `draft`, attached to the version
  that was current when it started.
* It can be submitted while the form is `published`, inside its schedule, and
  the draft's version is not retired (`submissionWindow` in the contract). The
  schedule applied is the stricter of the draft's own version and the form's
  current opening and closing dates, so a deadline set later also binds older
  drafts.
* When a newer version exists, the contributor is told and may `moveToLatest`
  (`carryAnswers` in the contract): answers whose key exists with the same type
  in the new version are kept and re-validated; the rest are listed as dropped,
  group sub-answers as `groupId.subId`. Permission answers are never carried:
  the contributor ticks each one again under the wording that will be recorded.
* After "changes requested", the contributor edits the same response, on its
  original version, and resubmits (allowed unless the form is archived). Every
  submission is kept in `formRevisions`.
* Pausing or closing a form blocks new submissions on the server; drafts and
  responses are kept. Archiving hides the form and keeps every record.

## Permissions

| Capability | Who | Enforced in |
|---|---|---|
| Build forms, save drafts, change status, view responses, manage cohorts | Admins (`role` admin / owner super admin), verified staff session | `formsAdmin` (`onStaffCall` + `requireFormsAdmin`) |
| Publish (and reopen to published) | Admins, or only the admins listed in `settings/indigenForms.publishers` | `canPublish` |
| Export | Admins, or only those listed in `exporters` | `canExport` |
| Edit publisher/exporter lists | Owner super administrator only | `saveAccess` |
| Points limits | Finance (`hasFinanceAccess`) | `saveRewardSettings` |
| Review a response | Members of the form version's reviewer group: `reviewers` (validator/reviewer role), `language_reviewers` / `culture_reviewers` (also an active `knowledgeRoleGrants` scope), `admins`; admins review every group. Nobody reviews their own response | `formsReview` (`onStaffCall` + `inReviewerGroup`) |
| See and fill a form | Active contributors (`contributorAccounts/{uid}.status == 'active'`) who match the version's audience | `formsContributor` (`requireActiveContributor` + `audienceMatches`) |

Base eligibility comes first: an active contributor account, and a contributor
profile that is not `inactive` and has not had `permissions.submit` withdrawn
(a missing permission counts as allowed, as elsewhere in the portal). A blocked
profile keeps read access to its own responses but cannot save, upload or submit.

Audience matching (`audienceMatches`) uses what the server holds:
`contributors/{uid}.languageProfile.dialect`, `contributors/{uid}.contributionTypes`
and `indigenFormCohorts` membership. A direct link or a direct callable request
from an ineligible account gets `permission-denied`.

Contributors can never set status, reviewer identity, points or routing: the
contributor callable accepts answers only, validates them against the
authoritative version (`validateAnswers`, unknown keys refused), and computes
everything else on the server.

## Uploads

1. `beginUpload {responseId, fieldId, name, contentType, size}` — the field must
   be an upload question of the response's version, the extension **and**
   declared type must match one allowed format (`matchUploadFormat`), and the
   size must fit `maxSizeMb`. The server registers the upload and returns a
   resumable GCS session (`ifGenerationMatch: 0`) for
   `form-uploads/{uid}/{uploadId}`.
2. The browser PUTs 1 MB chunks with `Content-Range`, resuming after 308 and
   retrying with backoff. An interrupted upload resumes on the same session or
   starts again; the client releases a failed registration, pending
   registrations older than an hour stop counting toward a question's limits,
   and abandoned ones are swept daily. Limits for an upload question inside a
   repeatable group scale with the group's number of entries.
3. `confirmUpload {uploadId}` — the server reads the real object metadata and
   leading bytes and identifies the format by its signature (JPEG, PNG, WebP,
   MP3, WAV, M4A/MP4/MOV `ftyp`, Ogg, WebM/EBML, FLAC, PDF, DOCX zip, UTF-8
   text). Executables, HTML/SVG/script content, macro-enabled or encrypted
   documents and any mismatch between detected and allowed formats are
   rejected and the object deleted. **Renaming a file does not get it past this
   check.** There is no malware scanner in the platform; inspection is
   signature-based only and is reported as such to reviewers.
4. Answers carry only `{id, name, contentType, size}`. On submit every
   attachment must be a `ready` upload owned by the contributor, registered to
   this response and question. Removing a file is a request: the server keeps
   any file that a submitted revision or the saved draft still lists, and
   decides in a transaction with the response so a racing submit can never
   lose a submitted file.
5. Answers are capped at 400 KB per response (`ANSWERS_BYTE_BUDGET`); the
   portal measures the same way before saving and points at the longest
   answers.

## Review, points and destinations

`formsReview.decide` runs in one transaction: expectations
(`expectedStatus`, `expectedRevision`) must match, the decision must be allowed
from the current status, approval needs every configured reviewer check, and
"request changes"/"reject" need feedback. It writes the status, a history
event, an audit row, the contributor notification (in-app; email unless the
contributor turned review emails off — `form_review` notifications are
readable by their owner only, not by all staff), counts, and — on approval —

* **Points** through the existing ledger (`points-ledger.ts`: `openLedger`,
  `post`, `commitLedger`), never a second ledger: ledger id
  `formaward_<responseId>`, marker `formAwards/{responseId}`, `type: 'award'`,
  `refs.source: 'form'`. Points come from the response's immutable version,
  capped by Finance's `maxPointsPerResponse` and a per-contributor daily cap
  (`contributorAccounts/{uid}/formRewardDays/{day}`). One award per response,
  whatever happens with retries, double clicks or later re-approval.
* **Routing** to the configured destination, only when the recorded consents
  include the destination's required purposes. The created record enters that
  destination's own review queue; nothing is published automatically.

Approval never grants publication or AI-training use. Those depend only on the
consent fields the contributor answered, stored with the wording they saw.

### Destinations in detail

Routing runs after the decision commits; a failure is recorded on the response
(`routing.status: 'failed'` with a note) and never thrown at the reviewer.
Admins can re-run it (`formsReview` action `retryRouting`). Record ids derive
from the response id and a server-only route key written in the approval
transaction, so a retry finds what an earlier attempt created and nobody else
can pre-create the record; routing refuses any target it did not create, and
clients cannot create `submissions` ids starting `form_`.
Destination permissions come only from the form's granted consents, under
consent version `forms:<formId>@v<n>`, with the statements stored; the
contributor's account-wide training agreement is never read.

| Destination | Creates | Notes |
|---|---|---|
| Dictionary candidate | `submissions` + `collectionContributions` through the existing builders, in the collection-contributions campaign, with `formOrigin` | Never sets `contributorPortal`, so the expressions reward triggers stay quiet; `awardContributorPoints` skips `formOrigin` so the community board does not pay twice. Publication permission only from a granted `public` consent. The recording is copied only with a granted `storage` consent **and** a mapped `speakerPermission` answered true; the rights and participant statements carry exactly what the contributor answered, or null where the form did not ask (shown as "Not asked"), never a default true. Routed recordings live under `creator-submissions/{uid}/collection-contributions/form_…`, which `storage.rules` close to the contributor; an existing copy is accepted only when its size and checksums match the inspected source. Missing part of speech or variety become "Not sure"; the source defaults to "Indigen Forms: <title> (<reference>)". |
| Translation review, audio collection, document intake | `portalContributions` records of type `translations`, `audio`, `documents` (materials review desk), `processing.state: 'queued'` so the portal's own inspection runs | Built like the portal's `save()` and checked with `portalIssues()`, without the portal parser's NFC normalisation. Files are copied to `portal-originals/{uid}/{batch}/{uploadId}`; formats the portal does not accept (WebP, Ogg, FLAC, MOV, WebM video, AAC) fail routing with a note. Ownership is recorded as `unclear` because forms ask no structured ownership question, so such records can be reviewed but are not exported by the portal. |

Known limits: a contributor who later revises a routed materials record through
the portal re-chooses its uses there; withdrawing a form response after routing
is not passed on (forms have no withdraw action yet); the portal does not stop
the person who routed a record from also approving it there.

### Error details the apps rely on

`HttpsError.details.reason` values: `conflict` (admin draft or contributor
draft revision moved on), `stale` (review expectations), `invalid` (with
`issues`), `audience`, `submit-blocked`, `once`, `not-editable`, `version`,
`paused`/`closed`/`retired`/`not_yet_open`/`past_deadline`, `too-large`,
`format`/`size`/`rejected-file`/`incomplete` (uploads), `no-draft`,
`no-review`, `decision`, `checks`, `feedback`, `group`, `routing`, and
`staff-mfa-required` from `onStaffCall` (never a conflict).

Idempotency records in `indigenFormRequests` carry a TTL on `expiresAt`
(contributor saves 2 days, submits 30 days); the TTL policy ships with the
indexes.

## Exports

`formsAdmin.export` (export permission) returns CSV or JSON for submitted or
approved responses of one form, optionally one version, plus the filters of
the Responses view. It is audited (`forms.export`).

* One row per response; columns are stable answer keys (union across the
  exported versions), plus `reference_id, response_id, form_id, form_version,
  revision, status, contributor_id, submitted_at, decided_at,
  granted_permissions`.
* Choices export option ids; multiple choice joins ids with `; `; repeatable
  groups export a JSON array of entries keyed by sub-question key; uploads
  export `attachmentId:fileName` pairs. **No links are exported.**
* CSV is UTF-8 with BOM, every text cell quoted, and cells starting with
  `= + - @`, tab or carriage return prefixed with `'` (formula injection).
* JSON carries every exported version's full definition, so ids map back to the
  questions and option labels contributors actually saw.
* Contributor identity is the uid only; names and emails are not exported.

## Limits

`FORM_LIMITS` in the contract: 30 sections, 150 questions, 20 questions per
group, 100 options, 10 conditions per rule, 50 group entries, 20 files per
upload question, per-type size ceilings (`UPLOAD_DEFAULTS`), 100 points per
response (Finance's lower cap applies on top). Rate limits: contributor saves
60/min, submits 10/min, upload sessions 30/10 min; reviewer decisions 120/h.

## Verification

```bash
npm run test:forms
```

builds the functions, runs the pure contract and upload-inspection tests, then
the emulator suites (`forms.integration`, `formsReview.integration`,
`forms.rules`) on the isolated `.forms-test.firebase.json` ports. Also run
`npm run test:staff-security`, `npm run test:rules`, `npm run test:storage-rules`,
`npm test --workspace @indigen-world/console-ui`, and the app checks
(`npm run check --workspace @indigen-world/admin`,
`npm run check --workspace @indigen-world/tribestudio`). Browser checks with
in-memory backends: `node apps/admin/scripts/forms-browser.test.mjs` and, with
the TribeStudio dev server on 5199, `node apps/tribestudio/scripts/forms-browser.test.mjs`
and `forms-review-browser.test.mjs`. For a full local run against the real
callables, start the auth/firestore/storage emulators, run
`services/functions/scripts/dev/callable-bridge.mjs`, and seed with
`services/functions/scripts/dev/seed-forms-ui.mjs`.

Signed attachment links cannot be exercised on the emulators (no signing
credentials); their permission checks are covered by the integration tests.

## What needs development rather than configuration

Routine work — new forms, questions of the supported types, wording, validation,
conditions, audiences, review settings, schedules, publishing — is configuration.
These need code:

* a new question type, condition operator, upload format or consent purpose;
* a new destination, or mapping into fields an existing destination does not
  accept (for example group sub-questions);
* anonymous public collection (out of scope for this release);
* malware scanning, transcription or OCR of uploads.
