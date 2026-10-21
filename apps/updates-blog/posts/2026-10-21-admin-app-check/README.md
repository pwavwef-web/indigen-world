# A stronger gate for Administration

Status: key registered; deployment and production verification in progress. Blogger unpublished; community sharing pending.

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

To be updated with final production evidence. Admin check/build and the deliberate invalid-key build rejection passed. The transport test checks missing/invalid tokens are refused before the staff/auth gate. Required staff security and rules suites passed their assertions; the local CLI reported a shutdown error after successful emulator scripts.

## Images and Blogger publishing

`screens/admin-sign-in.png` is an actual product capture. `images/cover.png` and `images/admin-sign-in.jpg` use the repository's release artwork renderer; their frames and text are editorial design. Credit: Indigen World product interface and repository artwork renderer. No external image assets.

Before publication, upload both `images/` assets to Blogger and replace the relative image URLs in `post.html` with their Blogger image URLs. Keep descriptive alt text and captions. Confirm final availability wording, paste the article body, set title/labels/search description/permalink, preview desktop/mobile, publish, then place the article URL in `share.md`. Chinedum owns publication and sharing; this task does not publish or send messages.

Regenerate artwork with `node apps/updates-blog/scripts/render-post-art.mjs 2026-10-21-admin-app-check`.
