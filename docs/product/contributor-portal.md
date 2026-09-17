# Invited expression contributors

Tribe Studio's dedicated portal is `/contributor/{Firebase Auth UID}/{work ID}` on `https://tribestudio.indigenworld.com`. `/contributor` resolves the signed-in contributor's latest assignment. Invited accounts arriving on ordinary Studio routes are redirected before the Studio shell is rendered.

## Invite and translate

The Admin console now includes **Publishing → Contributors**. Administrators can create a profile without a login, preview public profile changes, keep contact information and editorial notes private, invite that person with an initial expression set, and assign later sets without changing credentials. The directory can be searched by name or email and filtered by status, role, location and contribution type.

The screen calls the admin-only `inviteExpressionContributor` callable with an email, 1–100 supplied English expressions, an assignment title and optional deadline/instructions. The response contains `{ contributorId, work, portalUrl, activationUrl }`. The backend creates or reuses the Firebase Auth account, records the invitation, creates the assignment and writes an audit entry. Its stable Auth UID is the unique contributor ID shown in the portal.

To assign subsequent sets, the Admin screen calls `assignContributorExpressions` with `{ contributorId, expressions: string[], title?: string, deadline?: string, instructions?: string }`. This admin-only endpoint requires an active invitation, preserves earlier assignments and drafts, records the allocation in the audit log, and returns the new work ID and portal URL without resetting credentials. Contributors can switch between their own sets using **Your assignment**.

Share the returned private activation link with the contributor. The callable does not send email. The Firebase password-reset code is verified and redeemed inside the contributor portal; successful password setup signs in and stays on the assignment route. Existing contributors can sign in directly at `/contributor`. Forgot password opens an email-only reset form using Firebase password-reset email with a return URL to the portal. No email is sent until the contributor requests a reset.

The Admin screen can generate a fresh activation link, cancel a still-pending invitation, suspend or deactivate account access, and reactivate it later. Contributor relationship status, login access and public profile visibility are intentionally separate controls. Restricting or hiding a contributor preserves assignments, submissions, published content and attribution. Profile, permission, invitation, assignment and access changes are written by trusted Functions and recorded in `auditLogs`.

The portal starts with expressions, not the existing word queue. Each assignment records `kind: expressions` and `language: xsm`. The form retains the assigned English expression, a natural Kasem translation and optional alternative Kasem phrasings, one per line. Punctuation is preserved; expressions do not pass through the word-list splitter at publication.

Drafts autosave after 700 ms of inactivity. The interface shows saving/error state, prevents switching expressions while a save is outstanding, and warns on closing with unsaved work. Revisions reject stale cross-device updates. A failed save keeps the text in the form and offers retry; after a cross-device conflict, reload and compare the recovery copy with the current server version. Unsaved text is copied synchronously to account/assignment/expression-scoped browser storage. Restore or discard it explicitly after refresh; confirmed saves remove the copy. If storage is unavailable, the editor warns contributors to keep the page open. Drafts saved to Firestore resume on subsequent sign-in.

## Review and publication

`saveExpressionAnswer` requires an active invitation and derives ownership from the authenticated UID. An atomic transaction writes the assignment state, canonical `submissions` document and `collectionContributions` receipt. A deterministic submission ID makes retries idempotent. Client rules deny direct draft writes and contributor provenance on client-created submissions.

The shared `decideSubmission` workflow displays submissions in the mobile Review Desk → Contributions, Admin → Review Desk → Contributions, and the contributor-focused Admin → Contributors → Review table. Approvals publish to `dictionaryEntries`; primary and alternate Kasem phrasings remain available in `translations` and `alternativeExpressions`. The existing self-review and withdrawal safeguards apply. The portal offers search and separate **Not started**, **Drafts**, **Submitted**, and **Needs revision** filters, with submitted progress counted from actual submission IDs. Rejected and needs-revision items reopen for editing with reviewer feedback. The backend checks the canonical review state before permitting changes. Resubmission creates a new deterministic, linked review round (`revisionOf` and `previousReview`), preserves the original decision, requires renewed consent, and ignores late old-round events when projecting the current assignment. Pending and approved submissions are locked; individual statuses and reviewer feedback distinguish approvals from rejections or escalations. Autosave keeps the current editor open when its draft status changes. Submit and next opens the next not-started expression in assignment order, wrapping to earlier unfinished expressions, and retains confirmation of the previous submission. On phones, the expression list opens first with a separate editor and Back to expressions control. Collection review continues to use approve/reject/escalate; rejected portal expressions can be revised and resubmitted through this dedicated workflow.

An idempotent retry-enabled trigger rereads current submission state, checks assignment linkage, and projects approved work into `contributorTrainingPairs` **only with explicit AI-training consent**. Training consent is optional and off by default. Withdrawn/rejected/unpublished work is removed from this projection. This is reviewed training source data, not an automatic model-training job.

Export current consented source data with Application Default Credentials:

```powershell
node services/functions/scripts/export-contributor-training.mjs --project PROJECT_ID > expressions.jsonl
```

The export rechecks current review and consent state rather than trusting potentially delayed trigger output. It retains attribution and source submission IDs. Refresh exports before use and honor withdrawals when building datasets. No data is uploaded to a model provider by this command.

## Deployment and verification

Deploy the Functions changes, Firestore rules, Tribe Studio hosting and Admin hosting together. The existing Tribe Studio SPA rewrite handles nested contributor routes. Firebase Email/Password authentication must be enabled and `tribestudio.indigenworld.com` must be allowed in Firebase Auth's authorized domains/continue URLs. No Firebase console settings or production data are changed by this code patch.

- `npm run test:contributor-portal`: backend behavior tests (transaction I/O simulated), Studio workflow tests and backend build.
- `npm run build:tribestudio` and `npm run build:admin`: frontend builds.
- `npm run test:rules`: includes contributor isolation/revocation/training-read rules tests; requires Java and the Firestore emulator.
- Production smoke test after deployment: create an invitation, activate it in a separate browser session, save and resume a draft, submit, approve from another reviewer account, inspect dictionary publication and consented training export, then verify withdrawal removes the training projection.

## Audit — 2026-09-16

Verified through backend behavior tests and frontend workflow tests: stable contributor ownership, admin-only assignment, isolation of assignment sets, draft persistence/revision conflicts, submission idempotency, canonical Review Desk documents, invitation gating, and separate translation/review views. The local preview exercises the actual portal UI with browser-only sample data; it does not bypass production authentication. Firestore rules emulator and mobile Dart tests still require Java/Flutter on the test host. Production activation and review smoke testing remain deployment steps.

The local preview includes account details, drafts, submitted and verified expressions, and reviewer feedback with direct resubmission. Translation samples are explicitly marked placeholders. Its connection-failure toggle exercises retry and refresh recovery without Firebase writes.
