# Staff security: admin-console two-step verification and the owner-managed super administrator

Status: implemented 2026-10-21 (not yet deployed; see "Deploying").

## What it does

- **Two-step verification (TOTP) for every staff sign-in to the admin console.**
  Anyone with staff standing — a `validator`, `reviewer`, `admin` or owner
  `super_admin` role, the `finance` claim, or a `financeRole` — is stopped after
  Google sign-in. The first time, they set up an authenticator app (QR code or
  setup key, then a six-digit code) and receive ten one-time recovery codes.
  After that, **every sign-in** asks for a code.
- **A verified sign-in lasts at most 12 hours**, and the console signs out after
  **30 minutes without input** in any of its tabs. The sign-in screen says why.
- **The super administrator is owner-managed.** Only the uids in
  `OWNER_SUPER_ADMIN_UIDS` are honoured as super administrator, by the backend
  and both rule files. A `super_admin` role or `superAdmin` claim on any other
  account counts as no role at all. No callable or script can assign it.

## How the second factor is enforced

Firebase Auth's own multi-factor sign-in was not used: it applies to every
sign-in of the account (the mobile app and TribeStudio included) and would lock
admins out of the Flutter app, which has no MFA resolver. Instead the second
factor is bound to one console sign-in:

1. `staffMfa` callable (`services/functions/src/staff-mfa.ts`) checks the code
   (RFC 6238, HMAC-SHA1, 30 s, ±1 step, replay refused via `lastStep`; five
   wrong codes lock for 15 minutes and write `staff_mfa.locked` to the audit log).
2. On success it adds the sign-in's `auth_time` to the account's `staffMfa`
   custom claim (newest five kept, each under 12 hours). `auth_time` is set by
   Firebase Auth at sign-in and survives token refresh, so a new sign-in
   anywhere — with the same Google password — has a new `auth_time` and must
   verify again.
3. The console refreshes its ID token; `hasVerifiedStaffSession` is then true.

Where it is checked:

| Layer | Check |
| --- | --- |
| Callables | Every callable the console invokes is declared with `onStaffCall` (`auth.ts`): a staff caller without a verified session gets `failed-precondition` / `staff-mfa-required`. Non-staff callers fall through to the handler's own role checks. `reviewSubmission` protects admin-console submission editing and decisions. `decideSubmission` stays on `onCall` because the mobile app and TribeStudio review desks use it; both entry points share the same decision handler. |
| Firestore rules | `hasVerifiedStaffSession()` on `auditLogs`, `teamSiteRequests`, `publicFormSubmissions`, `newsletterSubscribers`, `payouts` and writes to `platformConfiguration`. `staffMfa/**` is closed to every client. |
| Storage rules | Finance receipt uploads require a verified session. |
| Console | `TwoStepGate` (`apps/admin/src/security/`) before anything else renders; 12-hour and idle sign-out in `sessionLimits.ts`. |

Secrets at rest: the TOTP secret is sealed with AES-256-GCM under the
`STAFF_MFA_KEY` secret, bound to the uid; recovery codes are stored as keyed
HMAC-SHA256 hashes. Firestore exports never contain a usable secret.

## Recovery

- Lost phone, recovery codes kept: "Use a recovery code" on the verify screen.
- Lost both: the super administrator resets the person from Governance → Staff
  security (`staff_mfa.reset` in the audit log). They enrol again next sign-in.
- The owner lost both: run, from a machine with owner credentials,
  `RESET_STAFF_MFA=confirm node firebase/seed/reset-staff-mfa.mjs <email>`.
- New phone with the old one in hand: account menu → Two-step verification →
  "Use a new authenticator app". New recovery codes: same dialog.

## Other admin-console hardening in the same change

- `setUserRole`: `super_admin` is not assignable; nobody changes their own
  role; only the super administrator grants, changes or removes `admin`; an
  owner account cannot be changed. Previously any admin could demote the super
  administrator or another admin.
- `setContributorAccess`: nobody suspends their own sign-in; only the super
  administrator restricts an admin; the owner is never restricted from here.
  Previously any admin could disable the super administrator's login.
- `isFinance()` (rules) now needs `finance` on an admin, matching the backend.
- `firebase/seed/grant-admin.mjs` only re-asserts the owner's own claim;
  `set-role.mjs` cannot assign or change `super_admin`.
- Admin hosting sends a Content-Security-Policy (hash-pinned inline bootstrap
  script, no `unsafe-inline` scripts, `frame-ancestors 'none'`), COOP
  `same-origin-allow-popups`, and `no-cache` on HTML so security fixes reach
  browsers on the next load. The team-site print export no longer relies on an
  inline script (blocked by the CSP) and no longer opens with `noopener`, which
  made it silently fail.
- Google sign-in always shows the account chooser.

## Deploying

Order matters: rules that require verified sessions must not reach production
before the console that can verify.

1. Create the key (owner, once):
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | firebase functions:secrets:set STAFF_MFA_KEY --data-file - --project project-kassena-7e026`
2. Functions: the full set from this build. Every function shares one bundle
   and the role checks changed in shared helpers (`auth.ts`,
   `contributor-common.ts`), so a partial deploy would leave older functions
   honouring a super-administrator claim on any account.
3. Admin hosting (`indigen-admin`).
4. Firestore and Storage rules.

Every staff member, including the owner, sets up an authenticator the next
time they open the console.

## Known limits

- **Admin App Check:** dedicated production registration and mandatory
  protected-admin callable enforcement are implemented. See
  [admin-app-check.md](admin-app-check.md) and its linked release evidence for
  current deployment status. Shared project Auth/Firestore/Storage and shared
  callables outside `onStaffCall` retain their existing policies.
- Staff powers used **outside** the console (mobile and TribeStudio moderation,
  dictionary review, `decideSubmission`) are not behind the second factor; the
  Google account's own security protects them.
- Role changes reach an already-issued ID token within an hour (token refresh).
- Content collections the console edits directly through Firestore (learning
  units and lessons, heroes, names, apps, campaigns, shop catalogue) are still
  gated by role alone. Moving them behind `hasVerifiedStaffSession()` needs a
  check of which other clients write them first.

Tests: `npm run test:staff-security` (unit, emulator integration, rules).
