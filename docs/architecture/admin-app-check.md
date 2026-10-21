# Administration App Check

The admin Firebase web app (`1:111428711822:web:1b032129debe268429a0df`) uses a
dedicated reCAPTCHA Enterprise SCORE key. The public configuration is tracked in
`apps/admin/app-check.config.json`; it is a site identifier, not a credential.

Allowed hosts: `admin.indigenworld.com`, `indigen-admin.web.app`,
`indigen-admin.firebaseapp.com`. No localhost, wildcard or all-domain allowance.
The App Check registration uses a one-hour token TTL and minimum score 0.5.

`apps/admin/src/firebase.ts` initializes App Check before accessing Firebase
services, with automatic token refresh. Vite rejects malformed key overrides.
The committed default prevents deployments from silently omitting the key.

`services/functions/src/admin-app-check.ts` supplies mandatory deployed
enforcement to `onStaffCall` after callers' options, so the optional shared
`ENFORCE_APP_CHECK` setting cannot disable admin verification. `staffMfa` uses
the same options because it must be accessible before the second-factor gate.
The standard `FUNCTIONS_EMULATOR` runtime marker permits isolated emulator tests.
Role checks, owner restrictions and two-step verification remain mandatory.

This change does not enable replay-token consumption. Existing optional shared
callable settings retain their policies. It does not restrict valid attestations
to a single app ID; Firebase validates tokens from registered apps in this
project, then the existing staff/role checks control access.

## Scope and shared services

49 `onStaffCall` endpoints plus `staffMfa` are protected by this change. Shared
callables outside that wrapper (including `decideSubmission`) retain their
existing policy. Auth, Firestore and Storage App Check enforcement is a
project-wide setting. They remain UNENFORCED while other clients are checked;
the public website uses this same Firebase project and does not universally
initialize App Check. Enabling those controls now would block legitimate
clients. Direct Firestore/Storage operations continue to use their security
rules; this is not comprehensive project-wide App Check enforcement.

## Deployment and verification

1. Create/reuse the restricted score-based key and register its `siteKey` against
   the admin app with the App Check API (`recaptchaEnterpriseConfig.patch`).
2. Run `npm run test:staff-security`, `npm run test:rules` and
   `npm run check --workspace @indigen-world/admin`. Verify that a deliberately
   malformed key override fails the production build.
3. Deploy the verification bootstrap, the admin build, and the scoped protected
   callables. Never enable the shared flag across every callable for an
   admin-only rollout. Do not alter account claims or MFA secret values.
4. On the three production hosts, verify real reCAPTCHA token exchange, CSP,
   and the sign-in screen. Check no-token/invalid-token calls are rejected
   before handler execution. With valid App Check but no Auth token, the request
   should reach the sign-in check and still be rejected.

Production evidence and remaining limits are recorded in
`apps/updates-blog/posts/2026-10-21-admin-app-check/README.md`.

Official references: [web setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider),
[callable enforcement](https://firebase.google.com/docs/app-check/cloud-functions),
[registration API](https://firebase.google.com/docs/reference/appcheck/rest/v1/projects.apps.recaptchaEnterpriseConfig/patch).
