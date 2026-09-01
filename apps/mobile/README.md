# Indigen World Mobile

Android-first Flutter client for everyday Indigen World users. Project Kassena is the first language cell; the code and public copy keep the wider product language-neutral.

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
| Production | `com.indigenworld.indigen` | `world.indigen.mobile` | Indigen World |

## Firebase

All three app pairs are registered in Firebase project `project-kassena-7e026`. This gives each flavor a distinct app identity, but Auth users, Firestore data, Storage, Functions, Remote Config, quotas, and project-level settings are still shared. Separate Firebase projects should be provisioned before project-level environment isolation is required.

The checked-in `firebase_options_<environment>.dart` files are public client configuration. Native `google-services.json` and `GoogleService-Info.plist` files remain ignored and must come from the secure developer/CI configuration path. To refresh registrations, run each configuration separately:

```powershell
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=world.indigen.mobile.dev --ios-bundle-id=world.indigen.mobile.dev --out=lib/firebase_options_development.dart --android-out=android/app/src/development/google-services.json
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=world.indigen.mobile.staging --ios-bundle-id=world.indigen.mobile.staging --out=lib/firebase_options_staging.dart --android-out=android/app/src/staging/google-services.json
flutterfire configure --project=project-kassena-7e026 --platforms=android,ios --android-package-name=com.indigenworld.indigen --ios-bundle-id=world.indigen.mobile --out=lib/firebase_options_production.dart --android-out=android/app/src/production/google-services.json
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
| `onChatMessageCreated` | `communityChats/{id}/messages/{id}` | pushes a direct message to the other participant (no centre row — see below) |

Push registrations live in `communityDevices/{fcmToken}` — keyed by the token so a refresh replaces the row rather than accumulating dead handsets, unreadable by anyone but its owner, and dropped on sign-out. Dead tokens are pruned as FCM reports them. Push is a convenience layer only: a device that refuses notifications, or has no Play Services, still gets the full centre from Firestore.

#### Asking for permission

Android grants **one** notification prompt per install, and a reflexive "Deny" is permanent short of a trip through system settings. So the ask is made twice over, in the app's own words first:

1. **The primer** (`notifications_primer.dart`) closes first-run onboarding, and appears once for members who onboarded before it existed — `StartupGate` gates on `indigen_world_push_primer_v1`, not on the onboarding flag. "Not now" deliberately does *not* reach the OS prompt, leaving the grant unspent for the settings toggle later. It is skipped entirely when Firebase failed to start, because no token could be minted from a yes.
2. **One contextual re-ask** (`push_nudge.dart`), offered after a first direct message is sent and only once `indigen_world_push_declined_at_v1` is at least three days old. After that, Settings is the only path.

`setPushAlerts` moves permission, the device registration, the `community-updates` topic and the stored preference together — the primer, the nudge and the settings toggle all go through it, so none of them can leave the switch saying something the backend disagrees with.

#### Channels

Two channels, both created at start-up by `local_alerts.dart`:

| Channel | Carries |
| --- | --- |
| `indigen_community_v2` | replies, mentions, follows, reshares, new releases — the FCM default in the manifest |
| `indigen_messages` | direct messages |

They are separate so somebody can mute the like-and-follow traffic from system settings without also muting the person talking to them.

**The `_v2` is load-bearing.** No build before it created the channel itself, so on any handset that had already received an alert Android auto-created `indigen_community` at default importance — silent, no heads-up — and a channel's importance can never be raised afterwards. Changing the id is the only migration there is; the retired channel is deleted on first run. If an id changes again it has to change in three places at once: `local_alerts.dart`, the `channelId` the function sends (`push.ts`), and — for the community channel — the manifest meta-data.

A push that lands while somebody is looking at the app is delivered to `onMessage` and drawn by nobody, so `foregroundAlertsProvider` posts it locally. It is deliberately independent of the signed-in account: broadcast announcements reach guest devices through the topic.

### Direct messages

`onChatMessageCreated` pushes a private message to the other participant. It writes **no** `communityNotifications` row on purpose — a conversation belongs in the inbox, which already keeps its own unread count on the thread, and duplicating it would give one unread state two sources of truth.

Four things stand between a message and somebody's lock screen:

- **Mute.** `mutedBy` on the thread. Checked before the debounce, so a muted conversation never even stamps the quiet window.
- **Debounce.** `shouldAlert` rings for the first message, then stays quiet for 45 seconds *while an earlier message is still unread* — four messages typed in a row are one thought. Claimed in a transaction, because a burst is exactly the case where two deliveries would otherwise both read the same stale `lastPushAt` and both ring.
- **Previews.** `messagePreviews` on `communityDevices/{token}`, so an alert can say who wrote without saying what they said. It lives on the device, not the account: a private phone and a shared tablet want different answers.
- **The open thread.** The fan-out cannot know which screen is in front of somebody, so the client drops a foreground push for the conversation `activeChatThreadProvider` says is already on screen.

Both guards live in the rules as well as the code, because both participants can write the thread document — which would otherwise mean either of them could silence the other. `mutedBy` may only change by the caller's own uid, and `lastPushAt` is not client-writable at all.

A message push carries only a thread id, so `/chat/:threadId` goes through `ChatThreadLoader`, which recovers the other member's name and face from the thread's own stamps before building `ChatScreen`. A payload with no usable thread id falls back to `/messages`, never to the alert centre — there is nothing there for it.

### Rating

The Play in-app review card, behind `rating_service.dart`. Three properties of that API drive the whole design, and each is easy to get wrong:

- **Nothing may ask first.** Play forbids gating the card behind a question about how somebody feels — no "Enjoying Indigen? [Yes] [No]", and no button labelled *Rate us* that calls `requestReview`. The **Rate Indigen World** row in Settings is a different call, `openStoreListing`, which is allowed precisely because it leaves the app.
- **There is no callback.** `requestReview` completes whether or not the card was drawn. The attempt is therefore recorded *before* the call — a failure that read as "did not happen" would ask again on the next lesson, and the one after that.
- **The quota is small.** Roughly a handful per member per year, spent silently. Every mistimed ask costs one that cannot be recovered.

So the ask is rationed by `shouldRequestReview` — 7 days since first launch, 3 distinct days of use, online, and (for a second ask) **both** a 120-day cooldown and a version the member has not already been asked about. It fires from a moment somebody has just finished something: a completed lesson, or an accepted contribution, after the success sheet has closed.

Every threshold lives in Remote Config (`rating_prompt_enabled`, `rating_min_days`, `rating_min_active_days`, `rating_cooldown_days`) and **ships disabled**. It is the one feature here with no rollback, so being able to stop it without a release matters more than the convenience of a compile-time constant.

Two things to know when testing it: `isAvailable()` is false on the dev and staging flavours, because those application IDs are not on Play — so the prompt cannot be exercised with `flutter run` at all, only from an internal-testing or app-sharing build.

### Kawuri

The floating button on the **Learn** tab opens Kawuri, the in-app guide. It calls the `kawuriChat` callable, which runs on **Vertex AI** authenticated as the function's own service account — there is no API key anywhere in this repo or in Secret Manager. The project needs `aiplatform.googleapis.com` enabled and the runtime service account able to call it (`roles/aiplatform.user`).

Until that is true the callable returns `{ configured: false }` rather than an error, and the app falls back to an on-device guide (`kawuri_offline_guide.dart`) — so a fresh checkout, the emulator suite and an internal-testing build all behave sensibly with no configuration at all. Fallback answers are labelled in the UI as coming from the phone.

The system prompt, the rate limit and the model choice all stay server-side, which is the reason Kawuri is a callable rather than an on-device SDK call: a prompt shipped in the app binary can be read out of it, and a client-side model call cannot be rate-limited per member.

Kawuri will not invent Kasem, in either mode. Language in this project is confirmed by appointed speakers before it counts as guidance, and a confident guess is worse than no answer, so a translation question is answered by pointing at the dictionary, the Community tab, or a contribution. Conversations are kept in shared preferences on the device, never uploaded.

### Subscriptions and offline downloads

Three Google Play subscriptions — **Indigen Plus**, **Indigen Patron** and
**Indigen Creator**, monthly and yearly each. Play Billing, never a card form:
`in_app_purchase` opens Play's own sheet and the purchase token goes to
`registerPlayPurchase`, which asks the Play Developer API what it is worth and
writes `entitlements/{uid}`. Nothing in this app grants a benefit on its own
say-so — the entitlement document is readable by its owner and writable by
nobody, and the app redraws from it.

**No price is written down anywhere in this repository.** The paywall shows
`ProductDetails.price`, which is Play's own formatted string in the member's
currency after regional pricing and tax. A price in a Dart file would be wrong
for the first member who opened the app outside Ghana.

What a subscription buys: no adverts (one gate, in `placedAdsProvider`, so a
new advert surface inherits it), a much larger daily Kawuri allowance (enforced
in `kawuri.ts`, not here), offline downloads of collection audio, and a
supporter mark beside the name.

The supporter mark is deliberately **not** a `verifiedKind`. A verification
mark says something was checked — a phone number, published work, standing as a
custodian of Kasem. A supporter mark says something was paid. Folding the two
together would put a price on the first, which is the one thing this project
cannot sell. The kente ring stays what it always was: earned, never bought.

Downloads live in the app's own documents directory with an index in the
existing Drift database, and survive a lapsed subscription — the files are
already on the phone and the audio streams free anyway; what lapses is the
ability to add more. The limit is applied on the device and honestly so: a
server-side check over a public media URL would be theatre. The paid things
that cost real money are the ones enforced on the server.

Play Console setup — the products, the base plans, the RTDN Pub/Sub topic and
the service-account permissions — is in
[`docs/product/play-integrity-and-billing.md`](../../docs/product/play-integrity-and-billing.md).

### Play Integrity

Firebase App Check already runs the Play Integrity *provider* on Firestore and
callable traffic; that is the protection and it is unchanged. Alongside it,
`PlayIntegrityChannel.kt` requests a Standard integrity token directly and
`verifyDeviceIntegrity` decodes it against Google, which is the only way to see
the seven signals Play Console lists — licensing, app tampering, device
recognition, virtual devices, recent activity, Play Protect and app access
risk. An App Check token carries none of them.

The device never judges itself: the token is opaque here and every failure
resolves to "unavailable", which blocks nothing. `PLAY_INTEGRITY_MODE` ships on
**`monitor`** — verdicts are recorded and logged, and nothing is refused. Moving
to `enforce` is a decision to take on a few weeks of real verdicts, because a
great many legitimate handsets in Ghana are rooted, sideloaded or on a custom
ROM.

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
