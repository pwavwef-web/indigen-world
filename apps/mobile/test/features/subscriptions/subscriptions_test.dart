import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/billing_service.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/features/subscriptions/paywall_screen.dart';

/// The catalogue, the entitlement rules, and the one place a subscription
/// actually changes what a screen draws.
///
/// The numbers pinned here are the same ones pinned in
/// `firebase/tests/playBilling.test.mjs`. That is the point: the two files are
/// hand-kept mirrors, so a change made on one side and forgotten on the other
/// fails here or there rather than in front of somebody who has paid.

/// Relative to the real clock, deliberately.
///
/// `Entitlement.benefits` — and therefore every provider that reads it — asks
/// `DateTime.now()`, because that is the only question a running app can ask.
/// Pinning these to a fixed date would make the whole file pass today and fail
/// on whatever day that date went past.
final _now = DateTime.now();
final _future = _now.add(const Duration(days: 30));
final _past = _now.subtract(const Duration(days: 30));

Entitlement _entitlement({
  SubscriptionTier tier = SubscriptionTier.plus,
  EntitlementStatus status = EntitlementStatus.active,
  DateTime? expiresAt,
  String productId = 'indigen_plus',
  String basePlanId = 'plus-monthly',
}) => Entitlement(
  tier: tier,
  status: status,
  productId: productId,
  basePlanId: basePlanId,
  expiresAt: expiresAt ?? _future,
  autoRenewing: true,
);

ServedAd _ad(String id) => ServedAd(
  campaignId: id,
  headline: 'Headline $id',
  body: 'Body',
  creativeUrl: 'https://example.test/$id.jpg',
  mediaType: 'image',
  placements: const [
    AdPlacement.explore,
    AdPlacement.community,
    AdPlacement.collection,
  ],
);

/// A container whose entitlement, advert stream and server benefits are all
/// stubbed.
///
/// [serverBenefits] defaults to null, which is what the app sees whenever the
/// backend has not answered — offline, still loading, or no Firebase at all.
ProviderContainer _container({
  required Entitlement entitlement,
  List<ServedAd> ads = const <ServedAd>[],
  TierBenefits? serverBenefits,
}) {
  final container = ProviderContainer(
    overrides: [
      entitlementProvider.overrideWith((ref) => Stream.value(entitlement)),
      servedAdsProvider.overrideWith((ref) => Stream.value(ads)),
      serverBenefitsProvider.overrideWith((ref) async => serverBenefits),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Subscribes and turns the event loop until the stubbed streams have reached
/// the derived providers.
///
/// Reading `.future` would hang instead: nothing in a bare container keeps a
/// provider alive between reads, so a stream is disposed mid-load and the
/// future never completes. The same trap `ads_test.dart` documents.
Future<void> _settle(ProviderContainer container) async {
  container.listen(entitlementProvider, (_, _) {});
  container.listen(servedAdsProvider, (_, _) {});
  container.listen(serverBenefitsProvider, (_, _) {});
  for (var turn = 0; turn < 4; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

/// A stand-in for the plugin that answers `isAvailable` slowly, the way the
/// real one does: under it sits a `BillingClient` connection and a platform
/// channel, so the answer never arrives in the same turn it was asked for.
class _FakePlugin implements InAppPurchase {
  _FakePlugin({this.availability = const [true]});

  /// One answer per call to [isAvailable], the last one repeating. Lets a test
  /// say "no the first time, yes the second" — a Play Store that was signed
  /// out and now is not.
  final List<bool> availability;

  int availabilityChecks = 0;

  final _purchases = StreamController<List<PurchaseDetails>>.broadcast();

  @override
  Stream<List<PurchaseDetails>> get purchaseStream => _purchases.stream;

  @override
  Future<bool> isAvailable() async {
    final answer =
        availability[availabilityChecks.clamp(0, availability.length - 1)];
    availabilityChecks++;
    // The delay is the whole point. A caller that walks past a start still in
    // flight reads the availability from before this returns.
    await Future<void>.delayed(const Duration(milliseconds: 20));
    return answer;
  }

  @override
  Future<ProductDetailsResponse> queryProductDetails(
    Set<String> identifiers,
  ) async => ProductDetailsResponse(
    productDetails: const [],
    notFoundIDs: identifiers.toList(),
  );

  @override
  Future<bool> buyNonConsumable({required PurchaseParam purchaseParam}) async =>
      true;

  @override
  Future<bool> buyConsumable({
    required PurchaseParam purchaseParam,
    bool autoConsume = true,
  }) async => true;

  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {}

  @override
  Future<void> restorePurchases({String? applicationUserName}) async {}

  @override
  Future<String> countryCode() async => 'GH';

  /// `getPlatformAddition` is the one member left, and naming its bound would
  /// mean importing the platform interface package directly. Nothing in this
  /// file calls it, so it is forwarded into a throw instead.
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('the catalogue', () {
    test('carries the product and base plan ids Play Console must match', () {
      expect(
        subscriptionProducts.map(
          (product) => [
            product.productId,
            product.plans.map((plan) => plan.basePlanId).toList(),
          ],
        ),
        [
          [
            'indigen_plus',
            ['plus-monthly', 'plus-yearly'],
          ],
          [
            'indigen_patron',
            ['patron-monthly', 'patron-yearly'],
          ],
          [
            'indigen_creator',
            ['creator-monthly', 'creator-yearly'],
          ],
        ],
      );
    });

    test('mirrors the backend benefit table exactly', () {
      expect(
        tierBenefits.map(
          (tier, benefits) => MapEntry(tier, [
            benefits.adFree,
            benefits.kawuriDailyMessages,
            benefits.offlineDownloadLimit,
            benefits.supporterMark.wire,
            benefits.creatorTools,
          ]),
        ),
        {
          SubscriptionTier.none: [false, 20, 0, '', false],
          SubscriptionTier.plus: [true, 200, 50, 'supporter', false],
          SubscriptionTier.patron: [true, 400, 200, 'patron', false],
          SubscriptionTier.creator: [true, 600, 500, 'studio', true],
        },
      );
    });

    test('every tier is ranked so an upgrade can be told from a downgrade', () {
      expect(
        SubscriptionTier.creator.rank,
        greaterThan(SubscriptionTier.patron.rank),
      );
      expect(
        SubscriptionTier.patron.rank,
        greaterThan(SubscriptionTier.plus.rank),
      );
      expect(
        SubscriptionTier.plus.rank,
        greaterThan(SubscriptionTier.none.rank),
      );
    });

    test('no supporter mark can be mistaken for a verification mark', () {
      // `creator` is a checked mark meaning "has published work". A tier that
      // granted the same string would put a price on a verification.
      const verifiedKinds = {'creator', 'elder', 'project', 'member'};
      for (final benefits in tierBenefits.values) {
        expect(verifiedKinds.contains(benefits.supporterMark.wire), isFalse);
      }
    });

    test('an unknown product id from a newer build grants nothing', () {
      expect(tierForProductId('indigen_something_new'), SubscriptionTier.none);
      expect(productForId('indigen_something_new'), isNull);
    });

    test('the benefit lines name what the tier actually includes', () {
      final lines = benefitLinesFor(SubscriptionTier.patron);
      expect(lines, contains('No adverts anywhere in the app'));
      expect(lines, contains('Up to 400 Kawuri questions a day'));
      expect(lines, contains('Keep 200 songs and chapters offline'));
      expect(lines.any((line) => line.contains('patron')), isTrue);
      // Creator tooling belongs to the creator tier alone.
      expect(lines.any((line) => line.contains('TribeStudio')), isFalse);
      expect(
        benefitLinesFor(SubscriptionTier.creator)
            .any((line) => line.contains('TribeStudio')),
        isTrue,
      );
    });

    test('the free tier still has a Kawuri allowance, and no more', () {
      final lines = benefitLinesFor(SubscriptionTier.none);
      expect(lines, ['Up to 20 Kawuri questions a day']);
    });
  });

  group('what an entitlement is worth', () {
    test('an active subscription with a future expiry carries its tier', () {
      final entitlement = _entitlement();
      expect(entitlement.isActiveAt(_now), isTrue);
      expect(entitlement.benefits.adFree, isTrue);
      expect(entitlement.benefits.offlineDownloadLimit, 50);
    });

    test('an active status with a past expiry is worth nothing', () {
      // The missed-notification case: believing the word over the date is how
      // a free year happens.
      final stale = _entitlement(expiresAt: _past);
      expect(stale.status, EntitlementStatus.active);
      expect(stale.isActiveAt(_now), isFalse);
      expect(stale.benefits.adFree, isFalse);
      expect(stale.benefits.kawuriDailyMessages, 20);
    });

    test('grace keeps the benefits and on hold does not', () {
      expect(
        _entitlement(status: EntitlementStatus.grace).isActiveAt(_now),
        isTrue,
      );
      expect(
        _entitlement(status: EntitlementStatus.onHold).isActiveAt(_now),
        isFalse,
      );
    });

    test('a cancelled subscription is owed until the day it expires', () {
      final cancelled = _entitlement(status: EntitlementStatus.canceled);
      expect(cancelled.isActiveAt(_now), isTrue);
      expect(
        cancelled.isActiveAt(_future.add(const Duration(seconds: 1))),
        isFalse,
      );
    });

    test('a pending mobile-money purchase grants nothing yet', () {
      expect(
        _entitlement(status: EntitlementStatus.pending).isActiveAt(_now),
        isFalse,
      );
    });

    test('an entitlement with no expiry at all is worth nothing', () {
      const open = Entitlement(
        tier: SubscriptionTier.patron,
        status: EntitlementStatus.active,
      );
      expect(open.isActiveAt(_now), isFalse);
    });

    test('grace and on hold are the two states worth nudging about', () {
      expect(
        _entitlement(status: EntitlementStatus.grace).needsAttention,
        isTrue,
      );
      expect(
        _entitlement(status: EntitlementStatus.onHold).needsAttention,
        isTrue,
      );
      expect(_entitlement().needsAttention, isFalse);
      expect(Entitlement.none.needsAttention, isFalse);
    });

    test('a document from the backend is read field for field', () {
      final entitlement = Entitlement.fromMap(const {
        'tier': 'creator',
        'status': 'grace',
        'productId': 'indigen_creator',
        'basePlanId': 'creator-yearly',
        'offerId': 'launch',
        'autoRenewing': true,
        'startedAt': '2026-02-01T00:00:00.000Z',
        'expiresAt': '2027-02-01T00:00:00.000Z',
        'testPurchase': true,
        'regionCode': 'GH',
      });
      expect(entitlement.tier, SubscriptionTier.creator);
      expect(entitlement.status, EntitlementStatus.grace);
      expect(entitlement.plan?.billingPeriod, BillingPeriod.yearly);
      expect(entitlement.testPurchase, isTrue);
      expect(entitlement.expiresAt, DateTime.utc(2027, 2));
    });

    test('an unrecognised tier or status from a newer backend is none', () {
      final entitlement = Entitlement.fromMap(const {
        'tier': 'benefactor',
        'status': 'SOMETHING_NEW',
        'expiresAt': '2027-02-01T00:00:00.000Z',
      });
      expect(entitlement.tier, SubscriptionTier.none);
      expect(entitlement.status, EntitlementStatus.none);
      expect(entitlement.isActiveAt(_now), isFalse);
    });

    test('an empty document is simply no subscription', () {
      expect(Entitlement.fromMap(null).tier, SubscriptionTier.none);
      expect(Entitlement.none.benefits.kawuriDailyMessages, 20);
    });
  });

  group('adverts', () {
    test('a free member still sees every placement', () async {
      final container = _container(
        entitlement: Entitlement.none,
        ads: [_ad('one'), _ad('two')],
      );
      await _settle(container);

      for (final placement in AdPlacement.values) {
        expect(
          container.read(placedAdsProvider(placement)),
          isNotEmpty,
          reason: '$placement should still carry adverts',
        );
      }
      expect(container.read(adsAllowedProvider), isTrue);
    });

    test('a subscriber sees none of them, on any surface', () async {
      // The single gate. If a fourth surface starts showing adverts it
      // inherits this for free — which is the reason the check lives in
      // `placedAdsProvider` rather than at three call sites.
      final container = _container(
        entitlement: _entitlement(),
        ads: [_ad('one'), _ad('two')],
      );
      await _settle(container);

      for (final placement in AdPlacement.values) {
        expect(
          container.read(placedAdsProvider(placement)),
          isEmpty,
          reason: '$placement must be advert-free for a subscriber',
        );
      }
      expect(container.read(adsAllowedProvider), isFalse);
    });

    test('a lapsed subscription puts the adverts back', () async {
      final container = _container(
        entitlement: _entitlement(expiresAt: _past),
        ads: [_ad('one')],
      );
      await _settle(container);
      expect(
        container.read(placedAdsProvider(AdPlacement.explore)),
        isNotEmpty,
      );
    });
  });

  group('the supporter mark', () {
    test('follows the tier in force', () async {
      final container = _container(entitlement: _entitlement());
      await _settle(container);
      expect(container.read(supporterMarkProvider), SupporterMark.supporter);
    });

    test('is gone the moment the subscription is', () async {
      final container = _container(entitlement: _entitlement(expiresAt: _past));
      await _settle(container);
      expect(container.read(supporterMarkProvider), SupporterMark.none);
    });

    test('reads off a public profile without a subscription lookup', () {
      final profile = CommunityProfile.fromMap('uid-1', const {
        'username': 'awiah',
        'displayName': 'Awiah',
        'supporterMark': 'patron',
      });
      expect(profile.supporterMark, SupporterMark.patron);
      // The two marks stay independent: a paid mark grants no verification.
      expect(profile.mark, VerifiedMark.none);
    });

    test('a profile a member creates carries no mark of either kind', () {
      const profile = CommunityProfile(
        uid: 'uid-1',
        username: 'awiah',
        displayName: 'Awiah',
      );
      final created = profile.toCreateMap();
      expect(created['supporterMark'], '');
      expect(created['verifiedKind'], '');
    });

    test('an author stamp carries the mark the Security Rules will check', () {
      const profile = CommunityProfile(
        uid: 'uid-1',
        username: 'awiah',
        displayName: 'Awiah',
        supporterMark: SupporterMark.studio,
      );
      expect(profile.toAuthorStamp()['supporterMark'], 'studio');
    });

    test('every mark explains itself in words, not only in colour', () {
      for (final mark in SupporterMark.values) {
        if (mark == SupporterMark.none) continue;
        expect(mark.label, isNotEmpty);
        expect(mark.meaning, isNotEmpty);
      }
    });
  });

  group('offline downloads', () {
    test(
      'the limit is zero without a subscription and the tier value with',
      () {
        expect(TierBenefits.free.offlineDownloadLimit, 0);
        expect(tierBenefits[SubscriptionTier.plus]!.offlineDownloadLimit, 50);
      },
    );

    test('benefits from the backend win over the shipped table', () {
      // The backend is the authority: a build that has not been updated must
      // take the numbers it is told rather than the ones it was compiled with.
      final benefits = TierBenefits.fromMap(const {
        'adFree': true,
        'kawuriDailyMessages': 999,
        'offlineDownloadLimit': 7,
        'supporterMark': 'patron',
        'creatorTools': false,
      });
      expect(benefits.kawuriDailyMessages, 999);
      expect(benefits.offlineDownloadLimit, 7);
      expect(benefits.supporterMark, SupporterMark.patron);
    });

    test(
      'an unreadable benefits payload falls back to free, never to more',
      () {
        final benefits = TierBenefits.fromMap(null);
        expect(benefits.adFree, isFalse);
        expect(benefits.offlineDownloadLimit, 0);
        expect(benefits.kawuriDailyMessages, 20);
      },
    );
  });

  group('where the benefit numbers come from', () {
    test('the backend overrules the table this build shipped with', () async {
      // The point of asking at all: a benefit can be changed in a functions
      // deploy rather than an app rollout, which matters most for the members
      // least likely to take an update.
      final container = _container(
        entitlement: _entitlement(),
        serverBenefits: const TierBenefits(
          adFree: true,
          kawuriDailyMessages: 500,
          offlineDownloadLimit: 120,
          supporterMark: SupporterMark.patron,
          creatorTools: false,
        ),
      );
      await _settle(container);

      final benefits = container.read(tierBenefitsProvider);
      expect(benefits.kawuriDailyMessages, 500);
      expect(benefits.offlineDownloadLimit, 120);
      expect(container.read(supporterMarkProvider), SupporterMark.patron);
    });

    test(
      'no answer from the backend falls back to the shipped table',
      () async {
        // Offline, still loading, or a failed call. A subscriber must keep what
        // they paid for when the network is gone.
        final container = _container(entitlement: _entitlement());
        await _settle(container);

        expect(container.read(tierBenefitsProvider).kawuriDailyMessages, 200);
        expect(container.read(adsAllowedProvider), isFalse);
      },
    );

    test('the backend can also take benefits away', () async {
      // The other direction has to work too: it is the authority, so a member
      // whose local entitlement is stale gets the free row when it says so.
      final container = _container(
        entitlement: _entitlement(),
        serverBenefits: TierBenefits.free,
        ads: [_ad('one')],
      );
      await _settle(container);

      expect(container.read(adsAllowedProvider), isTrue);
      expect(
        container.read(placedAdsProvider(AdPlacement.explore)),
        isNotEmpty,
      );
      expect(container.read(supporterMarkProvider), SupporterMark.none);
    });
  });


  group('starting the billing connection', () {
    // The bug this group exists for: the paywall asked for the offers while
    // the availability check kicked off a microsecond earlier was still in
    // flight, read the `false` it had not yet replaced, and told every single
    // member that Google Play was missing from their phone.
    setUpAll(TestWidgetsFlutterBinding.ensureInitialized);

    test('a second caller waits for the first start instead of racing it', () async {
      final plugin = _FakePlugin();
      final service = BillingService((_) async => true, plugin: plugin);
      addTearDown(service.dispose);

      // Exactly what the provider does: start it and let it run, then have the
      // paywall ask for the offers.
      unawaited(service.start());
      await service.start();
      final offerings = await service.loadOffers();

      // Play was reachable, so whatever else is wrong, it is not this.
      expect(
        offerings.reason,
        isNot(SubscriptionUnavailableReason.billingUnavailable),
      );
      expect(offerings.reason, SubscriptionUnavailableReason.playReturnedNothing);
      expect(plugin.availabilityChecks, 1);
    });

    test('a no is asked again, so a retry can succeed', () async {
      // Signed out of the Play Store, then signed in. The first answer must not
      // be the answer for the rest of the launch — that is what the paywall's
      // "Try again" leans on.
      final plugin = _FakePlugin(availability: const [false, true]);
      final service = BillingService((_) async => true, plugin: plugin);
      addTearDown(service.dispose);

      final first = await service.loadOffers();
      expect(first.reason, SubscriptionUnavailableReason.billingUnavailable);

      final second = await service.loadOffers();
      expect(
        second.reason,
        SubscriptionUnavailableReason.playReturnedNothing,
      );
      expect(plugin.availabilityChecks, 2);
    });

    test('a yes is not asked again', () async {
      final plugin = _FakePlugin();
      final service = BillingService((_) async => true, plugin: plugin);
      addTearDown(service.dispose);

      await service.loadOffers();
      await service.loadOffers();
      expect(plugin.availabilityChecks, 1);
    });
  });

  group('why a paywall is empty', () {
    // The whole point of the diagnosis: "no plans" has five unrelated causes
    // and they used to be indistinguishable from the outside. Each branch must
    // name its own, because the fix for each is completely different.
    tearDown(() => debugDefaultTargetPlatformOverride = null);

    test('a non-Android build says so rather than blaming Play', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final offerings = await container.read(subscriptionOffersProvider.future);
      expect(offerings.reason, SubscriptionUnavailableReason.notAndroid);
      expect(offerings.isEmpty, isTrue);
    });

    test('a build with no backend refuses rather than half-opening', () async {
      // Firebase is down, so a purchase could not be verified even if Play
      // took the money. The paywall stays shut and says which it is.
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      final container = ProviderContainer(
        overrides: [firebaseReadyProvider.overrideWithValue(false)],
      );
      addTearDown(container.dispose);

      final offerings = await container.read(subscriptionOffersProvider.future);
      expect(
        offerings.reason,
        SubscriptionUnavailableReason.backendUnavailable,
      );
    });

    test('the default carries no offers and no complaint', () {
      const offerings = SubscriptionOfferings();
      expect(offerings.isEmpty, isTrue);
      expect(offerings.reason, SubscriptionUnavailableReason.none);
      expect(offerings.playProductIds, isEmpty);
      expect(offerings.playBasePlanIds, isEmpty);
    });

    test('a mismatch carries what Play returned, to compare by eye', () {
      // The single most useful line in the failure: the ids Play actually has,
      // next to the ids this build expects.
      const offerings = SubscriptionOfferings(
        reason: SubscriptionUnavailableReason.basePlanMismatch,
        playProductIds: ['indigen_plus'],
        playBasePlanIds: ['monthly', 'yearly'],
      );
      expect(offerings.playBasePlanIds, ['monthly', 'yearly']);
      expect([
        for (final product in subscriptionProducts)
          for (final plan in product.plans) plan.basePlanId,
      ], isNot(containsAll(offerings.playBasePlanIds)));
    });
  });

  group('yearlySavingsPercent', () {
    // No discount is written down anywhere in the app, for the same reason no
    // price is: it is a property of two base plans in Play Console, it moves
    // with Play's own regional pricing, and it changes the day somebody edits
    // either plan. A "Save 20%" typed into the paywall is a claim the app is
    // not in a position to keep.
    SubscriptionOffer offer(BillingPeriod period, double rawPrice, {
      String currency = 'GHS',
    }) => SubscriptionOffer(
      product: subscriptionProducts.first,
      plan: SubscriptionPlan(basePlanId: 'plan', billingPeriod: period),
      details: ProductDetails(
        id: 'indigen_plus',
        title: 'Indigen Plus',
        description: '',
        price: '$rawPrice',
        rawPrice: rawPrice,
        currencyCode: currency,
      ),
      offerToken: 'token',
    );

    test('reads the discount off the two prices Play returned', () {
      // 100 a month is 1200 a year; 900 is a quarter off.
      expect(
        yearlySavingsPercent([
          offer(BillingPeriod.monthly, 100),
          offer(BillingPeriod.yearly, 900),
        ]),
        25,
      );
    });

    test('says nothing when there is nothing to compare against', () {
      expect(yearlySavingsPercent(const []), isNull);
      expect(
        yearlySavingsPercent([offer(BillingPeriod.yearly, 900)]),
        isNull,
      );
    });

    test('refuses a saving too small to be worth a badge', () {
      // A rounded "Save 1%" reads as a rounding error rather than an offer.
      expect(
        yearlySavingsPercent([
          offer(BillingPeriod.monthly, 100),
          offer(BillingPeriod.yearly, 1190),
        ]),
        isNull,
      );
    });

    test('refuses a yearly plan that is not actually cheaper', () {
      expect(
        yearlySavingsPercent([
          offer(BillingPeriod.monthly, 100),
          offer(BillingPeriod.yearly, 1400),
        ]),
        isNull,
      );
    });

    test('refuses to compare two different currencies', () {
      // Should not happen for one member, and is cheap to refuse. Subtracting
      // cedis from dollars is the kind of arithmetic that ships.
      expect(
        yearlySavingsPercent([
          offer(BillingPeriod.monthly, 100),
          offer(BillingPeriod.yearly, 900, currency: 'USD'),
        ]),
        isNull,
      );
    });

    test('refuses a price Play reported as zero', () {
      expect(
        yearlySavingsPercent([
          offer(BillingPeriod.monthly, 0),
          offer(BillingPeriod.yearly, 900),
        ]),
        isNull,
      );
    });
  });
}
