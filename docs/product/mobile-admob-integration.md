# Mobile advertising: first-party priority with AdMob fallback

Implementation prepared 2026-09-20; console work completed the same day.

Done: the code and its tests, the release configuration, the consent message
(renamed, *Do not consent* enabled, republished), the Play Data Safety
correction (submitted for review), the website deploy that put `app-ads.txt`
live, and AdMob app verification, which passed from that file.

Not done: no release has been uploaded to Play. A production bundle has been
*built* — 0.1.22 (31), signed, with the real application id in its merged
manifest — but only to prove the configuration reaches the artefact. AdMob is in
its **Getting ready** review, so serving is limited, and nothing has served an
advert yet.

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

- app verification **passed** once `app-ads.txt` went live, which moved approval
  status from *Requires review* to **Getting ready** — Google's ad-readiness
  review, two to three days, with serving **limited** until it completes;
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

**Live and verified**, deployed 2026-09-20. Check it any time with:

```bash
npm run verify:app-ads
```

It checks status 200, `text/plain`, an unauthenticated response, no HTML body,
no redirect off the canonical origin, and that the exact configured record is
present, bypassing any CDN copy with a cache-busting query.

AdMob verified the app from the file alone, the same day, with no release and
zero ad requests. That is worth stating because the obvious reading of the
console is wrong: the app-ads.txt tab says "No ad requests with app-ads.txt yet"
and it is tempting to conclude that verification waits on a serving release. It
does not — that line is about reporting. Google warns the crawl can take up to
seven days; here it took under an hour.

Verification moved the app from **Requires review** to **Getting ready**, which
is Google's own ad-readiness review: typically two to three days, and ad serving
stays limited until it finishes. That review, not the file and not a release, is
what gates real ad fill.

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
