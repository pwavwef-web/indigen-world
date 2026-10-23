# All-round Contributor Portal

The 2026-10-23 portal uses the existing Firebase project, contributor accounts,
History API router, workspace tokens, dictionary assistance, assignment editor,
reward ledger and governed knowledge workspace. No existing assignment,
submission, balance, approval, invitation URL or public record is migrated.

## Routes and recovery

`/contributor` is Home. Secondary cards use `?panel=` (start, submissions,
drafts, attention, notifications, impact, guides, community). Native dialogs
trap focus, close with Escape and restore invoking focus. Query-only navigation
keeps the Home scroll position. Rewards retain `/contributor/rewards`, with
the existing redemption rules and confirmation flow. The six new workspaces
are `/contributor/{translations,words,audio,stories,documents,corrections}`.
Legacy `/contributor/{uid}/{work}?item=` and all old section routes remain.
Assigned translation work is linked from Translate sentences. Corpus records
remain at `/contributor/corpus`, accessible from Home history and impact.

Each new workspace has a separate account-scoped local recovery envelope,
including metadata, completed private upload references and a pending stable
save request ID. Save draft creates an account version. Unfinished files retain
only their names and must be selected again after reload; the UI says they are
not uploaded. Storage failure, pending saves and unfinished transfers warn on
leave. Local recovery is cleared after a confirmed submission. The preview
uses explicitly synthetic fixtures and is excluded by production DEV guards.

Account activation can use `accountOnly: true` to replace temporary credentials
without granting model-training consent. Legacy clients retain their activation
contract. Legacy assigned translations still enforce their existing agreement
on the server. New records use independent, initially unchecked permissions;
the previous assignment agreement is never interpreted as permission for a
new source upload. No previous consent is rewritten.

## Trusted endpoints and schema

`portalContribution` requires an active, activated contributor account. Editing
and submission also honour disabled contributor profile permissions.
Actions: capabilities, beginUpload, save, list, summary, get, ack, retry, repair,
download, withdraw. `portalContributionReview` uses `onStaffCall`, the existing
validator/reviewer role inheritance, and verified sessions for staff accounts.
Actions: list, get, assign, decide, candidate, download, export, settings,
configure. Restricted personal/confidential/cultural sources require an
administrator. Exports and ingestion settings require administrator permission.
Self-review is refused; candidate creators cannot approve their own candidates.
An escalated disagreement needs an administrator to approve it.

The material-review view verifies this sign-in through the existing `staffMfa`
service before loading sources. Enrolled reviewers can enter an authenticator
or recovery code in Studio; first-time enrolment stays in the Administration
console. Studio uses its existing registered Enterprise App Check key, now
supplied as a committed public production default. Registration and the three
allowed production domains were verified read-only. Deployment changes no
account roles, claims, owner list or MFA secret.

`portalContributions/{id}` stores owner, type, typed content, provenance,
permissions, ownership flags, files, version, processing, review status,
feedback and timestamps. `versions/{n}` is an immutable capture version (its
processing result is completed once asynchronously); `history` records capture,
processing, review and withdrawal events. Stable request receipts live in
`portalRequests`. No clients can directly read or write these collections;
callables enforce access. Source documents are neither trusted knowledge nor
training examples. New all-round submissions do not automatically publish into
the dictionary or existing knowledge-release collections; those existing
workflows remain available. Their rewards remain **Pending reward assessment**;
this release creates no new reward policy or automatic awards.

Review is available at `/contributor/review?desk=materials` beside the existing
queues. Search/type/status filters run before paginated results are returned.
Returned work can be revised and resubmitted at an exact expected version.
Previous source versions remain. Feedback creates an in-app notification using
the existing notifications collection; no email or SMS is automatically sent.

## Private upload and processing

The platform ceilings are ten files, 20 MiB per file, 50 MiB per batch; text
extraction accepts UTF-8 files up to 2 MiB. Current limits can be lowered, and
uploads paused, in the administrator's ingestion settings. Clients fetch those
limits before choosing files. Forty upload sessions per contributor per hour,
bounded callable rates, and five processing attempts limit cost. Settings never
enable an authorisation bypass or external processing service.

`beginUpload` grants one GCS resumable upload session, with fixed content length,
MIME, owned random object path and `ifGenerationMatch: 0`. Browser transfers use
one-MiB chunks, progress, pause/resume, cancel and bounded connection recovery.
The Storage rules deny all direct SDK access to `portal-originals/**`; Firebase
SDK upload endpoints would otherwise create public bearer download tokens.
The session URL is ephemeral bearer upload authority, kept in memory and never
stored in a contribution, log or release asset. Downloads are five-minute,
generation-pinned attachment links, issued only after basic inspection and
checked owner/reviewer access. The bucket has no public ACL introduced here.
Abandoned private uploads have no automatic cleanup policy in this release;
operators should monitor retention and storage use before raising quotas.

`onPortalMaterialWritten` claims queued jobs transactionally. It validates real
type/size, pins the original generation, computes SHA-256, and extracts bounded
plain text from TXT, Markdown, CSV, JSON and JSONL. JSON syntax failures are
visible per-file failures. CSV stays in source row text; no arbitrary table
schema is inferred. Extraction output is limited across the batch and labelled
unverified. Exact duplicate checks are owner-scoped signals, never deletions or
automatic rejections. Tone marks are retained in NFC, never stripped for storage.

PDF, DOCX, XLSX, JPEG/PNG, MP3/WAV/M4A/WebM and MP4 receive signature/container
inspection and **Manual review required**. No extractor, OCR, automatic speech
transcription or external malware scanner is configured for those formats.
Scanned PDFs can be reviewed manually. Known active PDF markers, executables,
macros/embedded Office objects, archives and unsupported formats are refused.
These basic checks are not a full malware scan; originals download as
attachments, never executable inline HTML. Office containers are not expanded.
Untrusted source instructions remain inert text and never reach an agent or AI
provider. No restricted content is sent to an external AI service by this flow.
Existing dictionary suggestions and assigned-work Kawuri remain available.

Failed files do not erase successful originals. Retry processes the same
immutable references. A crashed processing claim can be retried after six
minutes; after five attempts it needs operator assistance. Repair failed files
creates a new draft version while retaining successful original references.
Failed files can then be removed/replaced without waiting for review. Earlier
submitted versions and their audit histories remain intact.

## Candidates, export and withdrawal

Reviewers can explicitly select a passage from an approved document into a
translation, word, story/reference passage or correction candidate. A candidate
retains the source ID/version, page/row/paragraph/time locator, method, editor,
rights and provenance; its permissions are intersected with the source's.
No missing translation is fabricated. Each candidate has its own review and
history, and requires a reviewer other than its creator to approve it. Additional
question/answer and governed corpus schemas remain in the existing knowledge
workspace; this release does not infer them from uploads.

Contributors may revise their own returned candidates. The exact approved source
reference is retained; rights are inherited and usage choices intersected again
on every revision. A withdrawn or superseded source cannot be used to broaden
permission. Processing detail refreshes while jobs run and has a manual refresh
action; automatic polling is bounded to five minutes.

Administrator exports select 1–100 approved records, a permitted use, and a
stable request ID. JSONL and CSV use task-specific schema identifiers; CSV stores
typed content as JSON cells and escapes spreadsheet formula prefixes. Export
does not include account contact information or raw private download links.
Speech exports contain recording checksums/metadata; authorised original
downloads are separate. Manifests retain exact source/record versions, reviewer
references, consent version and split group hashes. Group reservations ensure a
source family and a pseudonymous speaker retain the same train/development/test
split. Conflicting previously reserved groups require manual resolution.

Exports recheck current review, privacy, permissions, and parent version inside
the selection transaction, including retries. A changed version requires a new
export request. `portalDatasetVersions` stores the selection manifest, never an
assumption that a model was trained. Source documents themselves are ineligible
as validated examples. No automatic approved-retrieval projection or model
training service is introduced; retrieval exports require separate ingestion by
the existing authorised downstream system.

Withdrawal writes `portalWithdrawals/{id}` and immediately excludes the source
and derived candidates from future export selection. It marks up to 1,000
affected dataset versions per request; the live withdrawal registry remains the
authoritative check for every historical manifest, including larger histories.
Re-running withdrawal continues to expose the registry but operators must audit
larger manifest histories. Withdrawal cannot reverse already completed training.

## Release and verification

Deploy `portalContribution`, `portalContributionReview`,
`onPortalMaterialWritten`, `activateExpressionContributor`, Storage rules,
TribeStudio Hosting, and the narrow GCS CORS configuration together. The new
collections require no backfill or existing-record rewrite. Default-deny
Firestore rules already cover them. Preserve any existing bucket CORS entries
when applying `firebase/portal-storage-cors.json` (the deployment precheck found
none). Production uses the existing runtime signing grant for private downloads.

Checks:

```powershell
npm run test:contributor-portal
npm run test:staff-security
npm run test:rules
npm run test:storage-rules
npm run build:tribestudio
firebase emulators:exec --project demo-indigen-world --only auth,firestore,storage "node --test --test-concurrency=1 firebase/tests/portalMaterials.integration.test.mjs"
node apps/tribestudio/scripts/portal-redesign-browser.test.mjs
```

On this host, `FIRESTORE_EMULATOR_VERSION=1.22.0` selects the already-cached
emulator for the repository's CLI. Browser checks use a running local Vite
server at 127.0.0.1:5199 and synthetic preview data. They do not prove a signed-in
production contributor or reviewer journey. Do that smoke test with separately
authorised accounts after deployment; never change roles/claims to bypass it.
