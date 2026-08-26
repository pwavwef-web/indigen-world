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

- New composite indexes have to finish building before the surfaces that query
  them work: `learnLessons`, `collectionApps`, `shopProducts` and `shopOrders`
  (published/order and uid/status), plus `communityPosts` on `rootId` — which is
  what lets Kawuri read the thread it has been mentioned in. Check
  **Firestore → Indexes** in the console.
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
   flutter build appbundle --flavor production \
     --dart-define=APP_ENV=production
   ```

   Output: `build/app/outputs/bundle/productionRelease/app-production-release.aab`.
5. **Play Console:** create the app, upload the AAB to **Internal testing**, add
   your testers' Google account emails, and share the opt-in link.

### Google Sign-In: register every certificate, on every app

Google Sign-In is granted to a **pair** — the package id *and* the signing
certificate — and the Firebase project has to hold that exact pair. Miss one and
both routes into an account fail, neither of them legibly: the native account
sheet reports an ordinary cancellation, and Firebase's hosted fallback returns
`invalid-cert-hash`, which the SDK renders as "there was an error while trying
to get your package certificate hash". Nothing in either message names the
certificate that was actually presented.

There are more pairs than there look to be. Four flavours ship four package
ids, and each can be signed three ways:

| Certificate | Signs |
| --- | --- |
| Play app signing key | anything installed from Play — Play re-signs the AAB after upload |
| Upload key (`upload-keystore.jks`) | a release APK built and sideloaded locally |
| Each developer's `~/.android/debug.keystore` | every `flutter run` |

Register **all** of them against **all four** Android apps. Read the Play
certificate from Play Console → *Test and release* → *Setup* → *App integrity* →
*App signing key certificate*, and a keystore's own with:

```bash
keytool -list -v -keystore <keystore> -alias <alias> | grep -E "SHA1:|SHA256:"
```

Then, per app id:

```bash
firebase apps:android:sha:list <appId> --project project-kassena-7e026
firebase apps:android:sha:create <appId> <sha1-or-sha256> --project project-kassena-7e026
```

Verify against the endpoint the SDK itself calls — this is the check that
actually decides, and it needs no device:

```bash
curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=<androidApiKey>&androidPackageName=<package>&sha1Cert=<sha1>"
```

`authorizedDomains` back means the pair is registered; `INVALID_CERT_HASH`
means it is not. Re-download `google-services.json` afterwards so the OAuth
client list ships with the build.

Since 0.1.1+8 the app also reports its own identity: **Settings → About → App
signature** shows the package id and SHA-1 of the running build and copies both
to the clipboard. That is the value to register, and on a Play install it is the
only place it is readable.

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

**Push permission and channels (new this round):**

12. On a **clean install**, the primer appears as the last step of onboarding —
    and, for a tester upgrading from an earlier build, once on first launch. Tap
    **Not now** and confirm no Android permission dialog is shown: the grant has
    to survive a decline, or the tester can never be asked again.
13. Reinstall, tap **Turn on alerts**, accept the Android dialog, and confirm a
    `communityDevices/{token}` row appears with your uid.
14. Have the other account like your post while the app is **open**. The alert
    must appear as a heads-up notification, not only as a badge — this is what
    the foreground path and the channel importance are for.
15. **Settings → Apps → Indigen → Notifications** should list two categories,
    *Community activity* and *Messages*, both set to a level that makes sound. A
    tester upgrading from an earlier build who sees a silent *Miscellaneous*
    category instead has the retired `indigen_community` channel: confirm the
    app deleted it and created `indigen_community_v2`. Channel importance cannot
    be changed after creation, so this only ever gets fixed by a new channel id.

**Direct messages:**

16. Two accounts, both with alerts on. Send a message from one; the other should
    get a lock-screen alert titled with the sender's name.
17. Tap it from a **cold start** (swipe the app away first). It must open that
    conversation, not the notifications centre — a message writes no row there.
18. Send four messages in quick succession. Exactly **one** alert should arrive,
    and it should show the latest message rather than stacking four rows.
19. Read the conversation, then have the other account send again. That one
    rings, because nothing was outstanding when it arrived.
20. With the conversation **open on screen**, have the other account send. No
    alert should be drawn — the message is already being read.
21. Turn **Show message text in alerts** off in Settings and send again. The
    alert should name the sender and say "Sent you a message", with no body.

**Play rating prompt:**

22. **Settings → Rate Indigen World** should open the Play listing for
    `com.indigenworld.indigen`. This is the only rating path that can be
    exercised on demand.
23. The in-app review card itself **cannot be tested from `flutter run`**, or on
    the dev and staging flavours at all — `isAvailable()` is false for
    application IDs that are not on Play. It needs an internal-testing or
    internal-app-sharing build.
24. It also ships **disabled**. To exercise it, set `rating_prompt_enabled` to
    `true` in **Remote Config**, and lower `rating_min_days` and
    `rating_min_active_days` to `0` for the test — otherwise the gate needs a
    week and three separate days of use before it will fire.
25. Then finish a lesson, or submit a contribution, and expect the card after
    the success sheet closes. **Expect it at most once.** Play discards requests
    over quota in silence and reports nothing either way, so "no card appeared"
    is not by itself a failure — check that
    `indigen_world_rating_last_ask_v1` was written before concluding anything.
26. Put `rating_prompt_enabled` back to `false` when you are done, unless the
    round is meant to ship with it live.

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
