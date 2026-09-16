# Invited expression contributors

Tribe Studio's dedicated portal is `/contributor/{Firebase Auth UID}/{work ID}` on `https://tribestudio.ngenwale.com`. `/contributor` resolves the signed-in contributor's latest assignment. Invited accounts arriving on ordinary Studio routes are redirected before the Studio shell is rendered.

## Invite and translate

The admin assignment section will be built separately. This implementation does not include an assignment screen or generate expressions. It provides the admin-only `inviteExpressionContributor` callable for that future section: pass `{ email, expressions: string[] }` with 1–100 supplied English expressions. The response contains `{ contributorId, work, portalUrl, activationUrl }`. The backend creates or reuses the Firebase Auth account and stores the supplied assignment. Its stable Auth UID is the unique contributor ID shown in the portal.

To assign subsequent sets, the future admin section calls `assignContributorExpressions` with `{ contributorId, expressions: string[], title?: string }`. This admin-only endpoint requires an active invitation, preserves earlier assignments and drafts, and returns the new work ID and portal URL without resetting credentials. Contributors can switch between their own sets using **Your assignment**.

Share the returned private activation link with the contributor. The callable does not send email. The Firebase password-reset code is verified and redeemed inside the contributor portal; successful password setup signs in and stays on the assignment route. Existing contributors can sign in directly at `/contributor`.

The portal starts with expressions, not the existing word queue. Each assignment records `kind: expressions` and `language: xsm`. The form retains the assigned English expression, a natural Kasem translation and optional alternative Kasem phrasings, one per line. Punctuation is preserved; expressions do not pass through the word-list splitter at publication.

Drafts autosave after 700 ms of inactivity. The interface shows saving/error state, prevents switching expressions while a save is outstanding, and warns on closing with unsaved work. Revisions reject stale cross-device updates. A failed save keeps the text in the form and offers retry; after a cross-device conflict, copy the text and reload to reconcile. Drafts saved to Firestore resume on subsequent sign-in.

## Review and publication

`saveExpressionAnswer` requires an active invitation and derives ownership from the authenticated UID. An atomic transaction writes the assignment state, canonical `submissions` document and `collectionContributions` receipt. A deterministic submission ID makes retries idempotent. Client rules deny direct draft writes and contributor provenance on client-created submissions.

The shared `decideSubmission` workflow displays submissions in the mobile Review Desk → Contributions and Admin → Review Desk → Contributions. Approvals publish to `dictionaryEntries`; primary and alternate Kasem phrasings remain available in `translations` and `alternativeExpressions`. The existing self-review and withdrawal safeguards apply. The portal separates **Untranslated**, **Translated** (saved drafts and submissions), and **Reviewed / verified**. Submitted items are locked; individual statuses and reviewer feedback distinguish approvals from rejections or escalations. Autosave keeps the current editor open when a new translation moves into the Translated category. Collection contributions currently use approve/reject/escalate, not a revision/resubmission workflow.

An idempotent retry-enabled trigger rereads current submission state, checks assignment linkage, and projects approved work into `contributorTrainingPairs` **only with explicit AI-training consent**. Training consent is optional and off by default. Withdrawn/rejected/unpublished work is removed from this projection. This is reviewed training source data, not an automatic model-training job.

Export current consented source data with Application Default Credentials:

```powershell
node services/functions/scripts/export-contributor-training.mjs --project PROJECT_ID > expressions.jsonl
```

The export rechecks current review and consent state rather than trusting potentially delayed trigger output. It retains attribution and source submission IDs. Refresh exports before use and honor withdrawals when building datasets. No data is uploaded to a model provider by this command.

## Deployment and verification

Deploy the Functions changes, Firestore rules, Tribe Studio hosting and Admin hosting together. The existing Tribe Studio SPA rewrite handles nested contributor routes. Firebase Email/Password authentication must be enabled and `tribestudio.ngenwale.com` must be allowed in Firebase Auth's authorized domains/continue URLs. No Firebase console settings or production data are changed by this code patch.

- `npm run test:contributor-portal`: backend behavior tests (transaction I/O simulated), Studio workflow tests and backend build.
- `npm run build:tribestudio` and `npm run build:admin`: frontend builds.
- `npm run test:rules`: includes contributor isolation/revocation/training-read rules tests; requires Java and the Firestore emulator.
- Production smoke test after deployment: create an invitation, activate it in a separate browser session, save and resume a draft, submit, approve from another reviewer account, inspect dictionary publication and consented training export, then verify withdrawal removes the training projection.

## Audit — 2026-09-16

Verified through backend behavior tests and frontend workflow tests: stable contributor ownership, admin-only assignment, isolation of assignment sets, draft persistence/revision conflicts, submission idempotency, canonical Review Desk documents, invitation gating, and separate translation/review views. The local preview exercises the actual portal UI with browser-only sample data; it does not bypass production authentication. Firestore rules emulator and mobile Dart tests still require Java/Flutter on the test host. Production activation and review smoke testing remain deployment steps.
