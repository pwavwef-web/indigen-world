# Google Sign-In: what was wrong, and what changed

_Written 2026-09-02, against `google_sign_in` 7.2.0 / `google_sign_in_android` 7.2.16,
`firebase_auth` ^6.5.7, app version 0.1.9+18._

The report was "sign in with Google is still not working on the app" — with no error text,
because the app never showed any.

That last clause turned out to be most of the problem.

## What was ruled out

The obvious suspect is the certificate matrix: Google Sign-In is granted to a **pair** —
package id *and* signing certificate — and a missing pair fails illegibly (see
`docs/`-adjacent notes and the project memory `google-signin-cert-matrix`). It was checked
first, and it is fine.

`apps/mobile/android/app/google-services.json` carries type-1 (Android) OAuth clients for
**all four** certificates on **all four** package ids, plus the shared type-3 web client
`111428711822-9gtghard…`:

| package id | Play app-signing `78bb330c…` | upload `cedd58e1…` | debug `38f72191…` | debug `e5edf448…` |
| --- | --- | --- | --- | --- |
| `com.indigenworld.indigen` (production) | ✅ | ✅ | ✅ | ✅ |
| `world.indigen.mobile` | ✅ | ✅ | ✅ | ✅ |
| `world.indigen.mobile.dev` | ✅ | ✅ | ✅ | ✅ |
| `world.indigen.mobile.staging` | ✅ | ✅ | ✅ | ✅ |

Confirmed live against the exact endpoint the SDK calls — no device needed:

```bash
curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=AIzaSyBjJ_bgVLZH2bRAtgBrbzYIZXGTx-VjfuE&androidPackageName=com.indigenworld.indigen&sha1Cert=78bb330c8a025066c2370911aed260d7fd6684f9"
```

`authorizedDomains` in the response = registered. `INVALID_CERT_HASH` = not. All six
production-relevant pairs (2 package ids × 3 real certificates) returned `authorizedDomains`.

The Dart-side app ids match too: `firebase_options_production.dart` uses
`1:111428711822:android:382a06265095d07829a0df`, which is the `com.indigenworld.indigen`
client; dev and staging likewise match their own flavours.

**So the build is registered correctly, and has been the whole time.**

## What the plugin actually does

Tracing `google_sign_in_android` 7.2.16 —
`android/src/main/java/io/flutter/plugins/googlesignin/GoogleSignInPlugin.java`, `onError` —
every Credential Manager failure is classified like this:

| Android exception | `GetCredentialFailureType` | `GoogleSignInExceptionCode` |
| --- | --- | --- |
| `GetCredentialCancellationException` | `CANCELED` | `canceled` |
| `GetCredentialInterruptedException` | `INTERRUPTED` | `interrupted` |
| `GetCredentialProviderConfigurationException` | `PROVIDER_CONFIGURATION_ISSUE` | `providerConfigurationError` |
| `GetCredentialUnsupportedException` | `UNSUPPORTED` | `providerConfigurationError` |
| `NoCredentialException` | `NO_CREDENTIAL` | `unknownError` ("No credential available: …") |
| anything else | `UNKNOWN` | `unknownError` |

Two things follow, and both were wrong in our code.

### 1. `canceled` was treated as final, and it is not one thing

`GoogleFirebaseAuthService.signIn()` short-circuited on **any** `canceled`:

```dart
if (providerFailure!.wasCancelled) throw providerFailure;   // ← before
return _signInWithHostedFlow(auth, providerFailure);
```

That was a deliberate decision, and a good one for the case it was made about: opening a
browser tab on top of a member who has just closed a sheet is rude, and if the hosted flow
then fails it replaces their decision with an error about certificate hashes.

But the table above shows `canceled` collapses every `GetCredentialCancellationException`
into one code, and Credential Manager raises that exception both for a genuine swipe-away
**and**, on some Play services builds, when it declines to present a sheet at all. In the
second case the member taps "Continue with Google" and *nothing happens* — on a device
where the hosted browser flow, which needs no Credential Manager and no certificate
registration at all, would have signed them straight in.

The asymmetry decides it. Falling through on a real dismissal costs one unwanted browser
tab, once. Stopping on a suppressed sheet is a dead button, every time, forever.

**Changed:** only a cancellation whose description says it was the user ends the attempt.
See `isUserDismissal` in `apps/mobile/lib/features/auth/google_firebase_auth_service.dart`
— it matches the messages Credential Manager actually emits for a dismissal ("activity is
cancelled by the user."), and returns **false** for an absent, empty or unrecognised
description, so the burden of proof sits on the dismissal rather than on the fallback.

### 2. A device problem was reported as a build problem

`providerConfigurationError` and `clientConfigurationError` both produced
`unregisteredBuildMessage()` — "Google Sign-In is not set up for this build of the app."

Per the table, `providerConfigurationError` covers `GetCredentialUnsupportedException`
(Credential Manager not available on this Android version) and
`GetCredentialProviderConfigurationException` (Play services cannot serve a provider).
Both are facts about the **handset**. Given the registration audit above, that sentence was
not merely unhelpful — it was false, and it sent people to report a fault that does not exist.

**Changed:** the two are split. `clientConfigurationError` (which the plugin raises when the
server client id is missing — genuinely ours) keeps the build message.
`providerConfigurationError` now reads: *"This device cannot show the Google account sheet.
Check Google Play services is up to date, or use your email and password."*

### 3. The error was invisible

Every provider verdict went to Crashlytics and nowhere else — so the only people who could
see which of six distinct failures had occurred were the people who were not holding the phone.

**Changed:**

- `AuthFailure` carries an optional `detail` — the provider's own code and description,
  kept apart from the member-facing sentence.
- The sign-in sheet's error banner gained a folded **Details** row (`SelectableText`, so it
  can be copied into a message).
- `_recordGoogleFailure` now takes a `route` — `native-sheet`, `firebase-exchange` or
  `hosted-browser` — and writes `google_signin_route`, `google_signin_code` and
  `google_signin_description` to Crashlytics alongside the package id, SHA-1 and installer
  it already recorded. The three legs fail for entirely different reasons and a report that
  cannot tell them apart is close to useless.
- When the hosted flow also fails, the detail names **both** legs.

## What is still unproven

**All of it, on a real handset.** None of this can be verified from a workstation: the
failure lives in Credential Manager on a specific device with a specific Play services
build. What has been proven is the configuration (above, live), the plugin's classification
(from its source), and the new mapping (unit tests in
`apps/mobile/test/features/auth/google_firebase_auth_service_test.dart`).

If the real cause turns out to be something else entirely, the change above is still what
makes it findable — which is the honest claim to make for it.

## What to do next

1. Install this build and tap **Continue with Google**.
2. If it fails, open **Details** under the error and send the line. It looks like
   `canceled: activity is cancelled by the user.` or
   `providerConfigurationError: Credential Manager not supported.`
3. Read it against the table above. `unknownError: No credential available: …` means there
   is no Google account on the phone. `providerConfigurationError` means Play services.
   `clientConfigurationError` means us.
4. Settings → About → App signature still reports the package id and SHA-1 this build is
   presenting — the only place a Play-signed release's certificate is readable. If it names
   a pair that is not in the table above, register it:
   `firebase apps:android:sha:create <appId> <sha>`, then re-download `google-services.json`.

## Not changed, and why

- **`minSdk`** — Credential Manager needs API 23+ (`androidx.credentials`) and current Play
  services. `flutter.minSdkVersion` was not raised: it is a `build.gradle.kts` change with
  a release-wide blast radius, and nothing yet shows a device below the floor. If a Details
  line comes back saying `providerConfigurationError: Credential Manager not supported`,
  that is the evidence to act on.
- **The manifest and `MainActivity`** — checked for the usual hosted-flow breakers (a
  `singleInstance`/`singleTask` launch mode that drops the returning intent, a missing
  `android:exported`, a conflicting deep link). Nothing found.
- **App Check** — activated in `firebase_bootstrap.dart` with the Play Integrity provider in
  production. It gates `signInWithCredential`, but it gates email/password sign-in equally,
  and that works, so it is not the differentiator.
