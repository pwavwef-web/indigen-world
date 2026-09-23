# Invited expression contributors

Tribe Studio's contributor workspace lives under `/contributor` on `https://tribestudio.indigenworld.com`. Since the 2026-09-23 rebuild, `/contributor` is the workspace Overview; one assignment is still `/contributor/{Firebase Auth UID}/{work ID}`, the address every SMS invitation carries. Invited accounts arriving on ordinary Studio routes are redirected to `/contributor` before the Studio shell is rendered. The full route list, data model and deployment steps for the rebuilt workspace are under [Workspace rebuild — 2026-09-23](#workspace-rebuild--2026-09-23).

## Invite and translate

The Admin console now includes **Publishing → Contributors**. Administrators can create a profile without a login, preview public profile changes, keep contact information and editorial notes private, invite that person with an initial expression set, and assign later sets without changing credentials. The directory can be searched by name or email and filtered by status, role, location and contribution type.

The screen calls the admin-only `inviteExpressionContributor` callable with an email, 1–100 supplied English expressions, an assignment title and optional deadline/instructions. The request includes a stable `requestId` and `phoneNumber`. The response contains `{ contributorId, work, portalUrl, loginMethod, sms }`. Invite sends the portal link and sign-in instructions through Arkesel SMS after saving the assignment. Ghana local numbers are normalized to international format. A repeated request ID returns the saved invitation without duplicating work or SMS. The backend creates or reuses the Firebase Auth account, records the invitation, creates the assignment and writes an audit entry. Its stable Auth UID is the unique contributor ID shown in the portal.

To assign subsequent sets, the Admin screen calls `assignContributorExpressions` with `{ contributorId, expressions: string[], title?: string, deadline?: string, instructions?: string }`. This admin-only endpoint requires an active invitation, preserves earlier assignments and drafts, records the allocation in the audit log, and returns the new work ID and portal URL without resetting credentials. Contributors can switch between their own sets using **Your assignment**.

For newly created accounts, the SMS supplies the portal URL: contributors first sign in with their email and phone number (international format such as `+233241234567`) as their temporary password, then choose and confirm a new password to complete activation. The backend blocks answer writes until `activateExpressionContributor` completes. Phone numbers remain private account information; they are not verified by SMS. Existing Firebase accounts sign in with their existing password; if this is their first contributor invitation, they also complete the password-choice step. Already activated contributors are not reset on re-invitation.

Invite and Resend send an SMS to the saved contact number and record provider acceptance or failure under `invitation.sms`. Acceptance is not proof of handset delivery. A failed SMS leaves the saved assignment intact; use Resend rather than creating another invitation. Invite enables profile editing and submission permissions, as disclosed by the Admin form. The callables do not send email. The Firebase password-reset code is verified and redeemed inside the contributor portal; successful password setup signs in and stays on the assignment route. Existing contributors can sign in directly at `/contributor`. Forgot password opens an email-only reset form using Firebase password-reset email with a return URL to the portal. No email is sent until the contributor requests a reset.

The Admin screen can resend the SMS without changing credentials, cancel a still-pending invitation, suspend or deactivate account access, and reactivate it later. Contributor relationship status, login access and public profile visibility are intentionally separate controls. Restricting or hiding a contributor preserves assignments, submissions, published content and attribution. Profile, permission, invitation, assignment and access changes are written by trusted Functions and recorded in `auditLogs`.

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

Deploy the Functions changes, Firestore rules, Tribe Studio hosting and Admin hosting together. The existing Tribe Studio SPA rewrite handles nested contributor routes. Firebase Email/Password authentication must be enabled and `tribestudio.indigenworld.com` must be allowed in Firebase Auth's authorized domains/continue URLs. Invite and Resend must bind the existing `ARKESEL_API_KEY` secret. Deployment does not send invitations; an administrator must click Invite by SMS. Production deployment status is recorded in the dated SMS-invitation release post.

- `npm run test:contributor-portal`: backend behavior tests (transaction I/O simulated), Studio workflow tests and backend build.
- `npm run build:tribestudio` and `npm run build:admin`: frontend builds.
- `npm run test:rules`: includes contributor isolation/revocation/training-read rules tests; requires Java and the Firestore emulator.
- Production smoke test after deployment: create an invitation, activate it in a separate browser session, save and resume a draft, submit, approve from another reviewer account, inspect dictionary publication and consented training export, then verify withdrawal removes the training projection.

## Audit — 2026-09-16

Verified through backend behavior tests and frontend workflow tests: stable contributor ownership, admin-only assignment, isolation of assignment sets, draft persistence/revision conflicts, submission idempotency, canonical Review Desk documents, invitation gating, and separate translation/review views. The local preview exercises the actual portal UI with browser-only sample data; it does not bypass production authentication. Firestore rules emulator and mobile Dart tests still require Java/Flutter on the test host. Production activation and review smoke testing remain deployment steps.

The local preview includes account details, drafts, submitted and verified expressions, and reviewer feedback with direct resubmission. Translation samples are explicitly marked placeholders. Its connection-failure toggle exercises retry and refresh recovery without Firebase writes.

## Assignment guidance and uncertainty flags — 2026-09-16

Assignments can store expected dialect, tone, deadline and a help contact for each set. The “Before you begin” card has been removed from the portal and preview at the user’s request. These optional text fields are bounded to 500 characters. Include a date, time and timezone in the deadline; it is guidance, not an automatic submission cutoff. The admin assignment screen remains future work; administrators supply guidance through the callables.

**Skip / I’m not sure** persists `unsure: true` and a timestamp, retains any private draft, and moves to the next not-started expression only after saving succeeds. It creates no new review submission, receipt or training data, requires no translation or publication consent, and appears in its own filter and count. Editing/saving or submitting clears the flag. Locked pending/approved submissions cannot be skipped; returned work retains its previous review and feedback. Save failures leave the editor open for retry.

Deploy `activateExpressionContributor` alongside the changed invitation/save endpoints and Tribe Studio. Enable Firebase Email/Password authentication. No Google sign-in button is offered in the contributor flow. Verify first phone-password sign-in, replacement-password sign-in, wrong temporary credentials, invitation link recovery, skipping in production before announcing availability.

## Production login repair — 2026-09-17

The portal displayed “Unable to verify your contributor invitation” after successful sign-in. The live Firestore rules had last been released on September 14 and omitted contributorAccounts, so the default-deny rule blocked the invitation lookup. The invitation-only message shown alongside this failure did not establish that the account lacked an invitation.

Deployed the existing repository rules with `firebase deploy --only firestore:rules --project project-kassena-7e026`. The comparison against the previous live rules contained only contributor account/training access rules and the two guards preventing client-written contributorPortal submissions. Firebase compilation and deployment succeeded. A subsequent read confirmed that the active rules match firebase/firestore.rules (ignoring line endings): ruleset e4977ea4-fbe7-455c-95b8-bab5199aa669, released at 2026-09-17T08:20:27.720934Z.

Contributors can retry or reload their existing session. Their own account is readable; assignments require active account status; client writes remain blocked. No accounts, passwords, invitations, or hosting assets were changed. An authenticated handset retry remains necessary to confirm the reported user's complete login flow. Future contributor releases must include Firestore rules, not only Functions and Hosting.

## Workspace rebuild — 2026-09-23

**Status: implemented and tested locally on branch `feat/contributor-workspace-rebuild`; not deployed.** Nothing below is live until the deployment steps at the end of this section are carried out. The signed-in production flows have not been exercised; everything was verified with unit tests, emulator end-to-end tests and the dev-only preview.

The portal was rebuilt as a workspace with persistent navigation. Access is decided exactly as before — a signed-in account whose `contributorAccounts/{uid}` record is `active`, with activation still required after a temporary password — and every callable repeats the check on the server.

### Routes

| Route | Page |
|---|---|
| `/contributor` | Overview: current assignment, the four review counts, recent activity, Community today, entries to Kawuri and the guide |
| `/contributor/assignments` | Assignments, filtered All / To do / Awaiting review / Complete |
| `/contributor/{uid}/{work}?item=` | One assignment: expression list and editor. Unchanged, so every SMS link keeps working |
| `/contributor/contributions?filter=` | My contributions: All, Drafts, Submitted, Awaiting review, Approved, Needs revision, Flagged unsure |
| `/contributor/activity` | Submissions, reviewer decisions, new assignments and payment-verification notices, newest first |
| `/contributor/guide?section=` | Platform guide |
| `/contributor/kawuri?work=&item=&mode=` | Kawuri Intelligence |
| `/contributor/account/{profile,security,notifications,payments}` | Account & settings |

Deep links use `?section=`/`?item=` rather than `#hash`, because the Studio router drops hashes. `/contributor/account/{tab}` has the same two-segment shape as an invitation link; `invitationLinkOwner` (workspace.tsx) keeps it from being read as "this link belongs to another account". Desktop shows a sidebar; phones show a bottom bar (Overview, Assignments, Contributions, Kawuri, More), hidden while the editor is open. The dev-only preview mirrors every page under `/contributor/preview/…` (assignments at `/contributor/preview/assignment/{work}`) with sample data, sends nothing, and is excluded from production builds.

### Counting rules

Computed by `metricsFor` (contributor/model.ts) from the assignment rows the portal already reads:

- **Submitted** — every expression sent for review at least once (it has a submission id), whatever happened next.
- **Awaiting review**, **Approved** (`verified`) and **Returned for revision** (`rejected`/`needs_revision`) — where each submitted expression is now. Each expression is in exactly one of these, or in drafts, flagged unsure, not started, or archived/withdrawn.
- Submitted is never shown as approved. The guide's *How review works* section explains the difference.

The assignment state (`workState`) puts returned work first, then open work, then work awaiting review.

### Community today

`onContributorPulseSubmissionWritten` (contributor-pulse.ts) watches `submissions` and records two events for contributor-portal work only: an expression sent for review, and an expression approved. It writes `contributorPulseTotals/{day}` (idempotent token sets for submitted, approved and distinct contributors) and one `contributorPulse` row per contributor per day. Nothing is estimated or seeded; a quiet day reads as a quiet day, and the panel says so.

How a contributor appears is their choice under Account → Notifications & visibility (`contributorSettings/{uid}.activityVisibility`): anonymously ("A contributor", the default), by display name, or not at all — hidden contributors still count in the day's totals. Changing the choice rewrites today's and yesterday's rows at once. Rows are keyed by a hash of account id and day with a server-only key (`CONTRIBUTOR_PULSE_PEPPER` or `PHONE_HASH_PEPPER` when configured, otherwise a random key created on first use in `contributorPulseKeys/current`, which no client can read), so a row cannot be traced to an account or linked across days. No expression, assignment or translation text is copied into the pulse. Active contributors and staff can read it; only the backend writes it.

### Platform guide

`contributor/guide.ts` restates existing, sourced material — the creator guidelines in `packages/contracts/content/creator-guidelines.mjs`, this document, and the backend's payment and privacy rules — and names its source under each section. Editor fields link to the relevant section. Where the policy does not exist yet, the guide says **Policy not yet published** instead of inventing it:

- how long review normally takes;
- rates, amounts and payment schedules for invited contributors;
- how long a bank statement is kept after verification.

### Kawuri Intelligence

`kawuriContributorAssist` (contributor-assist.ts) offers three modes — explain the instructions, what context an expression needs, check my saved draft — and returns three separately labelled parts:

1. **Checks** — deterministic, no model: missing translation, English left in the Kasem box, missing usage note, reviewer feedback not addressed. Advice only; nothing blocks a submission.
2. **Sources** — reviewed material: the assignment's own instructions, variety and tone; published dictionary entries matching words in the English (with ids); the guide sections that apply.
3. **Suggestions** — Gemini on Vertex AI through the existing `generateStructured` helper and the Kawuri analysis-model configuration, shown as "AI · not reviewed". The model is told never to write or judge Kasem, and any suggestion containing Kasem-only letters is dropped on the server. It is told whether a translation exists but never sees the contributor's Kasem. Contributors can dismiss any suggestion.

Nothing is written to the contribution and nothing the contributor or the model wrote is logged. Limits: 10 requests a minute and 80 a day per contributor. When Vertex is unavailable the checks and sources still return, and the page names the missing connection. Requires an active contributor account.

### Account & settings

- **Profile** — `getContributorSelf` returns the contributor's own profile *without* the administrator's internal notes; `updateContributorSelf` changes only display name, photo (must be the contributor's own avatar upload), town or region, Kasem variety, other languages and "about you".
- **Sign-in & security** — email and password, with a password change that asks for the current password.
- **Notifications & visibility** — `saveContributorSettings`: email when a reviewer decides (`reviewEmail`, honoured by `decideSubmission`), email and SMS about payment verification, and the community-activity choice above.
- **Payment details** — below.

Firestore rules no longer let a contributor update `contributors/{uid}` (they could previously switch their own workspace permissions back on) or read it (it holds internal editorial notes); both go through the callables above.

### Payment details and verification

Callables in `contributor-payments.ts`; statuses per method are `not_started`, `pending`, `verified`, `needs_action` and `rejected`, and a needs-action or rejected decision always carries a reason and a next step.

**Bank account.** `submitBankVerification` takes bank, branch, account holder and account number plus a statement or bank letter uploaded to `contributor-payout-statements/{uid}/{uploadId}/{file}`. Storage rules let the owner create that object once and never read, replace or delete it; the server re-checks the real type from the file's first bytes (PDF, JPEG or PNG), size (1 KB–10 MB) and ownership. Every submission is a new pending version; changing verified details resets them to pending and deletes the superseded statement. After saving, contributors see the account number masked (`•••• 3456`).

**MoMo wallet.** `startMomoVerification` sends a six-digit code over the existing Arkesel integration and `confirmMomoVerification` checks it. The code is stored only as a salted hash, expires after 10 minutes, locks after 5 wrong answers, has a 60-second resend cooldown and is rate-limited (5 starts an hour per contributor, 3 codes an hour per number, 20 confirmations an hour). A correct code proves control of the phone number only. This repository has no provider-backed wallet-name lookup (Paystack is used only for adverts), so wallet ownership stays **pending** until a finance reviewer decides it. A changed number needs a new code and a new review. When SMS is not configured the portal says so instead of pretending a code was sent.

**Finance review.** Admin → Publishing → Contributors → Payments (`ContributorPaymentsDesk`) is available only to finance reviewers: an administrator with the `finance: true` custom claim, or a super administrator. Other administrators do not load payout detail at all. `listContributorPayments` returns full details; `getPayoutStatementLink` issues a five-minute signed link and audits each opening; `decidePayoutVerification` records verify / needs action / reject against the exact version reviewed (a decision cannot land on details changed after the reviewer opened them), refuses self-review, writes `auditLogs`, and notifies the contributor in-app plus by email or SMS if they chose it. `rerunPayoutStatementCheck` repeats the automated check.

**Bank statement checks.** `contributor-statement-check.ts` can ask Gemini to read a statement and compare holder name, bank and account number with what the contributor typed. The result is filed on the profile as evidence for the finance reviewer; it never changes a status, and contributors see only per-field outcomes. It handles unreadable documents, mismatches and uncertain results, keeps only the name and bank as printed plus the last four digits, and logs reason codes only. **It is off** unless the Functions environment sets `CONTRIBUTOR_STATEMENT_CHECK=enabled`. On 2026-09-23 the project's Vertex AI `cacheConfig` did not disable caching (inputs and outputs can stay in memory for up to 24 hours), and Google may log prompts for abuse monitoring unless the project has an exception. Decide on both before enabling it.

**Errors.** Every new or changed contributor callable runs through `guarded()` (contributor-common.ts): a deliberate error keeps its message; anything unexpected is logged server-side with a reference such as `IW-1A2B3C4D` (account numbers and emails redacted) and reaches the contributor as a plain explanation carrying that reference, never as a bare `internal`. The raw `internal` error contributors saw before came from payment callables that had never been deployed; the portal now explains a missing backend instead.

`requestContributorPayment` and `decideContributorPaymentRequest` remain on the backend without a contributor form, as decided for the 2026-09-23 payment-profile release; requests now need a verified method and snapshot what was verified. `saveContributorPayoutProfile` stays only to tell the TribeStudio build deployed on 2026-09-23 to reload. `verifyContributorPayoutProfile` was replaced by `decidePayoutVerification`.

### Review changes

- Contributors can add an optional usage note (up to 1,000 characters) to an expression. `saveExpressionAnswer` stores it as `context`, copies it to the submission and receipt as `usageContext`, and puts it first in the reviewer notes; Admin → Contributors → Review shows it.
- Admin → Contributors → Review offers **Approve** and **Return with feedback**. The previous Request revision button always failed, because `decideSubmission` refuses that decision for collection contributions; returned expressions reopen for revision as before.
- `decideSubmission` notifications for portal expressions link to the expression (`/contributor/{uid}/{work}?item=`) rather than the old `/contribute` page, and skip email when the contributor turned review emails off.

### Deployment (not yet done)

Deploy these together; the workspace calls every one of them:

1. **Functions** — new: `getContributorSelf`, `updateContributorSelf`, `saveContributorSettings`, `onContributorPulseSubmissionWritten`, `kawuriContributorAssist`, `submitBankVerification`, `removePayoutMethod`, `setPreferredPayoutMethod`, `startMomoVerification`, `confirmMomoVerification`, `getPayoutStatementLink`, `decidePayoutVerification`, `rerunPayoutStatementCheck`. Changed or never deployed: `getContributorPayments`, `saveContributorPayoutProfile`, `requestContributorPayment`, `listContributorPayments`, `decideContributorPaymentRequest`, `saveExpressionAnswer`, `activateExpressionContributor`, `reportContributorIssue`, `getContributorIssues`, `decideSubmission`, `onNotificationCreated`. MoMo codes bind the existing `ARKESEL_API_KEY` secret.
2. **Firestore rules** and **Storage rules** — a separate deploy from Functions.
3. **TribeStudio** and **Admin** hosting.

Before or after deploying:

- Grant the `finance` custom claim to the administrators who will review payout details. No script in this repository sets it.
- Signed statement links need the Functions runtime service account to hold **Service Account Token Creator** on itself; the emulator test confirms the call fails without it.
- Optionally set `CONTRIBUTOR_PULSE_PEPPER`; otherwise the server-only key is created on first use. Set it once.
- Leave `CONTRIBUTOR_STATEMENT_CHECK` unset until the Vertex caching and abuse-monitoring decisions above are made.

Tests: `npm run test:contributor-portal` (backend unit tests and Studio workflow tests), `npm run test:contributor-e2e` (callables, triggers, rules and Storage against the emulators), `npm run test:rules` and `npm run test:storage-rules`.
