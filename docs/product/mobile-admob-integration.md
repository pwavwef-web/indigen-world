# Mobile advertising: first-party priority with AdMob fallback

Implementation prepared 2026-09-20; console work completed the same day.
Native rendering, placement and consent handling revised 2026-09-26 — see
[Native rendering](#native-rendering) and [Status on 2026-09-26](#status-on-2026-09-26).

What is done: the code, the release configuration, the consent message (renamed,
*Do not consent* enabled, republished), the Play Data Safety correction
(submitted for review), and a live `app-ads.txt`. What is not proven: that the
AdMob app is approved for full serving, that any unit is serving, or that a
build carrying the Mobile Ads SDK is on a Play track the public can install.
Nothing in this repository can prove those; they are console facts.

## Serving policy

`adsAllowedProvider` is the only client-side eligibility gate. It fails closed
while Firebase Auth, the entitlement, or backend benefits are unresolved.
Guests and resolved free members are eligible. Plus, Patron and Creator members
are not. Active, grace-period, and paid-through-cancellation behavior continues
to come from the existing entitlement model.

Community, Explore, and Collection keep their existing cadence and positions.
Each position resolves in this order:

1. an eligible first-party campaign, rendered by the existing sponsored-card
   or sponsored-reel UI;
2. the mapped Google native unit, only if consent permits requests;
3. no row when Google is unavailable or returns no fill.

No interstitial, rewarded, app-open, or additional advertising positions are
configured. Explore's Following feed, searches, short lists below their
existing cadence, and sensitive account/payment/contribution screens are
ad-free. Community's Following tab is *not*: both Community tabs have carried
the Community placement since first-party adverts arrived on 2026-08-31, and
the Google fallback inherited that. (This document said otherwise until
2026-09-26; whether Community Following should be ad-free like Explore's is a
product decision that also affects first-party advertisers.)

The Collection overview has exactly one position. Until 2026-09-26 it was the
last page of the place-story carousel, which advances by itself every three
seconds: the advert slid into the place a thumb was reaching for a story card,
and when Google had no fill, or consent did not permit a request, the carousel
still stopped on an empty page every cycle. The position now stands still under
the channel grid (`CollectionScreen._hasOverviewAd`), and takes no room when
there is nothing to show. The carousel carries no advert of either kind.

Which unit serves where — the Collection unit is used for the Collection
placement and nothing else:

| Placement | Unit (`admob.local.json` key) | Positions |
|---|---|---|
| `AdPlacement.collection` | `ADMOB_COLLECTION_NATIVE_AD_UNIT_ID` ("Indigen Collection Native") | overview (one, under the grid); Music/Audiobooks home list, Literature and Video channel lists, Dictionary browse, Heroes, Apps, Shop — after every 5th row, never in search results |
| `AdPlacement.community` | `ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID` | For you and Following timelines, after every 10th post |
| `AdPlacement.explore` | `ADMOB_EXPLORE_NATIVE_AD_UNIT_ID` | For you reel pager, one page after every 6th reel; never Following |

## Native rendering

Every Google advert is a Native advanced ad drawn with the plugin's **medium**
native template (`AdMobNativeSlot` in `lib/features/ads/admob_native.dart`).
The rules it keeps, and why:

- **Size.** The medium template's Android layout is a fixed 350dp tall; the
  slot gives it exactly that, at most 400 wide. The earlier 300dp box clipped
  the call-to-action button off the bottom. Google recommends 320–400 by
  320–400 for this template. The small template is not used anywhere: it has
  no MediaView, which a video creative requires.
- **Legible in both themes.** Every text colour and the background are stated
  through `NativeTemplateStyle`, taken from the app palette. Left alone, the
  template's body text inherits the Android activity theme's colour — white
  under the dark `Theme.Black` — on the template's own white card.
- **Labelled and framed.** Above the template, outside the ad view, the app
  draws "ADVERTISEMENT". The template carries Google's own "Ad" badge and the
  SDK adds the AdChoices icon. The label is not a control, so nothing
  interactive touches the advert's edge, and it doubles as a buffer from the
  row above. Full-bleed hosts (Community, Music) inset the frame by the same
  gutter as their first-party card.
- **Space is held while a request is out.** A late advert must not push
  content under a finger (Google's implementation guidance: ads should "not
  cover or shift the other content"). The slot reserves its full height from
  the first frame in which it will really request, and collapses to nothing if
  the answer is empty.
- **One request per slot.** A rebuild never makes another request; a loaded
  advert is kept alive while its list is (scrolling away and back reuses it)
  and disposed with the screen. Community keys its advert rows by slot, so new
  posts arriving above move the advert rather than replacing it. There is no
  timed refresh.
- **Failure rests.** An empty answer or an error makes that placement stop
  requesting for 60 seconds this session (`kAdMobNoFillCooldown`), so a list
  with a slot every fifth row does not fire a request per slot while the
  account has nothing to serve.
- **Video starts muted** (stated explicitly), because the app plays music.

First-party campaigns keep their own cards (`SponsoredCard`, `SponsoredTile`)
and their own "Sponsored" label.

## Build configuration

Development, staging, debug, and automated-test builds use Google's published
sample Android app and native-unit identifiers. Production values live in one
ignored file at the repository root, `admob.local.json`, copied from
`admob.local.example.json`:

- `ADMOB_ANDROID_APP_ID`
- `ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID`
- `ADMOB_EXPLORE_NATIVE_AD_UNIT_ID`
- `ADMOB_COLLECTION_NATIVE_AD_UNIT_ID`
- `ADMOB_APP_ADS_TXT_RECORD` — website deploys only

An environment variable of the same name always wins over the file, which is
how CI supplies them from repository secrets of the same four names.

`scripts/admob-release-config.mjs` is the only thing that reads them. It checks
that each value is well formed, that none is one of Google's samples, that all
four come from the same publisher, and that no ad unit is used for two
placements — then redacts everything to a four-character suffix before printing.
Check a machine with:

```bash
npm run verify:admob-release
```

`npm run build:mobile-aab` calls it before it does anything else, so a
misconfigured release fails in a second rather than ten minutes in. It then
passes all four as `--dart-define`s and exports the app id into Gradle's
environment — supplying one half and not the other is what produces a release
that installs, runs, and silently never asks Google for an advert.

Gradle independently refuses `bundleProductionRelease` without a valid app id.
The one escape hatch is `ADMOB_COMPILE_CHECK_ONLY=true`, used by CI when the
repository has no secrets: it *forces* Google's sample app id rather than
skipping the check, so the bundle it produces cannot serve a live advert.

Never pass production identifiers to a debug build. The debug build type pins
the sample app id at a higher priority than the product flavour, so even a
production-flavour debug build cannot reach live inventory.

## Consent and privacy

Google User Messaging Platform requests an update only after membership has
resolved to ad-eligible. Mobile Ads initialization and inventory requests occur
only after `canRequestAds` is true. A form, SDK, network, or no-fill failure
collapses the slot and cannot block app content. Settings exposes Advertising
privacy choices when UMP reports that the entry point is required.

If this launch's consent update or form fails, the app still asks UMP
`canRequestAds`, as Google's UMP guide says to ("If an error occurs during the
consent gathering process, check if you can request ads"): a decision stored in
an earlier session stands, and UMP answers no when it has nothing to go on. Before
2026-09-26 any failure was treated as "no adverts this session", which was
stricter than required but never less private.

For testing the form, a debug, profile, development or staging build accepts
`--dart-define=UMP_DEBUG_GEOGRAPHY=eea` (or `us`, `other`) and
`--dart-define=UMP_TEST_DEVICE_IDS=<hashed id>[,…]`, the hashed id being the one
UMP logs on a physical device. Emulators need no id: since UMP 2.2.0 they are
test devices by default, and the plugin ships UMP 4.0.0. `developmentConsentDebugSettings` ignores both
in a production release, and `npm run build:mobile-aab` never passes them.

No child-directed or under-age treatment declaration is hard-coded. That legal
audience designation must be made by the account owner from the actual audience
and Play policy. The in-app and website privacy notices now describe Google
Mobile Ads, advertising identifiers, approximate region, device/app data,
interactions, personalization choices, and paid membership suppression.

One published English European-regulations message covers Indigen World, named
**Indigen Android — European Consent**. Reviewed and republished 2026-09-20
with the owner's approval:

- targeted at countries subject to GDPR (EEA, UK and Switzerland), not
  everywhere;
- **Do not consent** enabled for every country including the UK, Switzerland
  and "everywhere else", so the first screen offers *Do not consent* and
  *Consent* as two equal buttons with *Manage options* as a link beneath. There
  is no extra step to refuse and no deceptive hierarchy;
- 198 common ad partners selected at account level.

Refusal is Google's decision, not the app's. The app requests nothing until
UMP reports `canRequestAds`, so refusing means non-personalised advertising
where UMP still permits a request and no advertising at all where it does not.
Either way the slot collapses to zero height and nothing else changes.

Consent can be withdrawn at any time, including by a member who will never see
an advert again. The bootstrap therefore branches on the *resolved* advertising
eligibility rather than on a single boolean:

- **allowed** — the full UMP flow, which may show the consent form.
- **blocked** (a paid member) — one call to `requestConsentInfoUpdate` to learn
  whether the privacy-options entry point is required. No form is shown and no
  advertising request is made, so Settings can still offer *Advertising privacy
  choices* to somebody who consented while they were free and then subscribed.
- **unresolved** — nothing. This is the ordinary state for the first moments of
  every launch, and probing there would answer the question for members who are
  about to become eligible and need the full flow instead.

The probe deliberately leaves `AdConsentState.availability` untouched. Writing a
resolved availability there would make `AdMobNativeSlot` believe consent had
already been gathered, and a member who later returned to the free tier would be
served adverts without ever having seen the form. There is a test for exactly
that.

## AdMob console record

The existing Play listing for package `com.indigenworld.indigen` was linked to
one new AdMob Android app record. The required Native advanced units are:

- Indigen Community Native
- Indigen Explore Native
- Indigen Collection Native

All three exist as Native advanced units and were verified in the console on
2026-09-20: the app record's package is `com.indigenworld.indigen`, matching the
production flavour's `applicationId`, and it has exactly three units with no
duplicates or obsolete ones. Two other apps share the account, so always check
the package before copying an identifier.

Full account, publisher, application, and ad-unit identifiers are deliberately
not documented here. They are in `admob.local.json` and in CI secrets.

Console state on 2026-09-20:

- approval status **Requires review**, serving **limited** until app
  verification passes, which is waiting on `app-ads.txt`;
- Policy centre reports **no issues** that stop or limit serving;
- lifetime requests and impressions are zero, so nothing has served yet;
- payments profile is AdSense (Ghana). Identity verification is **not yet
  requested** — Google asks only once earnings reach its threshold — and no
  identity, tax, banking, or payment information was entered or read.

## Status on 2026-09-26

Google AdMob emailed on 2026-09-26 that publisher account
`pub-2253236309462300` is verified and ready for use. That is the *account*.
It does not say that the Indigen World app record is approved for full serving,
that the three units are active, or that anything has served.

Proven from the repository and the artefacts:

- `admob.local.json` holds app id `…~8091919998` and the Collection unit
  `…/5465756654`, the values AdMob issued for this app, and
  `npm run verify:admob-release` passes (one publisher, no samples, no unit
  used twice).
- The preserved 0.1.26 (35) bundle
  (`output/release-bundles/indigen-0.1.26+35.aab`, SHA-256 `6f29ca64…`) has
  that app id in its manifest's `com.google.android.gms.ads.APPLICATION_ID`,
  and its `libapp.so` holds the three production unit ids and no Google sample
  id. It was built **before** the 2026-09-26 rendering and placement changes,
  so it still has the carousel placement and the 300dp box.
- The 0.1.27 (36) bundle (`output/release-bundles/indigen-0.1.27+36.aab`,
  SHA-256 `c80c263c…`, built 2026-09-26) **does** carry these changes: the
  same app id in its manifest, the three production units and no sample id in
  `libapp.so`, and the "ADVERTISEMENT" frame compiled in. See
  [releases/0.1.27+36.md](releases/0.1.27+36.md).
- No tracked file holds a production identifier; only Google's sample ids
  (debug/staging) and all-zero placeholders appear in the tree.
- Merged manifests after the 2026-09-26 Gradle change: production release
  carries the live app id; production debug, production profile, development
  and staging carry Google's sample app id. Production profile carried the
  live id before this change, because Flutter creates the `profile` build type
  from `debug` before the app's pin is applied.
- A development debug build on the Pixel_7 emulator with
  `UMP_DEBUG_GEOGRAPHY=eea`: UMP recorded `IABTCF_gdprApplies=1`; the first
  form load timed out ("Web view timed out"), the app logged the failure and
  carried on, and the app process made no Mobile Ads SDK call at all. The
  emulator was too starved of host memory (repeated system ANRs) to display
  the form or render a test advert, so neither has been seen on a device.

From the AdMob console, seen by the owner on 2026-09-26: the app overview shows
**Indigen World — Free | Android — Ready**, with estimated earnings of US$0.00
for today, yesterday, this month and last month. So the app record has passed
Google's review. Nothing has earned yet, as expected: no build carrying these
changes is on a Play track, and the one uploaded build with the SDK (0.1.25)
crashes at start-up.

Not provable here — see the checklist in the next paragraph: the units'
status, the Policy Centre, `app-ads.txt` acceptance, and which Play track (if
any) carries a Mobile Ads build. The
0.1.25 (34) bundle, the first uploaded with the SDK, crashes at start-up and
must not serve as evidence of anything.

Console checklist, in order:

1. AdMob → **Apps → Indigen World (Android, `com.indigenworld.indigen`)** →
   App settings: approval status (**Ready** as of 2026-09-26), that the store
   link is `com.indigenworld.indigen` (two other apps share the account), and
   **app-ads.txt** status.
2. AdMob → **Apps → Indigen World → Ad units**: "Indigen Collection Native"
   ends `…6654`, format Native advanced, and the Community and Explore units
   end `…7222` and `…7017`. The full ids live only in the git-ignored
   `admob.local.json` at the repository root.
3. AdMob → **Policy centre**: no app-level or site-level issue listed for this
   app.
4. AdMob → **Privacy & messaging**: "Indigen Android — European Consent" is
   still published and targets this app.
5. Play Console → **App content → Ads** says the app contains ads, and **Data
   safety** was approved with the advertising data types.
6. Only after a build containing this revision is on a track: install it on a
   phone from Play, open Collection as a free member, and confirm the frame and
   template render. Do not tap a live advert; use a test device (below).

## app-ads.txt

The website build runs `scripts/emit-app-ads.mjs`, which reads
`ADMOB_APP_ADS_TXT_RECORD` from the environment or from the same ignored
`admob.local.json`. It validates the record's shape, writes `dist/app-ads.txt`,
and never logs it. A malformed record fails the build — a file that names the
wrong publisher is worse than no file, because AdMob reads it as a statement
that this account may *not* sell the inventory. An absent record is not an
error; the file is simply not emitted, with a warning.

**Live.** Checked from outside on 2026-09-26:

- The Play listing for `com.indigenworld.indigen` names
  `https://indigenworld.com` as the developer website. AdMob looks for the file
  on that host's root, and requires the store listing to name a developer
  website at all.
- `https://indigenworld.com/app-ads.txt` answers `200`, `text/plain;
  charset=utf-8`, with no redirect, 59 bytes, exactly one line:
  `google.com, pub-2253236309462300, DIRECT, f08c47fec0942fa0` — the verified
  publisher, `DIRECT`, and Google's certification authority id.
- `http://indigenworld.com/app-ads.txt` answers `301` to the HTTPS URL on the
  same host. Google's crawler checks both schemes and follows redirects.
- `www.indigenworld.com` does not resolve (NXDOMAIN). That does not affect
  `app-ads.txt`, which the crawler looks for on the listing's host and never on
  `www.`, but the Android App Links filter also claims `www.indigenworld.com`.

Re-check any time with:

```bash
npm run verify:app-ads
```

It checks status 200, `text/plain`, an unauthenticated response, no HTML body,
no redirect off the canonical origin, and — when the record is configured — that
the exact line is present, bypassing any CDN copy with a cache-busting query.

Whether AdMob has *accepted* the file is a console fact: AdMob → Apps →
Indigen World → **App settings → app-ads.txt**. A 2026-09-20 session recorded it
verified the same day the website deployed, with no release and no ad
requests, after which the app moved from **Requires review** to **Getting
ready**. Google says crawling can take up to 24 hours and offers **Check for
updates**. The line "No ad requests with app-ads.txt yet" on that tab is about
reporting, not verification.

## Play Data Safety

Reviewed against the shipped SDKs and submitted for review on 2026-09-20 with
the owner's approval. The form had been under-declared well beyond advertising
— it claimed the app allowed no account creation — so the correction covers
accounts, personal info, media, messages and purchases as well as the three
types AdMob touches.

Every answer and the evidence behind it is recorded in
[play-data-safety-2026-09.md](play-data-safety-2026-09.md). The store listing's
"Contains ads" declaration was already **Yes** and stays correct.

## Verification and rollback

Run formatting, `flutter analyze`, the advertising/subscription/widget tests,
and a development-flavor Android debug build. Test clicks must use Google's
sample units.

To look at real rendering safely, use a debug build: it always uses Google's
sample app and sample native unit, which return labelled test adverts and
cannot earn or generate invalid traffic.

```bash
flutter run --debug --flavor development --dart-define=APP_ENV=development --dart-define=UMP_DEBUG_GEOGRAPHY=eea
```

To test on a phone with the *production* units instead, register the phone as
a test device in AdMob → Settings → Test devices first; Google then serves test
adverts to it. Never tap a live advert on an unregistered device.

To roll back before release, remove the Google fallback widgets, UMP bootstrap,
manifest metadata, package dependency, and external release variables while
retaining the first-party placement providers and sponsored UI. After release,
first disable production unit values/configuration so missing identifiers
collapse safely, then ship the code rollback. Removing AdMob must also be
reflected in the privacy notice and Play Data Safety form; do not remove the
public app-ads.txt record until no serving release depends on it.
