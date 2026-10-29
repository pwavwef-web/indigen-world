# A stronger gate for Administration

**Blogger:** Published on Indigen World Updates on 29 October 2026: https://updates.indigenworld.com/2026/10/a-stronger-gate-for-administration.html

Status: **Deployed and verified October 21, 2026.** Blogger unpublished; community sharing pending.

- Title: A stronger gate for Administration
- Labels: Administration, Security, App Check, Staff tools
- Search description: App verification adds another check before protected Indigen World Administration requests can proceed.
- Suggested permalink: administration-app-check
- Article body: `post.html`; sharing handoff: `share.md`.

## Scope

Dedicated score-based reCAPTCHA Enterprise key for `admin.indigenworld.com`, `indigen-admin.web.app` and `indigen-admin.firebaseapp.com`, registered against the admin Firebase web app with a one-hour token lifetime and minimum score 0.5. Public configuration is tracked in `apps/admin/app-check.config.json`. App Check initializes before other Firebase services; malformed key overrides fail the build.

The `onStaffCall` wrapper and the `staffMfa` bootstrap require App Check outside Firebase emulators, independently of the shared optional `ENFORCE_APP_CHECK` flag. Existing role and verified-session checks stay in place. No account roles, owner lists or MFA secret values are changed by this update.

This is admin callable enforcement. Shared project Authentication/Firestore/Storage remain UNENFORCED to preserve other clients. Shared callable exceptions, including `decideSubmission`, retain their existing policy. This does not claim comprehensive project-wide enforcement.

## Verification

Production source: `ac24a8b43491c9f0b49e6f86540ff71616e89a1e`, merged through [PR #33](https://github.com/pwavwef-web/indigen-world/pull/33). Firebase CLI 15.34.0 deployed `staffMfa` and all 49 protected admin callables; all 50 were verified ACTIVE through the Functions API. The actual Hosting release completed at **13:40 UTC**, version `7d17c9dc79f67c60`. The Firebase MCP tool initially reported success without updating the live version; the subsequent CLI release and API/file verification confirmed the actual deployment.

All three production hosts served HTML matching the tested build byte-for-byte, obtained real App Check tokens (HTTP 200, one-hour TTL), and showed the Administration sign-in page without JavaScript or CSP violations. Each host passed nine live transport probes across `staffMfa`, `setUserRole` and `financeCentre`: missing/invalid attestation was rejected by App Check; valid attestation reached the separate sign-in requirement and was still rejected without Firebase Auth. No account, claim, role, MFA enrolment or business record was changed by these probes. Full Google sign-in and staff authenticator entry were not exercised.

Local DNS/connection timeouts required mapping these three known hostnames to Firebase Hosting's `199.36.158.100` in the verification browser. The final browser checks used actual HTTPS responses, normal certificate validation and the deployed CSP, with no route interception or security bypass. Earlier origin-intercepted build previews are not represented as live-host evidence.

Final checks passed: admin check/build and built-HTML CSP validation; malformed-key build rejection; 16 staff/App Check unit tests; 11 staff emulator integration/rules tests; all 207 Firestore rules tests. Both final required test commands exited successfully. Earlier local CLI shutdown errors were resolved on rerun. Hosting predeploy also passed the repository's clean-origin/main gate and configured website, dictionary and TribeStudio checks without releasing those sites. Evidence: [release-evidence.json](release-evidence.json).

## Images and Blogger publishing

`screens/admin-sign-in.png` is an actual deployed product capture from October 21. `images/cover.png` and `images/admin-sign-in.jpg` use the repository's release artwork renderer; their frames and text are editorial design. Credit: Indigen World product interface and repository artwork renderer. No external image assets.

Before publication, upload both `images/` assets to Blogger and replace the relative image URLs in `post.html` with their Blogger image URLs. Keep descriptive alt text and captions. Confirm final availability wording, paste the article body, set title/labels/search description/permalink, preview desktop/mobile, publish, then place the article URL in `share.md`. Chinedum owns publication and sharing; this task does not publish or send messages.

Regenerate artwork with `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-21-admin-app-check`.
