# Tester readiness runbook

How to take Indigen World from the current repo state to a working tester round:
testers create accounts, creators post content in **TribeStudio (web)**, an admin
approves + publishes, and published content appears in the **mobile Explore feed**.
Mobile is distributed via **Google Play internal testing** (Android).

The content pipeline is already built end-to-end. This runbook is the operational
sequence plus the one bootstrap script that turns it on.

Project: `project-kassena-7e026`. Run every command from the repository root
unless stated otherwise.

---

## 0. One-time prerequisites

- Node.js 22.12+ and `npm install` at the repo root.
- Firebase CLI logged in: `firebase login` (must have access to the project).
- For the admin bootstrap + prod seed: Google application-default credentials with
  access to the project — `gcloud auth application-default login`.
- A Google Play Console account (for the mobile internal-testing track).

---

## 1. Firebase console (once)

1. **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains:** confirm the three hosting
   domains are present (they usually are by default):
   `project-kassena-7e026.web.app`, plus the `indigen-world`, `indigen-admin`,
   and `tribestudio` site domains.
3. **Storage:** confirm the default bucket `project-kassena-7e026.firebasestorage.app`
   exists.
4. **App Check stays OFF this round.** Functions read `ENFORCE_APP_CHECK` (default
   `false`), so no reCAPTCHA Enterprise key is required. Leave
   `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` unset when building the web apps.

---

## 2. Deploy backend + web apps

```bash
npm run build
firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting
```

This publishes the security rules, indexes, Cloud Functions, and all three
hosting sites (website, admin, TribeStudio). The web Firebase config is baked into
the apps (public identifiers), so no `.env` is needed.

---

## 3. Seed platform config + the opening campaign

```bash
GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 PROD_BOOTSTRAP=confirm \
  node firebase/seed/prod-bootstrap.mjs project-kassena-7e026
```

Writes `platformConfiguration/creators` and the `kasem-creator-challenge`
campaign as **`WAITLIST_OPEN`**. Idempotent — safe to re-run.

---

## 4. Bootstrap yourself as the first admin

Privileged Functions all require an existing admin, so grant the first role
directly.

1. Open TribeStudio and **create your own account** (email/password or Google).
2. Grant your account `super_admin` (email or UID accepted):

```bash
GOOGLE_CLOUD_QUOTA_PROJECT=project-kassena-7e026 GRANT_ADMIN=confirm \
  node firebase/seed/grant-admin.mjs project-kassena-7e026 you@example.com
```

3. **Sign out and back in** so the new claim reaches the client.

A `super_admin` can approve creators, review + publish submissions, edit
campaigns, and assign further roles (`setUserRole`) — role inheritance in
`services/functions/src/auth.ts`.

---

## 5. Open submissions

In the **admin console**, edit the *Kasem Creator Challenge* campaign and change
status **`WAITLIST_OPEN` → `SUBMISSIONS_OPEN`**. Approved creators cannot submit
until this is done (`submissionsOpen` requires `SUBMISSIONS_OPEN`).

---

## 6. Mobile — Google Play internal testing (Android)

Flutter cannot be built in this repo's local dev box (toolchain pin — see
`apps/mobile/.fvmrc`); run these on a machine with the pinned Flutter/FVM.

1. **Native Firebase config:** download the Android `google-services.json` for
   applicationId `world.indigen.mobile` from the Firebase console and place it at
   `apps/mobile/android/app/google-services.json` (gitignored; the Gradle build
   auto-applies the plugin when present).
2. **Upload keystore:** create one once and keep it safe.

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias upload
   ```

3. **key.properties:** create `apps/mobile/android/key.properties` (gitignored):

   ```properties
   storePassword=<store password>
   keyPassword=<key password>
   keyAlias=upload
   storeFile=<absolute path to upload-keystore.jks>
   ```

   `build.gradle.kts` reads this and signs `release` with it; without it, release
   falls back to the debug key (which Play rejects).
4. **Build the production app bundle:**

   ```bash
   cd apps/mobile
   fvm flutter build appbundle --flavor production \
     --dart-define=APP_ENV=production
   ```

   Output: `build/app/outputs/bundle/productionRelease/app-production-release.aab`.
5. **Play Console:** create the app, upload the AAB to **Internal testing**, add
   your testers' Google account emails, and share the opt-in link.

---

## 7. End-to-end smoke test

Use **two accounts** — one admin, one creator (`decideSubmission` blocks
reviewing your own submission).

1. Admin console loads and lists the campaign; submissions are `SUBMISSIONS_OPEN`.
2. In a second browser: sign up in TribeStudio, apply to the campaign.
3. As admin: approve the application; the applicant re-logs-in and reaches the
   studio (claims flipped to approved creator).
4. As the creator: submit a small image/video with **Publication permission ON**.
5. As admin: review → **APPROVE** → **PUBLISH**. Confirm a `publishedContent` doc
   exists and media was copied to `published-media/`.
6. On mobile (or reading `publishedContent`): the item appears in **Explore**.
7. Rules/functions regression still green: `npm test`.

---

## Tester-facing instructions (share with testers)

- **Create an account:** in TribeStudio (web) to post; in the mobile app to
  browse. Email/password or Google both work.
- **To post content:** in TribeStudio, apply to the Kasem Creator Challenge, wait
  for approval, then submit via Studio → New submission. Content is reviewed
  before it appears anywhere.
- **On mobile:** explore, learn, and save published content. Content shows up only
  after an admin publishes it. The Contribute tab currently saves drafts on your
  phone only — real posting is in TribeStudio this round.
- iOS is not part of this round (Android only).

---

## Known limitations this round

- Two accounts minimum for a full loop (no self-review).
- Mobile Contribute is local-draft only (no backend submit yet).
- App Check is disabled; re-enable before a public launch
  (`ENFORCE_APP_CHECK=true` on functions + a reCAPTCHA Enterprise key for web).
- iOS/TestFlight deferred.
