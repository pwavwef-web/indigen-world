# Indigen World Mobile

Android-first Flutter client for everyday Indigen World users. Project Kasena is the first language cell; the code and public copy keep the wider product language-neutral.

## Repository boundary

The assigned native-app folder is `apps/mobile`. Native work must be developed on a feature branch (the foundation branch is `codex/mobile-foundation-readiness`), never directly on `main`. Do not restructure or fold in changes from `apps/website`, `apps/tribestudio`, `services`, `ai-services`, or shared backend/data workstreams.

## What the beta includes

- Animated cultural launch where artefacts and Ghana-inspired motifs assemble the Indigen World name
- Five-destination glass shell: Explore, Learn, Collection, Community and Contribute, on a floating frosted rail with a stretching highlighter pill and drag-to-switch. The account moved out of the rail into a profile orb pinned to the top-right corner of every tab
- Explore-first vertical reels that stream real published TribeStudio content (video + image) from Firestore `publishedContent`, with likes, comments, saves, attribution, and a curated preview fallback before anything is published
- Real accounts: Google sign-in and guest mode, layered over the guest-first experience (public learning still works signed out)
- Kasem-only community feed backed by Firestore and Storage: public handles and profiles, posting with photo and video attachments, For you / Following feeds, threaded replies, appreciations, private saves, follows, member search, reporting, and a language pledge on every post
- Settings with account and community controls, community announcements, privacy, terms, guidelines, support requests, and licences (content licences, community post terms, and the open-source notices)
- Interactive Kasem lesson path with daily quests, XP, answer feedback, and guest-first dictionary access
- Filterable cultural collection for symbols, attributed places, songs, oral traditions, history, and culture
- Clearly labelled synthetic dictionary fixtures (no unapproved language data in Git)
- Saved words stored on the device
- Guided contribution and correction form
- Durable local drafts and an explicit offline submission queue
- Transparent review/points copy: rewards remain pending until trusted approval
- Rights-aware gates for unapproved recordings, cultural meanings, marketplace, voice, and AI surfaces
- Accessibility-conscious tap targets, semantics, contrast, and large-text support

Development is offline-first and routes Firebase traffic to the Emulator Suite by default. Production telemetry is disabled outside the production flavor. Validator services and reward settlement are not faked.

## Architecture

```text
View -> Riverpod provider -> Repository -> Drift / Firebase service
```

Widgets do not call Firestore, Storage, Functions, or platform APIs directly. Drift owns contributions and saved-entry persistence; the one-time preferences migration preserves earlier local beta data. Public dictionary fixtures are synthetic and must be replaced by an approved, licensed pack.

## Folder layout

Mobile work should stay inside this `apps/mobile` folder. Do not restructure `apps/website`, `apps/tribestudio`, `services`, `ai-services`, or shared backend/data packages while making native-app changes.

```text
apps/mobile/
├── lib/
│   ├── app/                 # bootstrap, router, theme, feature flags
│   ├── core/                # errors, result types, connectivity, logging
│   ├── data/                # shared Firebase, Drift, repository services
│   ├── domain/              # shared app models used across features
│   ├── features/
│   │   ├── auth/
│   │   ├── home/
│   │   ├── dictionary/
│   │   ├── learn/
│   │   ├── contribute/
│   │   ├── rewards/
│   │   ├── explore/
│   │   ├── community/        # feed, composer, profiles, people, data layer
│   │   ├── settings/         # settings, policies, licences
│   │   ├── notifications/
│   │   ├── profile/
│   │   └── onboarding/
│   ├── l10n/                # app-interface translations
│   ├── shared/              # reusable widgets shared by multiple features
│   └── main.dart
├── test/                    # unit + widget tests mirroring lib/
├── integration_test/
├── assets/                  # compressed, approved static assets only
├── android/
├── ios/
├── firebase.json             # FlutterFire app-registration metadata
└── README.md
```

The current app keeps `domain/`, `shared/`, and `features/onboarding/` because existing code imports them. New user-facing flows should be added under `features/<feature_name>/`; shared platform or persistence code belongs in `core/` or `data/`.

## Toolchain

Flutter stable is pinned to **3.47.0** (Dart 3.13.0) in `.fvmrc`. Android builds use JDK 17; Firebase CLI 15.27.0 requires a separate JDK 21+ runtime for emulators. The project also expects FlutterFire CLI 1.4.1. FVM is recommended so every developer and CI use the same SDK:

```powershell
fvm install 3.47.0
fvm use 3.47.0
npm install --global firebase-tools@15.27.0
dart pub global activate flutterfire_cli 1.4.1
fvm flutter doctor
```

## App identities

These identifiers are durable contracts. **Do not rename them after any beta is distributed.**

| Environment | Android application ID | iOS bundle ID | Display name |
| --- | --- | --- | --- |
| Development | `world.indigen.mobile.dev` | `world.indigen.mobile.dev` | Indigen World DEV |
| Staging | `world.indigen.mobile.staging` | `world.indigen.mobile.staging` | Indigen World STAGING |
| Production | `world.indigen.mobile` | `world.indigen.mobile` | Indigen World |

## Firebase

All three app pairs are registered in Firebase project `project-kassena-7e026`. This gives each flavor a distinct app identity, but Auth users, Firestore data, Storage, Functions, Remote Config, quotas, and project-level settings are still shared. Separate Firebase projects should be provisioned before project-level environment isolation is required.

The checked-in `firebase_options_<environment>.dart` files are public client configuration. Native `google-services.json` and `GoogleService-Info.plist` files remain ignored and must come from the secure developer/CI configuration path. To refresh registrations, run each configuration separately:

```powershell
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=world.indigen.mobile.dev --ios-bundle-id=world.indigen.mobile.dev --out=lib/firebase_options_development.dart --android-out=android/app/src/development/google-services.json
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=world.indigen.mobile.staging --ios-bundle-id=world.indigen.mobile.staging --out=lib/firebase_options_staging.dart --android-out=android/app/src/staging/google-services.json
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=world.indigen.mobile --ios-bundle-id=world.indigen.mobile --out=lib/firebase_options_production.dart --android-out=android/app/src/production/google-services.json
```

Enable Auth providers, deploy rules/indexes, and register App Check debug/release credentials in the Firebase console before cloud acceptance testing.

### Google Sign-In

Google authentication is exposed from the top-right profile orb → **Continue with Google**. The app exchanges the Google ID token for a Firebase credential, observes `FirebaseAuth.authStateChanges()`, restores the session after restart, and signs out of both Firebase and Google.

Before testing against the shared Firebase project:

1. In **Firebase Console → Authentication → Sign-in method**, enable **Google**, choose the project support email, and save.
2. Register the SHA-1 and SHA-256 fingerprints for every Android signing key against all app IDs that key can build. Run `cd android && ./gradlew :app:signingReport` (use `.\\gradlew.bat` on Windows) and register the fingerprints it reports for the development, staging, and production Android apps; debug keys are machine-specific and must not be copied from another developer's setup. Play App Signing and CI/release keys must be registered separately when they are created.
3. Download fresh flavor configs after changing SHA fingerprints. Keep them in `android/app/src/development`, `android/app/src/staging`, and `android/app/src/production`; these native files are intentionally ignored by Git.
4. Keep each iOS flavor's OAuth client ID in its generated `firebase_options_<environment>.dart`. `ios/Runner/Info.plist` already contains the callback URL schemes for all three registered iOS apps.

Every flavour talks to the real Firebase project unless you opt into the
emulator suite. That default used to be the other way round, which silently
pointed every debug build at `10.0.2.2` / `localhost` — a host no physical
handset can reach — so the app looked permanently offline on a real device: no
sign-in, no posting, empty feeds. To run against the emulators, ask for them:

```powershell
flutter run --flavor development --dart-define=APP_ENV=development --dart-define=USE_FIREBASE_EMULATORS=true
```

If Android reports a client configuration error, confirm the running flavor's package ID, the signing key's SHA-1/SHA-256 registrations, and the web OAuth client in that flavor's `google-services.json`. If Firebase reports `operation-not-allowed`, enable the Google provider in Firebase Authentication.

### Explore feed (published TribeStudio content)

The Explore reels stream the guest-readable `publishedContent` collection (`publicationStatus == 'published'`, newest first), which is written only by the trusted backend in `services/functions`. Two routes write it:

| Route | Who | Review | Function |
| --- | --- | --- | --- |
| Open post (no campaign) | any signed-in, non-suspended account | none — publishes on submit | `onSubmissionWritten` |
| Campaign entry | approved creators only | reviewer decision required | `decideSubmission` |

Both copy the approved file into the world-readable `published-media/{contentId}/` Storage path and record a stable `mediaUrl`/`mediaType`, so real videos and images play in the app; an open post additionally carries `publicationRoute: 'open'` so moderation and analytics can tell the two apart. Verification and approval are a *campaign* gate, not a publishing gate — the everyday case has to be as immediate as the language it is trying to keep alive. Moderation for open posts is reactive: reports and takedowns.

Until anything is published, the feed shows a curated preview, labelled `PREVIEW` in the header so nobody mistakes it for community work. Saves and appreciations on a reel are stored on the device (`SavedEntryRecords`, under `reel:` / `reel-appreciated:` keys), so they survive a restart; there is no shared public tally yet, and the UI does not pretend otherwise.

### Notifications

`communityNotifications/{id}` is the member's alert centre, reachable from the bell on the Community tab and from **Settings → Notifications**. Rows are written **only** by Cloud Functions triggers — a like, a reply, a mention, a follow, a publication — and a client may do exactly one thing to its own rows: set `read`. Nothing in the app can forge an alert.

| Trigger | Fires on | Notifies |
| --- | --- | --- |
| `onCommunityLikeCreated` | `communityLikes/{id}` | the post's author |
| `onCommunityPostCreated` | `communityPosts/{id}` | the parent author (replies) and any `@handle` mentioned |
| `onCommunityFollowCreated` | `communityFollows/{id}` | the member followed |
| `onSubmissionWritten` | first publication of an open post | the creator |
| `onCommunityNotificationCreated` | any new alert | pushes it to that member's devices |

Push registrations live in `communityDevices/{fcmToken}` — keyed by the token so a refresh replaces the row rather than accumulating dead handsets, unreadable by anyone but its owner, and dropped on sign-out. Dead tokens are pruned as FCM reports them. Push is a convenience layer only: a device that refuses notifications, or has no Play Services, still gets the full centre from Firestore.

### Kawuri

The floating button on the **Learn** tab opens Kawuri, the in-app guide. It calls the `kawuriChat` callable, which runs on **Vertex AI** authenticated as the function's own service account — there is no API key anywhere in this repo or in Secret Manager. The project needs `aiplatform.googleapis.com` enabled and the runtime service account able to call it (`roles/aiplatform.user`).

Until that is true the callable returns `{ configured: false }` rather than an error, and the app falls back to an on-device guide (`kawuri_offline_guide.dart`) — so a fresh checkout, the emulator suite and an internal-testing build all behave sensibly with no configuration at all. Fallback answers are labelled in the UI as coming from the phone.

The system prompt, the rate limit and the model choice all stay server-side, which is the reason Kawuri is a callable rather than an on-device SDK call: a prompt shipped in the app binary can be read out of it, and a client-side model call cannot be rate-limited per member.

Kawuri will not invent Kasem, in either mode. Language in this project is confirmed by appointed speakers before it counts as guidance, and a confident guess is worse than no answer, so a translation question is answered by pointing at the dictionary, the Community tab, or a contribution. Conversations are kept in shared preferences on the device, never uploaded.

### Community feed

The Community tab is a live Firestore + Storage surface, not a local preview.
Everything is flat and edge-keyed so each screen is a single indexed read and no
member ever needs write access to another member's documents:

| Collection | Contents | Who writes |
| --- | --- | --- |
| `communityProfiles/{uid}` | public handle, name, photo, cover, bio, location, dialect | the owner |
| `communityUsernames/{username}` | `{ uid }` — handle uniqueness registry | create-only, by the claimant |
| `communityPosts/{postId}` | post or reply (`parentId`, `isReply`), text, media, counters | the author |
| `communityLikes/{uid}_{postId}` | appreciation edge | the member appreciating |
| `communityBookmarks/{uid}_{postId}` | private save | the owner only |
| `communityFollows/{from}_{to}` | follow edge | the follower |
| `communityReports/{reportId}` | moderation queue | any member; staff read |

Follower, following and post totals come from Firestore aggregate `count()`
queries rather than denormalised counters, so no cross-user counter writes are
needed. The two exceptions — `likeCount` and `replyCount` on a post — are
constrained in rules to a single-step change, and a like additionally has to be
backed by the matching `communityLikes` edge created or removed in the same
commit. `firebase/tests/community.rules.test.mjs` covers those constraints.

Media lives under three world-readable, owner-writable Storage prefixes:
`community-media/{uid}/{postId}/`, `community-avatars/{uid}/` and
`community-banners/{uid}/`. Photos are resized to 1920px on the longest edge
before upload and capped at 12 MB; videos are capped at 3 minutes and 128 MB.

Before the feed works against the shared cloud project:

1. Enable **Storage** in the Firebase console for `project-kassena-7e026`.
2. Deploy the rules and indexes from the repository root:

   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes,storage --project project-kassena-7e026
   ```

3. Confirm the eight new composite indexes in `firebase/firestore.indexes.json`
   finish building — the feed, profile tabs and follow lists all need them.

Signed-out visitors can read the feed; posting, appreciating, saving and
following prompt for sign-in and then for a one-time handle claim.

### Licences

**Settings → Licences** carries three things: the content licences a
contribution can be published under (kept in step with
`publicationLicenceAllowed` in `firebase/firestore.rules`), the terms that apply
to community posts, and Flutter's generated open-source licence page.

## Build

Run commands from `apps/mobile` (prefix Flutter commands with `fvm` when using FVM):

```powershell
flutter pub get
flutter gen-l10n
dart run build_runner build
flutter analyze
flutter test --coverage
flutter run --flavor development --dart-define=APP_ENV=development
flutter build appbundle --release --flavor production --dart-define=APP_ENV=production
flutter build ios --release --no-codesign --flavor production --dart-define=APP_ENV=production
```

Android output: `build/app/outputs/bundle/productionRelease/app-production-release.aab`.

## Emulator integration tests

Pass `--dart-define=USE_FIREBASE_EMULATORS=true` to route Auth, Firestore, Functions and Storage at the local suite (`10.0.2.2` on Android; `localhost` elsewhere). The root `firebase.json` owns shared backend paths and ports. With JDK 21 active and an Android emulator already running, execute this from the repository root:

```powershell
firebase emulators:exec --config firebase.json --project project-kassena-7e026 --only auth,firestore,storage "cd apps/mobile && flutter test integration_test/firebase_emulator_test.dart -d emulator-5554 --flavor development --dart-define=APP_ENV=development --dart-define=USE_FIREBASE_EMULATORS=true"
```

Functions traffic is already routed to emulator port 5001. Add `functions` to `--only` when the backend-owned `services/functions` runtime is implemented.

## CI gates

`.github/workflows/mobile-checks.yml` enforces formatting, localization and generated-code freshness, analysis, test coverage (minimum 50%), Firebase emulator integration, and Android/iOS production release builds. Repository checks also run Gitleaks and reject tracked native Firebase files or common secret filenames.

## Product boundary

This app offers everyday-user flows and a lightweight contribution status surface. Validator queues, corpus management, bulk moderation, publishing, trusted rewards, and administration remain in TribeStudio and backend services.
