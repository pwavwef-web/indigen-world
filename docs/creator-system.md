# Indigen World Founding Creators System

The first layer of TribeStudio's permanent creator-management infrastructure. It
currently backs the **Kasem Creator Challenge** under **Project Kassena**, but the
data model, rules and functions are campaign- and language-agnostic and reusable
for future Indigen World languages and communities.

The system is **state-driven**: what the interface exposes (waitlist vs.
submissions) is derived from a campaign's `status` field in Firestore, so an admin
can open submissions with **no frontend redeploy**.

---

## 1. Routes

### TribeStudio (`apps/tribestudio`) — public, no auth required
| Route | Page | Purpose |
| --- | --- | --- |
| `/` · `/creators` | `LandingPage` | Founding-creators programme landing (co-branded hero, categories, how-it-works, benefits, rules, live campaign status, FAQs, CTAs). |
| `/creators/join` | `JoinPage` | 5-step application (Account → About you → Language → Interests → Consent) with localStorage draft preservation and progress indicator. |
| `/creators/join/success` | `SuccessPage` | Confirmation with creator reference number, status, next step, WhatsApp card. |
| `/creators/guidelines` | `GuidelinesPage` | CMS-style guideline sections (from config, with fallback). |
| `/creators/faq` | `FaqPage` | Programme FAQs (from config, with fallback). |

### TribeStudio — authenticated workspace (`/studio*`)
| Route | Page |
| --- | --- |
| `/studio` | `DashboardPage` — status, profile completion, campaigns, notifications; calm "preparation" state while submissions are closed. |
| `/studio/profile` | `ProfilePage` — editable public/private sections, public-attribution preview, consent history. |
| `/studio/opportunities` | `OpportunitiesPage` — campaign listing with eligibility state. |
| `/studio/opportunities/:id` | `OpportunityDetailPage` — overview, brief, rules, rewards, judging, rights, FAQs; "Submit" when open / "Notify me" otherwise. |
| `/studio/submissions` | `SubmissionsPage` — list with human-readable statuses. |
| `/studio/submissions/new?campaign=:id` | `SubmissionNewPage` — 4-step submission flow with resumable upload, autosave, separate permissions; **gated on `SUBMISSIONS_OPEN`**. |
| `/studio/submissions/:id` | `SubmissionDetailPage` — status, reviewer feedback, permissions. |
| `/studio/notifications` | `NotificationsPage` — in-app notifications; mark-as-read; preference note. |
| `/studio/help` | `HelpPage` — searchable FAQ, troubleshooting, report-a-problem. |
| `/workspace` | `LexiconWorkspace` — the **preserved** original contributor/validator lexicon workspace. |

### Admin (`apps/admin`) — staff only
`Console` (existing scaffold) and a new **Creators** section with sub-tabs:
`Overview`, `Applications`, `Campaigns`, `Review queue`, `Configuration` (admin), `Audit log` (admin).

---

## 2. Components created
- **Routing:** `apps/tribestudio/src/router.tsx` (dependency-free History-API router with params).
- **Creator surfaces:** `apps/tribestudio/src/creator/` — `CreatorProvider`, `PublicLayout`, `StudioLayout`, `components.tsx` (StatusPill, WhatsAppCard, Stepper, Field, EmptyState, Callout, Skeleton), `data.ts`, `creator.css`, and `pages/*`.
- **Preserved workspace:** `apps/tribestudio/src/workspace/LexiconWorkspace.tsx` (extracted from the old `App.tsx`).
- **Analytics:** `apps/tribestudio/src/analytics.ts` (`trackEvent`, privacy-conscious event names).
- **Admin:** `apps/admin/src/creators/` — `data.ts` (+ `useAdminAuth`), `CreatorsAdmin.tsx`, `creators-admin.css`.

---

## 3. Firestore collections & key fields
Typed by JSON Schema in `packages/contracts/schemas/*` and by TS models in
`packages/contracts/creator-models.d.ts` (import: `@indigen-world/contracts/creator-models`).

| Collection | Written by | Notes |
| --- | --- | --- |
| `platformConfiguration/creators` | admin | Public-read config: WhatsApp URL, dialects, categories, formats, media limits, guidelines, FAQs, terms versions. |
| `campaigns` | admin | `status` drives the whole UI; `visibility: public\|internal`. |
| `creatorProfiles` | owner + server | `public` vs `contact` vs admin fields separated; `reference`, `status`, `consentRefs` server-managed. |
| `creatorApplications` | **server only** | Created by `submitCreatorApplication`; status transitions privileged. |
| `submissions` | owner (drafts) + server (moderation) | Raw media private in Storage; `moderation`/`rewardEligible` server-only. |
| `publishedContent` | **server only** | The **only** mobile-app-facing collection; public-read when `publicationStatus == 'published'`. |
| `notifications` | server; owner may flip `read` | |
| `creatorConsents` | **server only** | Immutable consent ledger. |
| `supportRequests` | owner creates, staff resolves | |
| `communications` | admin | Announcements + delivery logs. |
| `payouts` | **server only** | Read restricted to `finance`/`superAdmin` claims. |
| `platformCounters` | server | Reference-number sequences. |
| `auditLogs` | server | Append-only; admin-readable (existing). |

All records use `lifecycle {createdAt, updatedAt, version}` and `schemaVersion`.

---

## 4. Security rules
`firebase/firestore.rules` and `firebase/storage.rules`. Enforced invariants
(all covered by tests):
- Guests read only public campaigns, published content, config, FAQs/guidelines.
- Creators read/edit only their own profile fields; **cannot** self-set `status`, `reference`, or consent history.
- Creators access only their own applications and submissions — **one creator cannot read another's submission**.
- Creators **cannot** approve, publish, or mutate moderation state; those are server-only.
- **Raw submission media stays private**; approved public media lives under `published-media/*`.
- `publishedContent` is created only by the trusted workflow (client writes denied).
- An **admin without a `finance` claim cannot read payouts** (separation of duties).
- Storage: uploads restricted to `creator-submissions/{uid}/…`, size- and type-checked.

---

## 5. Cloud Functions (`services/functions/src/creators.ts`)
All are v2 callables with App Check (outside the emulator), per-actor rate
limiting, audit logging, and atomic transactions.
- **`submitCreatorApplication`** — dedupes by account/email; mints a human-readable reference (`KCC-2026-0001`); creates profile + application + consent-ledger entry + notification + audit atomically. Under-18 → flagged for manual review.
- **`decideCreatorApplication`** (admin) — APPROVE / WAITLIST / REJECT / REQUEST_INFO / SUSPEND; updates profile status + notification + audit.
- **`decideSubmission`** (validator/admin) — APPROVE / REQUEST_REVISION / REJECT / PUBLISH / UNPUBLISH / ESCALATE_* ; approval + publication write an **idempotent** `publishedContent` record keyed `pub_{submissionId}` (no duplicate public records). Reviewers cannot decide on their own submissions.

Existing `decideReview` and `setUserRole` are unchanged.

---

## 6. Feature flags / lifecycle
No new flag system — the campaign **`status`** field is the flag:
`DRAFT → WAITLIST_OPEN → WAITLIST_CLOSED → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED → JUDGING → COMPLETED → ARCHIVED`.
Move a campaign to `SUBMISSIONS_OPEN` in **Admin → Creators → Campaigns** and eligible creators gain the submission workflow immediately, no redeploy.

---

## 7. Firestore indexes
Added to `firebase/firestore.indexes.json` for: campaigns (visibility+status),
creatorApplications (status+createdAt; campaign+status+createdAt), submissions
(authUid+updatedAt; campaign+status+createdAt; status+createdAt), publishedContent
(publicationStatus+publishedAt; +campaign), notifications (authUid+createdAt).

Deploy with `firebase deploy --only firestore:indexes`.

---

## 8. Environment variables
- `VITE_USE_EMULATORS=true` — point tribestudio **and admin** at the local emulators.
- `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` — **optional.** App Check site key for the web apps. App Check is **not currently configured** in `project-kassena-7e026` (reCAPTCHA Enterprise was never enabled), so this is unset and App Check is off. Set it (both apps) once App Check is configured.
- `ENFORCE_APP_CHECK` — **functions runtime var, opt-in.** All callable functions read `process.env.ENFORCE_APP_CHECK === 'true'`; it defaults **off** so functions work without App Check. Turn it on (set on the deployed functions) after configuring App Check + the site key above.
- `FUNCTIONS_DISCOVERY_TIMEOUT` — set to `120` by the `test:e2e` script (via `cross-env`) and passed on deploy, because the Firebase Admin/Functions SDK cold-load (~9s) is close to the default 10s discovery timeout on some machines.

Firebase web config values in `apps/*/src/firebase.ts` are **public identifiers, not secrets**.

### Functions packaging (deployability)
`services/functions` is **bundled with esbuild** (`npm run build:functions` → `lib/bundle.mjs`, the package `main`). The bundle inlines the workspace package `@indigen-world/contracts` (which is not published to npm and previously broke Cloud Build's `npm install`); `firebase-admin`, `firebase-functions`, `ajv`, `ajv-formats` stay external and installable. Deploy functions **scoped by name** so unrelated project functions (`verifyPaystackDonation`, `sendWelcomeEmail`) are never deleted:
```bash
firebase deploy --only functions:decideReview,functions:setUserRole,functions:submitCreatorApplication,functions:decideCreatorApplication,functions:decideSubmission
```

---

## 9. Manual setup steps
1. `npm install` (adds `cross-env` dev dependency).
2. Seed the WhatsApp URL / dialects / categories via the seed or Admin → Configuration.
3. Grant staff roles with the existing `setUserRole` function (`validator`/`admin`).
4. For payout access, set a custom claim `finance: true` (or `superAdmin: true`) on the relevant account.
5. Deploy: `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting`.

---

## 10. Seed data (dev only)
`firebase/seed/seed.mjs`, run with:
```bash
npm run seed
```
Creates (fictional data): one `WAITLIST_OPEN` Kasem Creator Challenge, the config
document, three profiles (complete/incomplete/active), applications across
statuses (SUBMITTED / UNDER_REVIEW / APPROVED / WAITLISTED / NEEDS_INFO+flagged),
submissions (DRAFT / SUBMITTED / NEEDS_REVISION / PUBLISHED), one published-content
record and notifications. Requires the emulator (`FIRESTORE_EMULATOR_HOST`).

---

## 11. Tests
- `npm run test:contracts` — schema + example validation (17/17).
- `npm run test:rules` — Firestore rules (`firebase/tests/creator.rules.test.mjs`): cross-creator isolation, no self-approve/publish, raw-media privacy, published-content visibility, application non-writability, finance-gated payouts, notification read-only. (30/30 with existing.)
- `npm run test:e2e` — trusted functions (`firebase/tests/creatorFunctions.test.mjs`): application mint + dedupe, reviewer-only moderation, content-not-public-before-approval, idempotent publish, no self-review. (6/6 with existing.)
- `npm run typecheck` / `npm run build` — all workspaces green.

---

## 12. Mobile-app integration contract
The mobile app consumes **only** `publishedContent` where `publicationStatus == 'published'`
(shape in `published-content.schema.json` / `PublishedContent`). It contains public
attribution, media delivery reference, language/dialect/category, cultural notes,
age rating, tags and licence display — and **never** raw media paths, private
contact data, internal reviews, notes or payout data. Publication is idempotent.

---

## 12a. Deployed to production (`project-kassena-7e026`)
- **Firestore rules, indexes, Storage rules** — released.
- **Functions** — `decideReview`, `setUserRole`, `submitCreatorApplication`, `decideCreatorApplication`, `decideSubmission` (bundled). Existing `verifyPaystackDonation` and `sendWelcomeEmail` left untouched.
- **Hosting** — https://tribestudio.web.app and https://indigen-admin.web.app (website `indigen-world` unchanged, not redeployed).
- **Bootstrap** — `firebase/seed/prod-bootstrap.mjs` wrote `platformConfiguration/creators` and the `kasem-creator-challenge` campaign (`WAITLIST_OPEN`, public). Idempotent; guarded by `PROD_BOOTSTRAP=confirm`.
- **First admin** — the project owner's account was granted `role: admin` (audited) so the console is usable.
- **Verified live**: anonymous reads of the public campaign/config succeed; anonymous read of a submission returns 403 (raw media private).

To open submissions later with no redeploy: Admin → Creators → Campaigns → set the campaign to `SUBMISSIONS_OPEN`.

## 13. Intentionally deferred
Built to a functional first release focused on the current pre-launch need
(waitlist registration, profile, admin review) plus the state architecture that
unlocks submissions. Deferred to later iterations, with data model + rules already
in place:
- Admin **Rewards/Payouts**, **Communications** send, **Consents**, **Directory** and **Analytics** dashboards have collections + rules but minimal/no UI yet.
- Email delivery uses the notification records + `mailto` from Help; wiring to a
  transactional email provider is a follow-up.
- Guardian-consent capture for minors currently flags the application for manual
  review rather than running a full guardian flow.
- Bundle size: TribeStudio is a single bundle (~214 KB gzip, Firebase-dominated);
  route-level code-splitting is a possible optimisation. Admin is a separate app,
  so creator users never download admin code.
