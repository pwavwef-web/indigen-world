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

If the deploy stops at *"Loading and analyzing source code … Error: An
unexpected error has occurred"*, the CLI's function discovery is the problem,
not your code. Discovery boots the built bundle on a local port and fetches the
manifest over HTTP; on some Windows setups that loopback request never lands.
Capture the same manifest yourself and the CLI reads it directly instead:

```bash
npm run build:functions
# serve the manifest, then save it beside the functions source
(cd services/functions && GCLOUD_PROJECT=<project> FUNCTIONS_CONTROL_API=true PORT=8791   node ../../node_modules/firebase-functions/lib/bin/firebase-functions.js . &)
sleep 10 && curl -s http://127.0.0.1:8791/__/functions.yaml   -o services/functions/functions.yaml
```

`services/functions/functions.yaml` is gitignored and goes stale as soon as a
trigger changes — regenerate it after every functions change, or delete it and
let discovery run normally on a machine where it works.

**Check the manifest before you trust the deploy.** A stale manifest does not
fail; it deploys the functions it lists and says nothing about the ones it does
not. That is how `onCommunityPollVoteCreated` and `onCommunityRepostCreated`
sat undeployed for a release — every poll tallied to 0% because the trigger
that writes the totals had never reached the project. Compare the two lists
before deploying, and expect them to match exactly:

```bash
node -p "Object.keys(JSON.parse(require('fs').readFileSync('services/functions/functions.yaml','utf8')).endpoints).sort()"
```

Every `export` in `services/functions/src/index.ts` must appear in that list.
`firebase functions:list --project <project>` then shows what is actually live.

Watch for two things on the first deploy after this round's changes:

- The three new composite indexes (`communityNotifications` ×2,
  `communityDevices`) have to finish building before the notifications centre
  and its badge work. Check **Firestore → Indexes** in the console.
- Every declared secret must already exist in Secret Manager or the whole
  functions deploy fails. That list is unchanged: `SMTP_PASSWORD` and
  `ARKESEL_API_KEY`. Kawuri deliberately adds none — it authenticates to Vertex
  AI as the function's own service account (see 5b).

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

## 5b. Kawuri (the in-app assistant)

Kawuri sits behind the floating button on the mobile **Learn** tab. It runs on
**Vertex AI**, called from the `kawuriChat` Cloud Function using that function's
own Application Default Credentials — so there is **no API key** to create,
store or rotate anywhere.

Two things have to be true on the project:

```bash
# 1. The Vertex AI API is enabled.
gcloud services enable aiplatform.googleapis.com --project project-kassena-7e026
```

2. The functions runtime service account can call it. The default compute
   service account's **Editor** role already covers this; if you have tightened
   it, grant `roles/aiplatform.user`.

If either is missing, `kawuriChat` returns `{ configured: false }` instead of an
error and the app falls back to its on-device guide — which answers questions
about how Indigen World works and declines to guess at Kasem. That is a usable
internal-testing state, so testers are never blocked on this.

Optional overrides (plain env vars, no secrets): `KAWURI_MODEL`
(default `gemini-2.5-flash`), `KAWURI_LOCATION` (default `us-central1`).

---

## 6. Mobile — Google Play internal testing (Android)

Build these on a machine with the pinned Flutter toolchain (see
`apps/mobile/pubspec.yaml` for the Dart SDK constraint).

1. **Native Firebase config:** download the Android `google-services.json` for
   applicationId `com.indigenworld.indigen` from the Firebase console and place it at
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

**Open publishing (the everyday path — no approval anywhere in it):**

1. In a fresh browser: sign up in TribeStudio with any Google account. You reach
   the studio immediately; a minimal `creatorProfiles/{uid}` is created for you.
2. Studio → **New post** (no `?campaign=` in the URL). Upload a small image or
   video, grant **Publication**, tick the rights and consent confirmations, and
   **Publish to Explore**.
3. Confirm `publishedContent/pub_{submissionId}` exists with
   `publicationStatus: 'published'` and `publicationRoute: 'open'`, and that the
   media was copied to `published-media/`.
4. On mobile: the item appears in **Explore**, and the header switches from
   `PREVIEW` to `PUBLISHED`.
5. The creator gets a "Your work is live on Explore" alert in the mobile
   notifications centre.

**Campaign entry (still reviewed):**

6. As admin: confirm the campaign is `SUBMISSIONS_OPEN`.
7. As a second, unapproved account: Studio → **Enter campaign**. Submitting
   should be refused by the rules until that account is approved.
8. As admin: approve the application; the applicant re-logs-in (claims flip to
   approved creator) and submits with **Publication permission ON**.
9. As admin: review → **APPROVE** → **PUBLISH**. Confirm the `publishedContent`
   doc and the copied media.

**Community and notifications:**

10. On mobile with two accounts: post, reply, like and follow. Each action should
    land in the other member's notifications centre within a second or two, and
    on their lock screen if they turned push alerts on.
11. Rules/functions regression still green: `npm test`.

---

## Tester-facing instructions (share with testers)

- **Create an account:** in TribeStudio (web) to post; in the mobile app to
  browse. Email/password or Google both work.
- **To post content:** in TribeStudio, sign in and go to Studio → **New post**.
  It publishes straight to the Explore feed — there is no waiting list and no
  approval step. Post only work that is yours to share, with the consent of
  anyone in it; anything reported is reviewed afterwards and can be taken down.
- **Campaigns** are the exception: they carry rewards, so entries are reviewed
  before publishing and are open to approved creators. Apply from Studio →
  Opportunities.
- **On mobile:** explore, learn, and save published content. Content shows up only
  after an admin publishes it. The Contribute tab currently saves drafts on your
  phone only — real posting is in TribeStudio this round.
- iOS is not part of this round (Android only).

---

## Known limitations this round

- Two accounts minimum for a full **campaign** loop (no self-review). Open
  posting needs only one.
- Mobile Contribute is local-draft only (no backend submit yet).
- App Check is disabled; re-enable before a public launch
  (`ENFORCE_APP_CHECK=true` on functions + a reCAPTCHA Enterprise key for web).
- Open posts publish without pre-review by design, so moderation is reactive.
  Watch `communityReports` and be ready to unpublish
  (`decideSubmission` with `UNPUBLISH`) during the test round.
- Explore reels carry no shared like or comment count yet: saves and
  appreciations are per-device, and "Discuss" hands the viewer to the Community
  feed rather than to a thread on the reel.
- Kawuri answers from an on-device guide until the Vertex AI API is enabled on
  the project, and labels those answers as such.
- iOS/TestFlight deferred.
