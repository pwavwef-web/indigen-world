# Indigen World Mobile

Android-first Flutter client for everyday Indigen World users. Project Kasena is the first language cell; the code and public copy keep the wider product language-neutral.

## Repository boundary

The assigned native-app folder is `apps/mobile`. Native work must be developed on a feature branch (the foundation branch is `codex/mobile-foundation-readiness`), never directly on `main`. Do not restructure or fold in changes from `apps/website`, `apps/tribestudio`, `services`, `ai-services`, or shared backend/data workstreams.

## What the beta includes

- Animated cultural launch where artefacts and Ghana-inspired motifs assemble the Indigen World name
- Six-destination shell: Explore, Learn, Collection, Community, Contribute, and You
- Explore-first vertical reels that stream real published TribeStudio content (video + image) from Firestore `publishedContent`, with likes, comments, saves, attribution, and a curated preview fallback before anything is published
- Real accounts: Google sign-in and guest mode, layered over the guest-first experience (public learning still works signed out)
- Kasem-only community preview with local posts, media attachments, threaded replies, and a language pledge
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

Google authentication is exposed from **You → Continue with Google**. The app exchanges the Google ID token for a Firebase credential, observes `FirebaseAuth.authStateChanges()`, restores the session after restart, and signs out of both Firebase and Google.

Before testing against the shared Firebase project:

1. In **Firebase Console → Authentication → Sign-in method**, enable **Google**, choose the project support email, and save.
2. Register the SHA-1 and SHA-256 fingerprints for every Android signing key against all app IDs that key can build. For the current workspace debug key, confirm SHA-1 `E5:ED:F4:48:25:B2:53:21:A8:7D:0A:DA:69:84:94:BA:61:ED:5A:19` and SHA-256 `5F:70:98:37:33:CF:F0:9A:65:3A:17:BC:E3:5C:5E:FE:F6:3A:D4:D1:97:FE:A8:CF:40:3E:56:3E:F0:8D:A3:E8` are registered for the development, staging, and production Android app registrations. Play App Signing and CI/release keys must be registered separately when they are created.
3. Download fresh flavor configs after changing SHA fingerprints. Keep them in `android/app/src/development`, `android/app/src/staging`, and `android/app/src/production`; these native files are intentionally ignored by Git.
4. Keep each iOS flavor's OAuth client ID in its generated `firebase_options_<environment>.dart`. `ios/Runner/Info.plist` already contains the callback URL schemes for all three registered iOS apps.

Development uses the Firebase Auth emulator by default. To perform a real Google/Firebase cloud acceptance test, run:

```powershell
flutter run --flavor development --dart-define=APP_ENV=development --dart-define=USE_FIREBASE_EMULATORS=false
```

If Android reports a client configuration error, confirm the running flavor's package ID, the signing key's SHA-1/SHA-256 registrations, and the web OAuth client in that flavor's `google-services.json`. If Firebase reports `operation-not-allowed`, enable the Google provider in Firebase Authentication.

### Explore feed (published TribeStudio content)

The Explore reels stream the guest-readable `publishedContent` collection (`publicationStatus == 'published'`, newest first), which is written only by the trusted publication workflow in `services/functions`. On a `PUBLISH` decision that workflow now copies the approved file into the world-readable `published-media/{contentId}/` Storage path and records a stable `mediaUrl`/`mediaType`, so real videos and images play in the app. Until content is published, the feed shows a clearly-labelled curated preview.

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

`development` uses Auth, Firestore, Functions, and Storage emulators by default (`10.0.2.2` on Android; `localhost` elsewhere). The root `firebase.json` owns shared backend paths and ports. With JDK 21 active and an Android emulator already running, execute this from the repository root:

```powershell
firebase emulators:exec --config firebase.json --project project-kassena-7e026 --only auth,firestore,storage "cd apps/mobile && flutter test integration_test/firebase_emulator_test.dart -d emulator-5554 --flavor development --dart-define=APP_ENV=development"
```

Functions traffic is already routed to emulator port 5001. Add `functions` to `--only` when the backend-owned `services/functions` runtime is implemented.

Set `--dart-define=USE_FIREBASE_EMULATORS=false` only when deliberately testing development against the shared cloud project.

## CI gates

`.github/workflows/mobile-checks.yml` enforces formatting, localization and generated-code freshness, analysis, test coverage (minimum 50%), Firebase emulator integration, and Android/iOS production release builds. Repository checks also run Gitleaks and reject tracked native Firebase files or common secret filenames.

## Product boundary

This app offers everyday-user flows and a lightweight contribution status surface. Validator queues, corpus management, bulk moderation, publishing, trusted rewards, and administration remain in TribeStudio and backend services.
