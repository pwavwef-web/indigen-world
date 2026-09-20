# Mobile advertising: first-party priority with AdMob fallback

Implementation prepared 2026-09-20; console work completed the same day.

What is done: the code, the release configuration, the consent message (renamed,
*Do not consent* enabled, republished), and the Play Data Safety correction
(submitted for review). What is not: no mobile release has been built or
uploaded, the website has not been deployed so `app-ads.txt` is not live, AdMob
app verification is still failing on that file, and nothing has served an
advert.

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
configured. Following, searches, short lists below their existing cadence, and
sensitive account/payment/contribution screens remain ad-free.

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

Known gap: the Settings entry for **Advertising privacy choices** only appears
once UMP has run, and UMP only runs when advertising is allowed. A member who
consented while free and then subscribed therefore cannot reopen privacy
options to withdraw that consent. No ad request is made for them either way, so
nothing is being processed on the old consent — but the entry point should not
depend on ad eligibility. Not yet fixed.

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

## app-ads.txt

The website build runs `scripts/emit-app-ads.mjs`, which reads
`ADMOB_APP_ADS_TXT_RECORD` from the environment or from the same ignored
`admob.local.json`. It validates the record's shape, writes `dist/app-ads.txt`,
and never logs it. A malformed record fails the build — a file that names the
wrong publisher is worse than no file, because AdMob reads it as a statement
that this account may *not* sell the inventory. An absent record is not an
error; the file is simply not emitted, with a warning.

**Not yet deployed.** `https://indigenworld.com/app-ads.txt` returns 404 with
the site's HTML 404 body. The hosting predeploy (`verify:production-main`)
requires a clean checkout on `main` matching `origin/main`, so the file cannot
ship from this branch — it goes out with the first website deploy after this
work merges.

After that deployment:

```bash
npm run verify:app-ads
```

It checks status 200, `text/plain`, an unauthenticated response, no HTML body,
no redirect off the canonical origin, and — when the record is configured — that
the exact line is present, bypassing any CDN copy with a cache-busting query.
Then use AdMob's **Check for updates** control on the app's verification screen.

Note that AdMob will not confirm `app-ads.txt` from the file alone: its
app-ads.txt tab currently reports "No ad requests with app-ads.txt yet", because
Google associates the crawled file with an app only once that app actually
requests ads. Verification therefore needs the file live *and* a release that
serves, and Google says the crawl itself can take up to seven days.

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

To roll back before release, remove the Google fallback widgets, UMP bootstrap,
manifest metadata, package dependency, and external release variables while
retaining the first-party placement providers and sponsored UI. After release,
first disable production unit values/configuration so missing identifiers
collapse safely, then ship the code rollback. Removing AdMob must also be
reflected in the privacy notice and Play Data Safety form; do not remove the
public app-ads.txt record until no serving release depends on it.
