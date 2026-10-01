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

The shared `decideSubmission` workflow displays submissions in the mobile Review Desk → Contributions, Admin → Review Desk → Contributions, and the contributor-focused Admin → Contributors → Review table. Approvals publish to `expressionEntries` as whole expressions (since 2026-09-27; see [Everyday expressions](everyday-expressions.md)); primary and alternate Kasem phrasings remain available in `translations` and `alternativeExpressions`. Portal expressions published to `dictionaryEntries` before then stay there until they are unpublished or re-published. The existing self-review and withdrawal safeguards apply. The portal offers search and separate **Not started**, **Drafts**, **Submitted**, and **Needs revision** filters, with submitted progress counted from actual submission IDs. Rejected and needs-revision items reopen for editing with reviewer feedback. The backend checks the canonical review state before permitting changes. Resubmission creates a new deterministic, linked review round (`revisionOf` and `previousReview`), preserves the original decision, requires renewed consent, and ignores late old-round events when projecting the current assignment. Pending and approved submissions are locked; individual statuses and reviewer feedback distinguish approvals from rejections or escalations. Autosave keeps the current editor open when its draft status changes. Submit and next opens the next not-started expression in assignment order, wrapping to earlier unfinished expressions, and retains confirmation of the previous submission. On phones, the expression list opens first with a separate editor and Back to expressions control. Collection review continues to use approve/reject/escalate; rejected portal expressions can be revised and resubmitted through this dedicated workflow.

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

**Status: deployed on 2026-09-23 from `main` at `e90c5fb`** — Functions, Firestore and Storage rules, and TribeStudio and Admin hosting (see [Deployment](#deployment--2026-09-23)). The signed-in production flows have not been exercised yet: everything was verified with unit tests, emulator end-to-end tests, the dev-only preview, unauthenticated probes of the live functions and the live bundles.

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

### Deployment — 2026-09-23

Deployed from `main` at `e90c5fb`, after the full local check suite (GitHub Actions could not run: the account was locked over billing).

- **Functions:** every export redeployed in explicit `--only` batches — 18 creates and 114 updates. Live and exported were 132 each, with an empty diff both ways, so nothing could be deleted. `rerunPayoutStatementCheck` was created, but setting its public invoker failed; a Firebase redeploy did not re-apply it, so the `allUsers` → `roles/run.invoker` binding every other callable has was added with `gcloud run services add-iam-policy-binding`. Unauthenticated probes of the new callables answer with their own "Sign in is required." message.
- **Firestore rules and Storage rules** compiled and were released.
- **Hosting:** `tribestudio`, `indigen-admin`, `indigen-world` and `kasem-dictionary` released. The live bundles contain the workspace, the Admin finance desk and the contribution-context fields.
- **Signing grant:** the Functions runtime service account (`111428711822-compute@`) already holds Service Account Token Creator on itself (checked 2026-09-23), so statement links can be signed.

What deployment required:

1. **Functions** — new: `getContributorSelf`, `updateContributorSelf`, `saveContributorSettings`, `onContributorPulseSubmissionWritten`, `kawuriContributorAssist`, `submitBankVerification`, `removePayoutMethod`, `setPreferredPayoutMethod`, `startMomoVerification`, `confirmMomoVerification`, `getPayoutStatementLink`, `decidePayoutVerification`, `rerunPayoutStatementCheck`. Changed or never deployed: `getContributorPayments`, `saveContributorPayoutProfile`, `requestContributorPayment`, `listContributorPayments`, `decideContributorPaymentRequest`, `saveExpressionAnswer`, `activateExpressionContributor`, `reportContributorIssue`, `getContributorIssues`, `decideSubmission`, `onNotificationCreated`. MoMo codes bind the existing `ARKESEL_API_KEY` secret.
2. **Firestore rules** and **Storage rules** — a separate deploy from Functions.
3. **TribeStudio** and **Admin** hosting.

Still open after deployment:

- Grant the `finance` custom claim to the administrators who will review payout details. No script in this repository sets it; until someone holds it, submitted payment details wait as pending.
- A signed-in smoke test: Overview counts, a returned expression, Kawuri, a bank submission and a finance decision, and a MoMo code on a real handset.
- `CONTRIBUTOR_PULSE_PEPPER` is not set, so the server-only key is created on the first pulse event. Set it once, or leave it.
- `CONTRIBUTOR_STATEMENT_CHECK` stays unset until the Vertex caching and abuse-monitoring decisions above are made.
- Signed statement links need the runtime service account to hold Service Account Token Creator on itself. It does today; the emulator test confirms the call fails without it.

Tests: `npm run test:contributor-portal` (backend unit tests and Studio workflow tests), `npm run test:contributor-e2e` (callables, triggers, rules and Storage against the emulators), `npm run test:rules` and `npm run test:storage-rules`.

## Contributor and reviewer workspaces — 2026-10-01

**Status: implemented on branch `claude/zen-faraday-lskj12`; not deployed.** Hosting can go out before or after the Functions below: older Functions ignore the new optional fields, so the safeguards switch on when the Functions are deployed.

The contributor portal and the review desk were redesigned together as one workspace with two sides: **Contributing** and **Reviewing**. Accounts with both roles switch between them from the sidebar. Access is unchanged: an active `contributorAccounts/{uid}` record for the contributor side, and `canValidate` (validator, reviewer, admin, super_admin) for the review side, both enforced again by every callable.

### Design system

- Tokens and base controls live in `apps/tribestudio/src/contributor/styles/portal.css`, scoped to `.cw` and `.cw-auth`: neutral surfaces, one blue accent (`#1f50d6`), signal colours with soft and line variants, a type scale, a 4px spacing grid, radii, shadows for floating things only, and motion that `prefers-reduced-motion` turns off. `shell.css` holds the shared shell, `pages.css` the page layouts and `review.css` the review screens. The Kassena triangle band (indigo and terracotta, from `@indigen-world/design-tokens`) appears once per screen.
- Shared components: `components.tsx` (panels, badges, notices, fields, filters, pagination, confirmation dialog, empty and loading states) and `shell.tsx` (sidebar, role switcher, top bar and bottom tab bar under 1024px). Both workspaces use them; nothing is styled per page.
- The portal no longer uses the console kit's `.iwx` surface styles. It keeps `TableShell` for every table, so `validate-studio` still guarantees tables are contained.
- Removed: decorative artwork, the gradient Kawuri card, the gamified points banner and the separate streak page (a quiet line on Rewards now).
- The review workspace, the guided contribution forms and profile settings load on demand (`lazy.tsx`). A contributor's first visit now downloads about 53 KB of compressed portal code, against 58 KB before the redesign.

### Contributor routes

| Route | Page |
|---|---|
| `/contributor` | Overview: what needs attention (revisions, payment details), where to continue, submission counts by status, recent activity, today's batch, points, Community today (only with live data) |
| `/contributor/assignments` | Tasks |
| `/contributor/{uid}/{work}?item=` | A task and its editor. Unchanged, so SMS links keep working |
| `/contributor/contribute` | Start a contribution: assigned tasks, everyday expression, dictionary word or pronunciation |
| `/contributor/contribute?type=expression` (`&correct={id}`) | Four-step expression form; `correct` corrects a declined expression once |
| `/contributor/contribute?type=word` | Dictionary word form |
| `/contributor/contribute?type=recording` (`&entry={id}`) | Pronunciation: choose a published word, record or upload, send |
| `/contributor/contributions?status=&type=&view=` | My submissions; `view={row key}` opens one submission with its feedback and history |
| `/contributor/revisions` | Work returned with feedback, declined expressions that can be corrected, recordings to record again |
| `/contributor/rewards` | Points, rules, redemption and the points ledger |
| `/contributor/activity` | Updates |
| `/contributor/guide?section=` | Guidelines |
| `/contributor/kawuri` | Kawuri assistant |
| `/contributor/account/{profile,security,notifications,payments}` | Profile and settings |

`/contributor/streak` opens Rewards, and the old `contributions?filter=` values map to the new status filters.

### Review routes

| Route | Page |
|---|---|
| `/contributor/review` | Overview: server counts for every queue, the oldest waiting contribution, your recent decisions |
| `/contributor/review/queue?desk=&view=&type=&dialect=&age=&q=&sort=&page=` | Queue. Filters live in the address, so a filtered queue can be bookmarked |
| `/contributor/review/{desk}/{id}` | One item: the material, its history and the decision |
| `/contributor/review/history` | Items whose latest decision is yours (contributions, pronunciations, Kasem names) |
| `/contributor/review/guide?section=` | Review guidelines, each section naming its source |
| `/contributor/review/account` | Who you are signed in as and what review access allows |

Desks: contributions (`submissions`), pronunciations (`pronunciationRecordings`), sentences (`grammarNotes`), Kasem names and adverts. Queues are ordered by the existing indexes where they exist (submissions oldest first; recordings newest first and sorted on the client), cut at 250 per status with a notice, filtered by type, dialect and waiting time on the client, sorted stably (ties by id) and paged 20 at a time.

### What changed in the workflows

- **Assigned translations:** the existing editor with its autosave, recovery copy, conflict check, skip and resubmission rounds, restyled. It now asks for confirmation before sending, and the retry controls appear for every failed save, including failures that carry no message.
- **Everyday expressions:** four steps (the expression, meaning and use, source and permission, check and send) with examples beside unfamiliar fields, validation per step, a draft kept in the browser, and a request id so a retried send is filed once. A declined expression can be corrected once, linked to the original.
- **Dictionary words:** a compact form with a duplicate-spelling check against published words and an optional pronunciation that uploads once and is reused on retry.
- **Pronunciations:** record (the microphone is released afterwards; 30 seconds at most) or upload a file, listen back, record again, choose whether it may be published, send. Typed and recorded work stays on the page if the upload or send fails.
- **Tracking:** one list for all four kinds, with search, type and status filters, sorting and pages of 25. A submission page shows where it stands, the reviewer's feedback, what was sent and every round. Status names keep approval, publication, "kept, not published" and withdrawal apart; approval never reads as publication or payment.
- **Rewards:** available points, points earned, translations awaiting review, and a cash balance stated as "None — points are not money". The rules come from `settings/contributorRewards`; the ledger joins `rewardCredits` with airtime and data redemption requests. Redemption shows the exact conditions and is reviewed by hand, so it is not instant.
- **Review:** the source and the contribution side by side, the previous round and the last reviewer's request for resubmissions, the attached audio or media, a dictionary spelling check for words, an optional four-point checklist saved as `scores`, and decision cards that say what each decision does for that item. Sending work back needs at least 15 characters of feedback; reusable reasons are starting points. Every decision is confirmed in a dialog. Own submissions show no decision controls. If someone else decides first, the decision is refused and the reviewer is told. Sentences are judged per version on meaning, grammar, naturalness and context fit, with dialect competence confirmed and a written explanation for any concern.

### Backend changes (Functions deploy needed)

- `decideSubmission` accepts optional `expectedStatus` and `expectedVersion` (`lifecycle.version`) and refuses a decision made on an out-of-date view with `aborted`, writing nothing.
- `decidePronunciationRecording` refuses decisions on the reviewer's own recording and claims the decision in a transaction: a two-minute `decisionLock` stops a second decision while an approval copies audio, and is cleared when it finishes or fails. Rejections are written inside the claim and now leave an audit row as approvals do.
- `submitExpression`, `submitCollectionContribution` and `submitPronunciationRecording` accept an optional `requestId`. The record's id is derived from the caller and the request, and the request content is fingerprinted (`requestFingerprint`): the same request again returns the first record (`replayed: true`); a different request under the same id is refused with `already-exists`.
- `submitPronunciationRecording` accepts an optional `source` (`learn_speak`, the default, or `contributor_portal`).
- The rules above are pure functions in `services/functions/src/review-guards.ts`.
- No Firestore rules, Storage rules or indexes change. Portal uploads use `creator-submissions/{uid}/{collection-contributions|pronunciations}/{id}/take.{ext}`, which the existing Storage rules already allow.

Deploy: `firebase deploy --only functions:decideSubmission,functions:decidePronunciationRecording,functions:submitExpression,functions:submitCollectionContribution,functions:submitPronunciationRecording`, then TribeStudio hosting.

### Records and migration

No record is rewritten, deleted or backfilled. Records created before this change display as before; new fields appear only on records created or decided after the Functions deploy.

- **Expressions filed as dictionary words.** Invited contributors' expressions published before 2026-09-27 are still in `dictionaryEntries`. `decideSubmission` already moves one to `expressionEntries`, and takes the dictionary row down, when it is published again. The plan: list the affected submissions (published submissions with `contributorPortal` set whose `dictionaryEntries/collection_{submissionId}` row is published), have an editor confirm each, then either call `decideSubmission` with `PUBLISH` for each (accepted for published work; one transaction moves it), or unpublish it in Admin → Contributors → Expression review and publish it again from the review workspace (it is not public in between). Not run here: it changes public records.
- **Mobile proverbs** submitted through Collection dictionary contributions still publish to `dictionaryEntries` as sayings. Routing them to Expressions is a mobile and backend change outside this one.
- Points, redemptions and payment details are unchanged.

### Not built, and why

- **Assigned reviews.** There is no assignment model for reviewers in the backend; every reviewer sees every queue. Conflicting decisions are prevented by the expected-status check instead.
- **Open forms for sentences and longer texts.** Sentences go through the existing sentence workflow, and longer texts through TribeStudio creator submissions. The contribute page says so rather than offering a form the backend cannot take.
- **Review history for sentences and adverts.** The sentence projection does not record when each reviewer judged, and adverts record no reviewer. The history page says this.
- **Bulk decisions.** Not supported by the callables, so not offered.
- Review turnaround times and payment rates are not published; the guidelines say so.

### Verification — 2026-10-01

- `apps/tribestudio`: `npm test` — 69 tests, including new tests for submission states, queue filtering and sorting, decision rules and requests, publish targets, conflict messages, sentence judgments, the rewards ledger and eligibility, and review routes; `npm run build` and the root `npm run typecheck` and `npm run build` pass.
- Backend: `npm run test:function-helpers` — 594 of 595 pass, including the new `firebase/tests/reviewGuards.test.mjs` (8 tests) and the updated recording assertion. The one failure, `languageLoop.test.mjs`, needs the generated, git-ignored `data/word-seed/word-queue.ndjson` and fails the same way without this change.
- Emulator end-to-end tests: 51 of 51 pass, including the new `reviewSafeguards.e2e.test.mjs` (a retried send creates one expression and a changed one is refused; a stale decision is refused and nothing changes; a recording cannot be decided by its speaker, twice, or while another decision holds it) and the existing contributor, expression, creator, decision, dictionary, language-loop and form suites.
- The Functions emulator cannot load `lib/bundle.mjs` on Node 22.22 because `services/functions/src/index.ts` has a top-level `await import('./support-whatsapp.js')`; the runs above used a local build with that optional block removed from the generated file. The source is unchanged.
- Browser journeys against the dev-only preview (`/contributor/preview`, `/contributor/preview/review`), at 1440px and 390px: find a task, save, submit and track it; revise and resubmit after feedback; keep typed work through a dropped connection and retry; send a guided expression once after a failed send; read the rewards rules and state; review text and audio, require feedback, refuse decisions on one's own work, and refuse a decision someone else made first; judge a sentence. Screens were checked at 1440, 834 and 390px with no horizontal scrolling and no console errors.
- Still to do after deployment: a signed-in production smoke test of both workspaces, including one decision of each kind on designated test records.
