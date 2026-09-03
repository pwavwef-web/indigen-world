# Play Integrity and Play Billing

Everything Google Play's **App integrity** and **Monetise** pages ask for, and
which half of it is code and which half is a switch in the console.

The short version: the code is written and shipped. What is left is a set of
console changes that can only be made from the Play Console and Google Cloud
accounts that own this app — plus one policy decision about the existing
Paystack checkout (§7).

**Project facts** used throughout: Play application id `com.indigenworld.indigen`,
Firebase/Cloud project `project-kassena-7e026`, Cloud project number
`111428711822`.

## 0. Order of operations — read this first

The app is on a testing track and has not been promoted to production. That
splits this document cleanly in two, and only one half is actually blocked.

### Do now — nothing here needs production

| Section | Why it works today |
| --- | --- |
| §2 Play Integrity API, all seven services | Play reports integrity verdicts on internal, closed and production tracks alike, and Play Console lets you compare across them. Being in testing changes nothing. |
| §3 Play Store protection | A store-listing setting. It applies to whichever track the listing is serving. |
| §4 Play Developer API access | Enabling the API and inviting the service account are account-level. Doing them now means they have propagated by the time §5 unblocks. |

### Blocked until a bundle with the billing permission is uploaded

Everything under *Monetise* — the subscription products (§5) and the four Play
Billing protection switches (§6) — stays locked until **an app bundle
containing `com.android.vending.BILLING` has been uploaded to a track**.

The versions currently on Play do not contain it, because the Play Billing
Library was only added to this app in version **0.1.9 (18)**. That is the whole
blocker, and it is the entire reason the Monetise section reads as unavailable.

Two things to be clear about:

- **Production is not required.** An internal testing track is enough. Upload
  the 0.1.9 (18) bundle to internal testing and the Monetise section unlocks.
- **A Google Play payments profile is also required**, and it is separate.
  *Play Console → Setup → Payments profile*. It needs real business and bank
  details and identity verification, and Google's review can take several days
  — so start it now even though nothing else waits on it. This is yours to
  complete; no part of it can be done from this repository.

Once the bundle is up and the payments profile is active, §5 and §6 proceed
exactly as written.

| Play Console section | Services | Code | Console | Blocked? |
| --- | --- | --- | --- | --- |
| Play Integrity API | 7 | done | §2 | no |
| Play Store protection | 1 outstanding | n/a | §3 | no |
| Monetise → Subscriptions | 3 products, 6 base plans | done | §5 | until 0.1.9 (18) is uploaded |
| Play Billing protection | 4 | done | §6 | until 0.1.9 (18) is uploaded |

---

## 1. What was built

**Backend** (`services/functions/src/`)

| File | What it does |
| --- | --- |
| `google-api-auth.ts` | Access tokens for the Play Integrity and Play Developer APIs, as the function's own service account. No key files. |
| `play-integrity-policy.ts` | Pure. Reads the seven verdict fields and decides `allow` / `flag` / `block`. Tested without an emulator. |
| `play-integrity.ts` | Issues a single-use request hash, decodes the token through Google, records the verdict, and gates actions on it. |
| `subscription-catalog.ts` | Pure. Products, base plans, tier benefits, and the mapping from a Play purchase to an entitlement. |
| `play-billing.ts` | `purchases.subscriptionsv2` reads, acknowledgement, and RTDN parsing. |
| `subscriptions.ts` | Callables, the Pub/Sub notification handler, the nightly reconciliation sweep, and the entitlement writer. |

**App** (`apps/mobile/`)

| File | What it does |
| --- | --- |
| `android/.../PlayIntegrityChannel.kt` | The Standard Integrity API behind a method channel. Written here rather than taken from pub.dev — see the file's own note. |
| `lib/core/device_integrity.dart` | Runs a check and reports the verdict. Never judges anything itself. |
| `lib/features/subscriptions/` | Catalogue mirror, entitlement model, billing service, paywall, manage screen, supporter badge. |
| `lib/features/downloads/` | Offline audio, gated on the entitlement. |

**New functions to deploy**: `startIntegrityCheck`, `verifyDeviceIntegrity`,
`getSubscriptionOptions`, `preparePlayPurchase`, `registerPlayPurchase`,
`refreshSubscription`, `playBillingNotification`, `onCommunityProfileCreated`,
`reconcileSubscriptions`.

> Deploy them by explicit name. A stale `services/functions/functions.yaml`
> silently skips new triggers — regenerate the manifest first and check its
> endpoint list against `src/index.ts`. See the tester readiness runbook.

---

## 2. Play Integrity API — the seven services

### 2.1 Before any of them: link and enable

1. **Google Cloud console** → APIs & Services → enable **Play Integrity API**
   on `project-kassena-7e026`.
2. **Play Console** → your app → *Test and release* → **App integrity** →
   *Play Integrity API* → **Link Cloud project** → `project-kassena-7e026`.
   The app must be linked to the *same* Cloud project whose number the app
   sends (`111428711822`, read at runtime from `gcm_defaultSenderId`).
3. **Response encryption**: leave it on **Google-managed** (the default). The
   backend decodes through `decodeIntegrityToken`, which is what
   Google-managed means. Do not switch to self-managed keys — the code does not
   decrypt locally and would stop working.

### 2.2 The switches, one per row of that page

Play Console groups these under *App integrity → Play Integrity API →
Settings*. Turn them on in this order; the first three are the ones that
matter, and the last three are the ones that need explicit opt-in.

| Console row | Verdict field | Console action | Notes |
| --- | --- | --- | --- |
| Detect unauthorised access | `accountDetails.appLicensingVerdict` | On | Reports `UNLICENSED` for sideloads *and for internal-testing installs*. The backend does **not** refuse on it by default — see `PLAY_INTEGRITY_REQUIRE_LICENSED`. |
| Detect app tampering | `appIntegrity.appRecognitionVerdict` | On | `UNRECOGNIZED_VERSION` is refused in enforce mode. |
| Detect risky devices | `deviceIntegrity.deviceRecognitionVerdict` | On | The floor ships at `MEETS_BASIC_INTEGRITY`. Rooting a phone you own is not fraud. |
| Detect Play Games for PC | same field, `MEETS_VIRTUAL_INTEGRITY` | On | Allowed by default. Play Games for PC is a Google product. |
| Detect hyperactive devices | `deviceIntegrity.recentDeviceActivity` | On (opt-in) | Only ever **flags**, never blocks. A shared handset looks hyperactive. |
| Detect known malware | `environmentDetails.playProtectVerdict` | On (opt-in) | Only `HIGH_RISK` counts against a device. |
| Detect apps with risky permissions | `environmentDetails.appAccessRiskVerdict` | On (opt-in) | Only `UNKNOWN_CAPTURING` and `UNKNOWN_OVERLAYS` count. |

A field that has not been switched on arrives as `UNEVALUATED` or absent.
**None of those are ever treated as a failure** — `play-integrity-policy.ts`
is explicit about this, and `firebase/tests/playBilling.test.mjs` pins it. So
turning these on one at a time is safe: nothing changes until Play starts
sending the field.

### 2.3 Backend configuration

Set in `services/functions/.env` (see `.env.example` for the full commentary):

```
ANDROID_PACKAGE_NAME=com.indigenworld.indigen
PLAY_INTEGRITY_MODE=monitor
```

**Ship on `monitor`.** It decodes, records and logs every verdict and refuses
nothing. Move to `enforce` only after a few weeks of real verdicts have been
looked at — Ghana runs a great many second-hand handsets, custom ROMs and
sideloaded builds, and a fair number of them belong to exactly the members this
project exists for. Blocking them sight-unseen is the wrong trade.

**What to look at before flipping to enforce.** Verdicts land in
`deviceIntegrityChecks/{uid}` (staff-readable, nobody writes) and in the
function logs as `Play Integrity verdict`. The two numbers that decide it:

- the share of `decision: "block"` verdicts, and
- the `reasons` behind them. A wall of `device_untrusted` means the floor is
  too high for the install base; a wall of `unlicensed` means testers, not
  attackers.

### 2.4 What runs the checks

The app checks once per launch, lazily, and again before a purchase. In
`monitor` mode a failing verdict changes nothing at all. In `enforce` mode
`assertDeviceIntegrity` refuses `preparePlayPurchase` — and only that, today.
Everything else in the app stays open.

Firebase App Check already runs the Play Integrity *provider* on ordinary
traffic. That is unchanged and is still the protection on Firestore and
callables. This is the diagnosis alongside it: App Check answers yes/no and
never tells the backend why.

---

## 3. Play Store protection — "Prevent installs on risky devices"

Pure console, no code. *App integrity* → **Play Store protection** → *Prevent
installs on risky devices* → **Manage checks** → turn on **Store listing device
checks**.

This asks Play to refuse installs to devices that fail its own integrity bar
*before* they ever reach the app. Worth turning on, with one caveat to know
going in: it is enforced at install time and cannot distinguish a compromised
device from an old one. Watch install conversion in Play Console for a week
after enabling it — if it drops in Ghana specifically, that is the signal to
turn it back off.

The other six rows of that section are already green (releases are signed by
Play).

---

## 4. Play Developer API access — the step whose error message says nothing

Play Billing will fail with an unhelpful `401` until **all three** of these are
true. This is the most common way this setup gets stuck.

1. **Google Cloud console** → enable **Google Play Android Developer API** on
   `project-kassena-7e026`.
2. **Play Console** → *Setup* → **API access** → link the Cloud project
   `project-kassena-7e026`.
3. **Play Console** → *Users and permissions* → **Invite new user** → the
   Cloud Functions runtime service account → grant, for this app:
   - View app information and download bulk reports
   - **View financial data, orders, and cancellation survey responses**
   - Manage orders and subscriptions

**Which service account, exactly.** This is worth getting from the horse's
mouth rather than guessing, because Gen 2 functions run as the **compute
default** service account, not the App Engine one that older Firebase
documentation names. On this project it is:

```
111428711822-compute@developer.gserviceaccount.com
```

Confirm it any time with:

```bash
gcloud functions describe kawuriChat --region us-central1 --project project-kassena-7e026 --format="value(serviceConfig.serviceAccountEmail)"
```

Inviting `project-kassena-7e026@appspot.gserviceaccount.com` instead is a
silent failure: Play Console accepts the invitation happily, and every
Developer API call still returns `401`.

Step 3 is the one people skip. Enabling the API is not the same as granting the
service account access to the app, and the failure looks like an authentication
problem rather than a permissions one.

Changes to Play Console permissions can take a few hours to propagate.

---

## 5. Creating the subscriptions

> **Prerequisite** (see §0): the 0.1.9 (18) bundle — the first one carrying the
> Play Billing Library — must be uploaded to a track, and the payments profile
> must be active. Internal testing is enough; production is not needed. Until
> both are true this section is greyed out in Play Console.

**Play Console** → *Monetise* → **Subscriptions**. Create three products with
exactly these ids — the app and the backend both match on them character for
character, and a mismatch is a purchase that succeeds on Play and grants
nothing.

| Product id | Name | Base plan ids |
| --- | --- | --- |
| `indigen_plus` | Indigen Plus | `plus-monthly` (P1M), `plus-yearly` (P1Y) |
| `indigen_patron` | Indigen Patron | `patron-monthly` (P1M), `patron-yearly` (P1Y) |
| `indigen_creator` | Indigen Creator | `creator-monthly` (P1M), `creator-yearly` (P1Y) |

For every base plan: **auto-renewing**, renewal type *auto-renewing*, grace
period **7 days**, account hold **30 days** (both defaults), and *Resubscribe*
enabled.

### 5.1 Prices

Set them in Play Console, in GHS, and let Play convert for other markets. **No
price is written anywhere in this repository, deliberately** — the paywall
shows `ProductDetails.price`, which is Play's own formatted string in the
member's currency after regional pricing and tax. A price hardcoded in the app
would be wrong for the first member who opens it outside Ghana.

A sensible starting shape, given the ad-free benefit has to beat what an advert
earns: price the monthly plan so a year of it is a little more than the yearly
plan, and set the yearly plan at roughly ten months of the monthly. Patron
around double Plus, Creator above that. The numbers are yours to choose; the
code does not care what they are.

### 5.2 Offers (optional, and where §6.4 applies)

A free trial or an introductory price is an **offer** on a base plan, not a
separate product. The app renders both: `SubscriptionOffer.freeTrialDays` and
`introductoryPrice` are read from the pricing phases Play returns.

If you add one, set its **eligibility** to *New customer acquisition* and give
it a usage limit — that is what turns on "Prevent subscription offer abuse".

### 5.3 Tier benefits

Defined once in `subscription-catalog.ts` and mirrored by hand into
`subscription_catalog.dart`. Both are pinned by tests, so a change to one
without the other fails the build.

| | Free | Plus | Patron | Creator |
| --- | --- | --- | --- | --- |
| Adverts | shown | none | none | none |
| Kawuri questions/day | 20 | 200 | 400 | 600 |
| Offline tracks | 0 | 50 | 200 | 500 |
| Mark | — | Supporter | Patron | Studio member |
| TribeStudio quotas | — | — | — | raised |

Two of these are enforced on the server (`kawuriDailyMessages` in `kawuri.ts`,
and the entitlement document itself, which no client may write). Ad-free and
the download limit are applied on the device, and honestly so: served adverts
and published media are both already public, so a server-side check there would
be theatre over a public URL.

The supporter marks are deliberately **not** `verifiedKind` values. A
verification mark says something was checked; a supporter mark says something
was paid. A test asserts the two vocabularies never collide.

---

## 6. Play Billing protection — the four services

> **Prerequisite**: the same one as §5. These live under *Monetise* and unlock
> with it.

*Monetise* → **Play Billing protection**. Three of the four need the app to be
doing something, and it now is.

### 6.1 Prevent suspicious purchases — fraud and abuse monitoring

Switch on. It works from the **obfuscated account id** attached to every
purchase, which `preparePlayPurchase` mints (a SHA-256 of the uid — stable,
64 characters, carrying nothing about the person) and the app passes as
`applicationUserName`. Without that id Play's verdict is materially worse; with
it, Play can see one payment instrument spraying across many accounts.

### 6.2 Prevent gift card abuse — gift card protection

Switch on. Nothing in the app to change.

### 6.3 Prevent purchases from location spoofing

Switch on. The purchase's `regionCode` is stored on the entitlement, so a
mismatch is visible in support afterwards as well.

### 6.4 Prevent subscription offer abuse — offer usage limits

Configured **per offer**, not globally: on each offer, set eligibility to *New
customer acquisition* and a usage limit of 1. Nothing to switch on until §5.2
creates an offer.

### 6.5 Real-time developer notifications

Without this, a cancellation or a failed renewal is only noticed by the nightly
sweep — up to a day late.

1. **Google Cloud console** → Pub/Sub → create topic **`play-billing-rtdn`** in
   `project-kassena-7e026`.
2. On that topic, grant **Pub/Sub Publisher** to
   `google-play-developer-notifications@system.gserviceaccount.com`.
3. **Play Console** → *Monetise* → **Monetisation setup** → *Real-time
   developer notifications* → paste
   `projects/project-kassena-7e026/topics/play-billing-rtdn` → **Send test
   notification**.
4. The test lands in the `playBillingNotification` function logs as
   *"Play sent a test notification; the topic is wired up."*

The handler deliberately ignores the notification *type* and re-reads the
purchase from Google instead. That is Play's own guidance — a notification is a
prompt to go and look, never a fact to act on — and it means a notification
type Google adds later needs no code change.

If the topic id differs, set `PLAY_RTDN_TOPIC` in `services/functions/.env`.

---

## 7. The open question: Paystack inside the Android app

**Decision taken: leave it, and flag it here.** Written down so the next Play
review is not the first time anybody thinks about it.

The ad-campaign checkout (`ads.ts`, `startAdPayment`) sends advertisers to a
Paystack hosted page from inside the Android app. Google Play's Payments policy
requires Play Billing for purchases of **in-app digital content**, with
exemptions that include physical goods and certain business services.

- **The argument for leaving it**: buying advertising placement is a business
  service sold to a business, not digital content consumed in the app. Apps
  that sell advertising to their own users have generally been treated this way.
- **The risk**: it is a judgement call a reviewer makes, not a rule with a
  bright line. A rejection would arrive as a policy warning against the whole
  app, not just that flow.
- **If it is ever challenged**, the cheapest fix is to hide the checkout on
  Android and point advertisers at the TribeStudio web checkout. The campaign
  screens already work without it; only `startAdPayment` and the button that
  calls it would need gating.

Subscriptions themselves are **not** in this grey area and are correctly on
Play Billing, which is what §5 sets up.

---

## 8. Testing before release

All of this happens on the internal testing track. None of it needs production.

1. **Licence testers**: Play Console → *Setup* → **Licence testing** → add the
   testing Google accounts. They buy on real Play sheets with no money moving,
   and the purchase carries `testPurchase`, which the manage screen says out
   loud so nobody mistakes it for a paid one. The tester's Google account must
   also be on the internal testing track's tester list — two separate lists,
   and being on only one of them is the usual reason a test purchase fails.
2. **Internal testing track**: subscriptions only appear once the app is
   published to a track and the products are **active**. A debug build
   sideloaded over USB will show an empty paywall — not a bug. Which of the two
   empty paywalls it is depends on the flavour. The `development` and `staging`
   flavours carry their own application ids (`world.indigen.mobile.dev` and
   `.staging`); Play has never heard of either, so the `BillingClient`
   connection is refused outright and the paywall says *Google Play is not
   available on this device*. Only the `production` flavour builds
   `com.indigenworld.indigen`, and a sideloaded production build gets as far as
   `queryProductDetails` returning nothing. Install from the internal-testing
   opt-in link, not from a local build, when testing purchases.
3. **Integrity on an internal build**: expect `appLicensingVerdict: UNLICENSED`.
   That is why `PLAY_INTEGRITY_REQUIRE_LICENSED` ships `false`.
4. **The full purchase path worth walking once**: buy → check
   `entitlements/{uid}` gains the tier → adverts disappear from Explore →
   cancel in Play → the entitlement flips to `canceled` with the same expiry →
   access continues to that date → the nightly sweep expires it afterwards.
5. **When the paywall is empty, read it before guessing.** The *Why?* button
   on the empty paywall names which of the five causes it is and prints the
   application id the build is actually running under — one glance settles the
   commonest false alarm. *Try again* re-asks Play without restarting the app,
   which is what recovers a Play Store that was signed out a minute ago.
6. **Recovery**: force-stop the app mid-purchase. The purchase is redelivered
   on the next launch through `BillingService.start()` and settles then. It is
   the reason `completePurchase` is only called after the backend has settled.

---

## 9. Deploy checklist

### The app

Build the bundle and upload it to **internal testing** — this is what unlocks
§5 and §6. Delete the generated plugin registrant first: running the test suite
regenerates it including dev-only plugins, and a release build reuses that file
rather than regenerating it, failing with "package
`dev.flutter.plugins.integration_test` does not exist". See the release note for
0.1.9 (18).

```bash
rm -f apps/mobile/android/app/src/main/java/io/flutter/plugins/GeneratedPluginRegistrant.java
```

```bash
cd apps/mobile && flutter build appbundle --release --flavor production
```

### The backend

```bash
npm run build:functions
```

```bash
firebase deploy --only firestore:rules --project project-kassena-7e026
```

Then deploy the new functions by explicit name (never a full-scope deploy —
see the manifest note in §1):

```bash
firebase deploy --only functions:startIntegrityCheck,functions:verifyDeviceIntegrity,functions:getSubscriptionOptions,functions:preparePlayPurchase,functions:registerPlayPurchase,functions:refreshSubscription,functions:playBillingNotification,functions:onCommunityProfileCreated,functions:reconcileSubscriptions,functions:kawuriChat --project project-kassena-7e026
```

`kawuriChat` is in that list because its daily allowance now reads the
entitlement; deploying the rest without it leaves subscribers on the free cap.

New Firestore collections, all server-written: `entitlements`,
`subscriptionPurchases`, `playAccountIndex`, `deviceIntegrityChecks`,
`_integrityChallenges`.

Tests covering all of this:

```bash
npm run test:function-helpers && npm run test:rules
```

```bash
cd apps/mobile && flutter test
```
