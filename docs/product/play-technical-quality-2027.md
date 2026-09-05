# Play technical quality: the 2027 thresholds

What Google's August 2026 post — *App quality, memory optimization and secure
onboarding* — actually requires of this app, what was already true, what
changed in the codebase, and the one thing only a person with the Play Console
can finish.

Source: [the announcement][blog] and the threshold page it links to,
[Technical quality requirements][thresholds].

[blog]: https://android-developers.googleblog.com/2026/08/app-quality-memory-optimization-secure-onboarding.html
[thresholds]: https://support.google.com/googleplay/android-developer/answer/17492799

Two deadlines, three requirements. Missing them does not get the app removed —
the stated consequence is **reduced store visibility and publishing
capability**, which for an app whose members mostly arrive through search is
close enough to the same thing.

| Requirement | Enforced from | State here |
| --- | --- | --- |
| DEX code optimisation ≥ 25% | February 2027 | Already satisfied. Nothing to do. |
| Memory and bitmap thresholds | February 2027 | Comfortably inside on RSS. Bitmaps now released on background. |
| Zero-Tap Sign-In restoration | April 2027 | **Live.** Deployed and answering; needs a real device transfer to prove end to end. |

---

## 1. DEX code optimisation — already satisfied

The rule: at least **25% coverage across optimisation, shrinking and
obfuscation**, measured by Play on each uploaded bundle. It only applies at all
once an app's DEX exceeds **10 MB** (50 MB for games).

Nothing needed changing, and it is worth writing down why so nobody
"fixes" it later:

- **R8 is on.** The Flutter Gradle plugin sets `isMinifyEnabled` and
  `isShrinkResources` on the release build type itself, and adds
  `proguard-android-optimize.txt`, Flutter's own rules, and this app's
  `android/app/proguard-rules.pro`. It is disabled only by passing
  `-Pshrink=false`, which nothing in this repo does.
- **AGP 9** is pinned in `android/settings.gradle.kts`, whose R8 runs the
  optimised resource shrinker by default.
- **Repackaging** — the fourth setting Play's optimisation report looks for —
  is `-repackageclasses ''` in `proguard-rules.pro`.

Where to confirm it: Play Console shows a **DEX code optimisation** insight per
bundle upload. Read it after the next release rather than trusting this
paragraph.

## 2. Memory and bitmaps

### 2.1 Dynamic memory (anonymous RSS + swap)

Judged at the 90th percentile, per device RAM tier and per app state. The
floor case — a 4 GB handset — allows **2 GB foreground** and **1 GB in
background or while running a user-perceived service**. This is a Flutter app
whose heaviest surface is a video reel; it is not in the same postcode as those
numbers. No change.

### 2.2 Bitmap memory — one change

The bitmap rule is stricter and is the one this app could plausibly trip:
**> 200 MB** while in the background or running a user-perceived service,
**> 400 MB** cached. The reasoning is that a decoded bitmap no screen is
drawing cannot become a pixel.

This app is more exposed than most, for a specific reason: the music player
runs a media foreground service, so it has a long-lived *user-perceived
service* state that an app without background playback never enters. Somebody
listening to an audiobook with their phone in their pocket is in that state for
hours — and Flutter's image cache, up to its 100 MB budget, survives it. The
engine forwards Android's memory-pressure signals and Flutter empties the cache
when one arrives, but those mean "the device is running low" and are not sent
when an app is merely backgrounded.

**Changed:** `apps/mobile/lib/core/image_memory.dart` — an app-lifecycle
observer attached in `main` that clears the image cache when the app leaves the
foreground. Images a live widget still holds are untouched; what goes is the
backlog. The cost of being wrong is a re-decode on the way back in.

## 3. Zero-Tap Sign-In restoration — the real work

The rule: an app that supports sign-in, optional or mandatory, **must sign the
member back in without a tap** when they move to a new Android device. Mobile
and tablet, Android 9+. Games are out of scope; so are enterprise and
permanently-private apps, and Block Store integrations completed before 30
September 2026. None of those exemptions apply here.

The mechanism is Android's **Restore Credentials API**, and a restore key is a
real WebAuthn credential — so this needed a real relying party, not a token
store. That is the shape of what was built.

### 3.1 What was added

| Piece | File |
| --- | --- |
| Relying party — five callables, FIDO verification, custom-token issue | `services/functions/src/restore-credentials.ts` |
| Server-only Firestore collections | `firebase/firestore.rules` |
| Device half — Credential Manager create / get / clear | `apps/mobile/android/app/src/main/kotlin/world/indigen/mobile/RestoreCredentialChannel.kt` |
| Credential Manager dependency | `apps/mobile/android/app/build.gradle.kts` |
| Backup participation and its rules | `AndroidManifest.xml`, `res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml` |
| App half — mint, restore, forget | `apps/mobile/lib/features/auth/restore_credentials.dart` |
| Forget-on-sign-out | `apps/mobile/lib/features/auth/auth_repository.dart` |
| `get_login_creds` in the emitted association file (dormant — see §3.5) | `apps/website/scripts/emit-well-known.mjs` |

### 3.2 How a session actually moves

1. A member signs in. `restoreCredentialProvider`, watched by the shell, calls
   `startRestoreKeyRegistration`; the backend issues WebAuthn creation options
   bound to a single-use challenge; Credential Manager mints a key whose
   private half never leaves the device; `finishRestoreKeyRegistration` stores
   the public half against their uid.
2. Android's backup service carries the key forward — to the encrypted cloud
   backup, or over the cable during device-to-device setup.
3. On the new phone, the first launch finds nobody signed in and calls
   `startRestoreSignIn`. The system asserts the key. `finishRestoreSignIn`
   verifies the signature against the stored public key and returns a Firebase
   **custom token**, which the app exchanges for an ordinary session. Every
   rule and claim downstream is unchanged.
4. Signing out forgets both halves, device first.

Nothing about this is visible to a member, and every step of it fails
harmlessly: a device below Android 9, stale Play services, no screen lock, no
backup, a fresh install that was never restored. Each of those ends at the
sign-in screen, which is exactly what happens today.

### 3.3 Backup had to be turned on

`android:allowBackup` was `false`. It is now `true`, because the restore key
travels by the backup transport and an app excluded from backup is one the
transport carries nothing for.

That is a real change in posture, so the rules are whitelists with **one entry**
— `FlutterSharedPreferences.xml`, the app's own preferences. Appearance,
reading language, data-saver choices, recent searches and Kawuri history follow
a member to their new phone, which is what Google means by pairing the restore
key with app data backup. Everything else stays behind, and each omission is a
decision recorded in `res/xml/backup_rules.xml`:

- **`FlutterSecureStorage.xml`** — encrypted with hardware keystore keys that
  are not backed up and cannot be. A restored copy is unreadable ciphertext.
- **The Firebase Auth session store** — a session belongs to the install that
  obtained it. The new device proves itself with the restore key and is issued
  its own.
- **`databases/`** — the offline library index names downloaded files by path,
  and those files are not restored.
- **`files/` and external storage** — downloaded audio and video. Large, and
  re-downloadable.

One consequence worth knowing: because preferences *are* restored, the marker
recording "this install already minted a key" is kept in the **secure store**
rather than in preferences. A marker in preferences would arrive on the new
device claiming a key it does not have, and no key would ever be minted there.

### 3.4 Configuration — set, 2026-09-05

Both values are set in `services/functions/.env` and deployed:

```
RESTORE_CREDENTIAL_RP_ID=indigenworld.com
ANDROID_CERTIFICATE_DIGESTS=<the four production certificates, base64url>
```

Confirmed against production rather than assumed — `startRestoreSignIn` answers
`enabled: true`, issues a challenge and scopes it to `indigenworld.com`, and
`finishRestoreSignIn` refuses an unknown challenge with `FAILED_PRECONDITION`
before it looks anything up:

```bash
curl -X POST https://us-central1-project-kassena-7e026.cloudfunctions.net/startRestoreSignIn   -H 'Content-Type: application/json' -d '{"data":{}}'
```

The four digests are the production package's own certificates, taken from the
association file and converted to the base64url form Credential Manager sends
as `android:apk-key-hash:`. The backend accepts colon-hex too.

**Enabling this switched on a second thing, by design.**
`ANDROID_CERTIFICATE_DIGESTS` is the list Play Integrity checks against, reused
rather than duplicated, and it was empty — so that check was being skipped
entirely. It is now active. `PLAY_INTEGRITY_MODE` is `monitor`, so verdicts are
recorded and nothing is refused; `startIntegrityCheck` was re-checked after the
deploy and still answers. Read the verdicts before considering `enforce`.

Only the production flavour's certificates are listed, so a `.dev` or
`.staging` build will not do zero-tap. Adding those digests would also make
Play Integrity accept them, which is the worse trade.

### 3.5 The association file — done, and not where anyone thought it was

`https://indigenworld.com/.well-known/assetlinks.json` now claims
`delegate_permission/common.get_login_creds` for `com.indigenworld.indigen`.
Confirmed through Google's own Digital Asset Links API, which is what Android
consults:

```bash
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://indigenworld.com&relation=delegate_permission/common.get_login_creds"
```

Getting there turned up something worth writing down, because it contradicts
what this repo believed. **That file was never uploaded by anyone.** Firebase
Hosting generates an assetlinks.json from the Android apps registered in the
project and serves it whenever the site deploys none of its own. That is why it
appeared to survive deploys, why nothing here produced it, and why
`emit-well-known.mjs` looked like dead code.

The tell is in the response headers, and it is worth knowing which file you are
looking at:

| | Generated by Hosting | Deployed by us |
| --- | --- | --- |
| `Cache-Control` | `private, no-store` | `public, max-age=300` (from `firebase.json`) |
| `Strict-Transport-Security` | absent | present, like `/robots.txt` |
| Relations | `handle_all_urls` only | whatever the config claims |

Firebase offers no way to add a second relation to what it generates, so
serving our own file was the only route. `apps/website/config/app-links.json`
now lists each Android app separately — the four packages are signed by
**different** keys, which the old shared `sha256CertFingerprints` list could not
express — and reproduces the generated file exactly, with `get_login_creds`
added to the production package alone. Verified before deploying: fingerprints
identical for all four packages, one delta.

**The trade, which outlives this change.** A deployed file overrides generation
permanently. Firebase no longer fills in the gaps, so a new Android app, a new
flavour or a rotated signing key must be added to that config by hand or App
Links silently stop verifying for it. The rollback is to stop deploying the
file: Firebase resumes generating one immediately.

### 3.6 Deploying it

Three deploys, and they are independent — none of them changes behaviour until
§3.5 is done, so they can go out in any order and ahead of the fingerprints.

```bash
npm run build:functions && firebase deploy --only functions --project project-kassena-7e026
```

**Check `services/functions/functions.yaml` is absent before deploying.** It is
a generated manifest, and a stale one silently skips triggers it predates —
which would deploy this release with none of the five new callables and no error
anywhere. There is no such file in the tree today; delete it if one appears.

```bash
firebase deploy --only firestore:rules --project project-kassena-7e026
npm run build:website && npm run deploy:website
```

The website deploy is the one that carried §3.5, and it is already done — the
run uploaded exactly one file, `.well-known/assetlinks.json`. Re-run it only if
that config changes.

## 4. What to verify after the next release

- Play Console → the **DEX code optimisation** insight on the uploaded bundle
  reads at or above 25%.
- Android vitals → the new **dynamic memory** panels and the **out of memory**
  crash filter, for the user-perceived-service state in particular.
- A real device-to-device transfer with a member account, once the fingerprints
  are published. Nothing short of that exercises the restore path end to end —
  the emulator has no backup transport to carry a key.
