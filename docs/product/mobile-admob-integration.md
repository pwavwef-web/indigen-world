# Mobile advertising: first-party priority with AdMob fallback

Implementation prepared 2026-09-20. The code is complete locally; no mobile
release, website deployment, owner approval of the AdMob consent choices, Play
Data Safety update, or production ad serving is implied by this document.

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
sample Android app and native-unit identifiers. Production values are supplied
outside Git:

- Android/Gradle: `ADMOB_ANDROID_APP_ID`
- Flutter `--dart-define`: `ADMOB_ANDROID_APP_ID`
- `ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID`
- `ADMOB_EXPLORE_NATIVE_AD_UNIT_ID`
- `ADMOB_COLLECTION_NATIVE_AD_UNIT_ID`

The Android production-release tasks reject a missing or malformed app ID. The
Dart configuration rejects malformed/missing unit IDs and collapses those
positions. Never pass production identifiers to a debug build or use a release
unit for developer clicks.

Example release configuration (placeholders only):

```text
flutter build appbundle --flavor production \
  --dart-define=APP_ENV=production \
  --dart-define=ADMOB_ANDROID_APP_ID=<external-value> \
  --dart-define=ADMOB_COMMUNITY_NATIVE_AD_UNIT_ID=<external-value> \
  --dart-define=ADMOB_EXPLORE_NATIVE_AD_UNIT_ID=<external-value> \
  --dart-define=ADMOB_COLLECTION_NATIVE_AD_UNIT_ID=<external-value>
```

The Gradle property/environment variable must be available to Gradle as well as
the matching Dart define. Do not put the values in a checked-in properties
file.

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

AdMob currently reports one published English European-regulations message for
Indigen World. Its visible choices are Consent and Manage options; the direct
Do not consent option is off. This existing console state was inspected, not
approved as a legal choice. The account owner must review that choice and the
message text before production inventory is enabled.

## AdMob console record

The existing Play listing for package `com.indigenworld.indigen` was linked to
one new AdMob Android app record. The required Native advanced units are:

- Indigen Community Native
- Indigen Explore Native
- Indigen Collection Native

Full account, publisher, application, and ad-unit identifiers are deliberately
not documented. The AdMob account is still under verification and the app
currently reports limited serving / review required until verification,
consent, and app-ads.txt work is complete.

The Policy centre currently reports no issues that stop or limit serving.
Payments verification says identity information may be requested only after
the account reaches Google's verification threshold; no identity, tax,
banking, or payment information was entered.

## app-ads.txt

The website build runs `scripts/emit-app-ads.mjs`. At deployment, set
`ADMOB_APP_ADS_TXT_RECORD` to the exact single record supplied by AdMob. The
script validates its shape, writes `dist/app-ads.txt`, and never logs the
record. A build without the variable remains usable but prints that no file was
emitted.

After an authorized website deployment:

1. verify `https://indigenworld.com/app-ads.txt` returns only the exact record;
2. wait for AdMob's crawler (Google notes that this may take time);
3. request app verification in AdMob;
4. confirm the app no longer reports app-ads.txt verification failure.

## Play Data Safety review

Before submitting an updated form, compare every answer with the current Google
Mobile Ads data-disclosure page and the app's configured consent behavior. The
review must cover device/advertising identifiers, device or app information,
approximate location/region where applicable, diagnostics, and advertising
interaction data. Do not submit the form until the account owner agrees that
each declaration matches the released SDK behavior.

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
