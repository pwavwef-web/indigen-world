# Play Data Safety declarations — reviewed 2026-09-20

The form was reviewed against the SDKs the app actually ships and the code that
uses them, not against the previous answers. It was materially under-declared:
it described an app with no accounts that collects analytics and crash data,
which has not been true for some time and was never true of the media, chat and
purchase features.

Every answer below is stated with the evidence for it. The declarations are the
account owner's; this document exists so the next person changing an SDK can
see which answer depends on it.

## What was wrong before

| Answer | Was | Now | Why |
| --- | --- | --- | --- |
| Account creation | "My app does not allow users to create an account" | Username and password, plus OAuth | `AuthRepository.createUserWithEmailAndPassword` and `sendPasswordResetEmail`; `GoogleFirebaseAuthService` with `google_sign_in` |
| Can users log in with outside accounts | No | *(not asked)* | Play only asks this when the app declares no account creation, and rejects an answer otherwise |
| Personal info | none | Name, Email address, User IDs, Phone number | Sign-up collects a display name and email; Firebase Auth issues the uid; phone verification is offered in Settings |
| Financial info | none | Purchase history | `in_app_purchase` / Play Billing for Plus, Patron and Creator |
| Messages | none | Other in-app messages | Community chat |
| Photos and videos | none | Photos, Videos | `image_picker` in compose, reels, contributions and ad creatives |
| Audio files | none | Voice or sound recordings | `record` in the pronunciation recorder and reel tools |
| Files and docs | none | Files and docs | `file_picker` in contribution upload |
| App activity | App interactions | + In-app search history, Other user-generated content | Dictionary and archive search; every contributed post, reel and recording |
| Location | none | Approximate location | Google Mobile Ads and Firebase Analytics derive a coarse region from the IP address. The privacy notice already says "an approximate region", so the form has to agree |
| Delete data URL | `indigen-world.web.app/privacy` | `indigenworld.com/privacy` | The canonical origin, the one the Play listing and `app-ads.txt` use |
| Account deletion URL | empty | `indigenworld.com/privacy` | Required once the app declares account creation |

Unchanged and still correct: data is encrypted in transit; a deletion route is
offered; crash logs, diagnostics and other app performance data are collected;
device or other IDs are collected.

## Collected versus shared

Play counts a transfer to a service provider as collection, not sharing. Firebase
Analytics, Crashlytics, Performance, Auth, Firestore and Storage are service
providers for this app, so everything they carry is **collected only**.

Google's advertising partners are not service providers. AdMob's 198 selected
common ad partners receive data, so the three types AdMob touches are
**collected and shared**:

| Data type | Shared for | Why |
| --- | --- | --- |
| Device or other IDs | Advertising or marketing, Personalisation | The advertising identifier passed to AdMob on a filled request |
| App interactions | Advertising or marketing, Personalisation | Ad impressions and clicks |
| Approximate location | Advertising or marketing | Coarse region used to select an advert |

Personalisation appears because a consenting user may receive personalised ads.
It cannot happen without consent, and it never happens for a paid member, but
Play asks whether it can happen at all.

## Required versus optional

"Optional" means the user decides whether it is collected. The archive is usable
signed out, so everything that only exists because somebody chose to sign in,
contribute or buy is optional:

- Optional — Name, Email address, User IDs, Phone number, Purchase history,
  Other in-app messages, Photos, Videos, Voice or sound recordings, Files and
  docs, Other user-generated content.
- Required — Approximate location, App interactions, In-app search history,
  Crash logs, Diagnostics, Other app performance data, Device or other IDs.
  These follow from analytics, diagnostics and advertising that a user cannot
  switch off inside the app.

## Not declared, and why

Precise location (no location permission is requested), Address, Race and
ethnicity, Political or religious beliefs, Sexual orientation, Other personal
info, User payment info (Play handles payment instruments; the app never sees
them), Credit score, Other financial info, Web browsing history, Emails, SMS or
MMS, Music files, Other audio files, Health info, Fitness info, Contacts,
Calendar events, Installed apps, Other actions.

## Still open

- The privacy page carries a deletion section, but Play asks an account-deletion
  URL to "prominently feature the steps". The page currently says server-side
  requests are handled manually by the team. Worth a short, explicit
  account-deletion section before Google reviews it.
- "Contains ads" on the store listing must be declared, since AdMob can serve to
  guests and free members even when no first-party campaign is running.
- Target audience is unchanged. Nothing here declares the app child-directed,
  and that designation must follow the real audience rather than the form.
