import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/features/ads/ad_consent.dart';
import 'package:indigen_world_mobile/features/ads/admob_config.dart';
import 'package:indigen_world_mobile/features/ads/admob_native.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';

class _Consent extends AdConsentController {
  _Consent(this.initial);

  final AdConsentState initial;

  @override
  AdConsentState build() => initial;

  @override
  Future<void> ensureReady() async {}

  void deny() {
    state = const AdConsentState(
      availability: AdConsentAvailability.cannotRequestAds,
    );
  }

  void allow() {
    state = const AdConsentState(
      availability: AdConsentAvailability.canRequestAds,
    );
  }
}

class _Initializer implements MobileAdsInitializer {
  _Initializer(this.answer);

  final bool answer;
  int calls = 0;

  @override
  Future<bool> ensureInitialized() async {
    calls++;
    return answer;
  }
}

class _Handle implements AdMobNativeHandle {
  _Handle({required this.onLoaded, required this.onFailed, this.fail = false});

  final VoidCallback onLoaded;
  final VoidCallback onFailed;
  final bool fail;
  int disposals = 0;

  @override
  Future<void> load() async {
    if (fail) {
      onFailed();
    } else {
      onLoaded();
    }
  }

  @override
  Widget get view => const SizedBox(key: Key('loaded-native-ad'));

  @override
  Future<void> dispose() async {
    disposals++;
  }
}

class _Factory implements AdMobNativeFactory {
  _Factory({this.fail = false});

  final bool fail;
  int creates = 0;
  _Handle? lastHandle;

  @override
  AdMobNativeHandle create({
    required String unitId,
    required bool compact,
    required VoidCallback onLoaded,
    required VoidCallback onFailed,
  }) {
    creates++;
    return lastHandle = _Handle(
      onLoaded: onLoaded,
      onFailed: onFailed,
      fail: fail,
    );
  }
}

class _Allowed extends Notifier<bool> {
  @override
  bool build() => true;

  void set(bool value) => state = value;
}

final _allowedProvider = NotifierProvider<_Allowed, bool>(_Allowed.new);

class _Eligibility extends Notifier<AdvertisingEligibility> {
  @override
  AdvertisingEligibility build() => AdvertisingEligibility.unresolved;

  void set(AdvertisingEligibility value) => state = value;
}

final _eligibilityProvider =
    NotifierProvider<_Eligibility, AdvertisingEligibility>(_Eligibility.new);

/// Counts what the consent flow actually asked UMP to do. The three calls are
/// kept apart because the whole point of the privacy-options path is that it
/// makes one of them and not the other two.
class _Gateway implements AdConsentGateway {
  _Gateway({this.optionsRequired = true});

  final bool optionsRequired;
  int gathers = 0;
  int probes = 0;
  int formsShown = 0;

  @override
  Future<AdConsentState> gather() async {
    gathers++;
    return const AdConsentState(
      availability: AdConsentAvailability.canRequestAds,
      privacyOptionsRequired: true,
    );
  }

  @override
  Future<AdConsentState> showPrivacyOptions() async {
    formsShown++;
    return const AdConsentState(
      availability: AdConsentAvailability.cannotRequestAds,
      privacyOptionsRequired: true,
    );
  }

  @override
  Future<bool> privacyOptionsRequired() async {
    probes++;
    return optionsRequired;
  }
}

ServedAd _firstParty() => const ServedAd(
  campaignId: 'campaign',
  headline: 'Community campaign',
  body: 'Body',
  creativeUrl: '',
  mediaType: 'image',
  placements: [AdPlacement.community],
);

void main() {
  test('debug and staging use only Google test identifiers', () {
    final config = AdMobConfig.fromEnvironment(
      environment: AppEnvironment.staging,
      releaseMode: false,
      productionAndroidAppId: 'invalid-production-value',
      communityNativeId: 'invalid-production-value',
    );

    expect(config.testMode, isTrue);
    expect(config.androidAppId, GoogleMobileAdsTestIds.androidApp);
    for (final placement in AdPlacement.values) {
      expect(config.nativeUnitIdFor(placement), GoogleMobileAdsTestIds.native);
    }
  });

  test('production configuration rejects missing or malformed values', () {
    final config = AdMobConfig.fromEnvironment(
      environment: AppEnvironment.production,
      releaseMode: true,
    );

    expect(config.testMode, isFalse);
    expect(config.productionValidationIssues, hasLength(4));
    for (final placement in AdPlacement.values) {
      expect(config.nativeUnitIdFor(placement), isNull);
    }

    final testAppInProduction = AdMobConfig.fromEnvironment(
      environment: AppEnvironment.production,
      releaseMode: true,
      productionAndroidAppId: GoogleMobileAdsTestIds.androidApp,
    );
    expect(testAppInProduction.hasValidAppId, isFalse);
  });

  test('unified cadence prefers first party and otherwise maps to AdMob', () {
    final firstParty = AdPlacementInventory(
      placement: AdPlacement.community,
      allowed: true,
      firstParty: [_firstParty()],
    );
    final fallback = const AdPlacementInventory(
      placement: AdPlacement.community,
      allowed: true,
    );

    expect(firstParty.slot(0).source, AdInventorySource.firstParty);
    expect(fallback.slot(0).source, AdInventorySource.adMob);

    final blocked = spliceAdSlots<Object>(
      rows: List<Object>.generate(20, (index) => index),
      inventory: const AdPlacementInventory(
        placement: AdPlacement.community,
        allowed: false,
      ),
      cadence: 10,
      render: (slot) => slot,
    );
    expect(blocked.whereType<AdSlot>(), isEmpty);

    final short = spliceAdSlots<Object>(
      rows: const <Object>[1, 2, 3, 4],
      inventory: fallback,
      cadence: 5,
      render: (slot) => slot,
    );
    expect(short.whereType<AdSlot>(), isEmpty);

    final unresolved = spliceAdSlots<Object>(
      rows: List<Object>.generate(10, (index) => index),
      inventory: const AdPlacementInventory(
        placement: AdPlacement.community,
        allowed: true,
        resolved: false,
      ),
      cadence: 10,
      render: (slot) => slot,
    );
    expect(unresolved.whereType<AdSlot>(), isEmpty);

    final notConsented = spliceAdSlots<Object>(
      rows: List<Object>.generate(10, (index) => index),
      inventory: const AdPlacementInventory(
        placement: AdPlacement.community,
        allowed: true,
        adMobEligible: false,
      ),
      cadence: 10,
      render: (slot) => slot,
    );
    expect(notConsented.whereType<AdSlot>(), isEmpty);

    final rows = spliceAdSlots<Object>(
      rows: List<Object>.generate(21, (index) => index),
      inventory: fallback,
      cadence: 10,
      render: (slot) => slot,
    );
    final slots = rows.whereType<AdSlot>().toList();
    expect(slots, hasLength(2));
    expect(rows[10], isA<AdSlot>());
    expect(rows[21], isA<AdSlot>());
    expect(
      rows.indexed.any(
        (entry) =>
            entry.$1 > 0 && entry.$2 is AdSlot && rows[entry.$1 - 1] is AdSlot,
      ),
      isFalse,
    );
  });

  group('privacy options for a member who never sees an advert', () {
    Future<ProviderContainer> pumpBootstrap(
      WidgetTester tester, {
      required _Gateway gateway,
    }) async {
      final container = ProviderContainer(
        overrides: [
          advertisingEligibilityProvider.overrideWith(
            (ref) => ref.watch(_eligibilityProvider),
          ),
          adConsentGatewayProvider.overrideWithValue(gateway),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: AdConsentBootstrap(child: SizedBox.shrink()),
          ),
        ),
      );
      await tester.pump();
      return container;
    }

    testWidgets('an unresolved launch asks UMP nothing at all', (tester) async {
      final gateway = _Gateway();
      await pumpBootstrap(tester, gateway: gateway);

      expect(
        gateway.probes,
        0,
        reason: 'the ordinary first moments of a launch',
      );
      expect(gateway.gathers, 0);
    });

    testWidgets('a paid member gets the entry point without a form', (
      tester,
    ) async {
      final gateway = _Gateway();
      final container = await pumpBootstrap(tester, gateway: gateway);

      container
          .read(_eligibilityProvider.notifier)
          .set(AdvertisingEligibility.blocked);
      await tester.pump();
      await tester.pump();

      expect(gateway.probes, 1);
      expect(
        gateway.gathers,
        0,
        reason: 'no consent form for an ad-free member',
      );
      expect(gateway.formsShown, 0);
      expect(container.read(adConsentProvider).privacyOptionsRequired, isTrue);
      expect(container.read(adsAllowedProvider), isFalse);
    });

    testWidgets('the probe never makes consent look gathered', (tester) async {
      final gateway = _Gateway();
      final container = await pumpBootstrap(tester, gateway: gateway);
      final notifier = container.read(_eligibilityProvider.notifier);

      notifier.set(AdvertisingEligibility.blocked);
      await tester.pump();
      await tester.pump();

      // The bug this guards: a resolved availability here would let a member
      // who returns to the free tier be served adverts without ever having
      // been shown the consent form.
      expect(
        container.read(adConsentProvider).availability,
        AdConsentAvailability.unresolved,
      );

      notifier.set(AdvertisingEligibility.allowed);
      await tester.pump();
      await tester.pump();

      expect(gateway.gathers, 1, reason: 'the full flow still runs afterwards');
      expect(
        container.read(adConsentProvider).availability,
        AdConsentAvailability.canRequestAds,
      );
    });

    testWidgets('UMP saying no entry point is needed leaves Settings bare', (
      tester,
    ) async {
      final gateway = _Gateway(optionsRequired: false);
      final container = await pumpBootstrap(tester, gateway: gateway);

      container
          .read(_eligibilityProvider.notifier)
          .set(AdvertisingEligibility.blocked);
      await tester.pump();
      await tester.pump();

      expect(gateway.probes, 1);
      expect(container.read(adConsentProvider).privacyOptionsRequired, isFalse);
    });

    testWidgets('an eligible member still takes the full consent path', (
      tester,
    ) async {
      final gateway = _Gateway();
      final container = await pumpBootstrap(tester, gateway: gateway);

      container
          .read(_eligibilityProvider.notifier)
          .set(AdvertisingEligibility.allowed);
      await tester.pump();
      await tester.pump();

      expect(gateway.gathers, 1);
      expect(gateway.probes, 0);
      expect(
        container.read(adConsentProvider).availability,
        AdConsentAvailability.canRequestAds,
      );
    });
  });

  group('native slot lifecycle', () {
    Future<ProviderContainer> pumpSlot(
      WidgetTester tester, {
      required _Factory factory,
      AdConsentState consent = const AdConsentState(
        availability: AdConsentAvailability.canRequestAds,
      ),
      bool initializerAnswer = true,
      Widget? child,
    }) async {
      final container = ProviderContainer(
        overrides: [
          adsAllowedProvider.overrideWith((ref) => ref.watch(_allowedProvider)),
          adConsentProvider.overrideWith(() => _Consent(consent)),
          adMobConfigProvider.overrideWithValue(
            AdMobConfig.fromEnvironment(
              environment: AppEnvironment.development,
              releaseMode: false,
            ),
          ),
          mobileAdsInitializerProvider.overrideWithValue(
            _Initializer(initializerAnswer),
          ),
          adMobNativeFactoryProvider.overrideWithValue(factory),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body:
                  child ??
                  const Column(
                    children: [
                      AdMobNativeSlot(placement: AdPlacement.community),
                    ],
                  ),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      return container;
    }

    testWidgets('first-party inventory prevents an AdMob request', (
      tester,
    ) async {
      final factory = _Factory();
      await pumpSlot(
        tester,
        factory: factory,
        child: UnifiedAdSlot(
          slot: AdSlot(
            placement: AdPlacement.community,
            index: 0,
            firstParty: _firstParty(),
          ),
          firstPartyBuilder: (context, ad) => Text(ad.headline),
        ),
      );

      expect(find.text('Community campaign'), findsOneWidget);
      expect(factory.creates, 0);
    });

    testWidgets('no fill collapses without leaving an ad container', (
      tester,
    ) async {
      final factory = _Factory(fail: true);
      await pumpSlot(tester, factory: factory);

      expect(factory.creates, 1);
      expect(find.byKey(const Key('loaded-native-ad')), findsNothing);
      expect(tester.getSize(find.byType(AdMobNativeSlot)), Size.zero);
    });

    testWidgets('consent denial makes no SDK or inventory request', (
      tester,
    ) async {
      final factory = _Factory();
      final initializer = _Initializer(true);
      final container = ProviderContainer(
        overrides: [
          adsAllowedProvider.overrideWithValue(true),
          adConsentProvider.overrideWith(
            () => _Consent(
              const AdConsentState(
                availability: AdConsentAvailability.cannotRequestAds,
              ),
            ),
          ),
          adMobConfigProvider.overrideWithValue(
            AdMobConfig.fromEnvironment(
              environment: AppEnvironment.development,
              releaseMode: false,
            ),
          ),
          mobileAdsInitializerProvider.overrideWithValue(initializer),
          adMobNativeFactoryProvider.overrideWithValue(factory),
        ],
      );
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: AdMobNativeSlot(placement: AdPlacement.community),
          ),
        ),
      );
      await tester.pump();

      expect(initializer.calls, 0);
      expect(factory.creates, 0);
    });

    testWidgets('becoming ad-free disposes loaded inventory immediately', (
      tester,
    ) async {
      final factory = _Factory();
      final container = await pumpSlot(tester, factory: factory);
      expect(find.byKey(const Key('loaded-native-ad')), findsOneWidget);

      container.read(_allowedProvider.notifier).set(false);
      await tester.pump();

      expect(find.byKey(const Key('loaded-native-ad')), findsNothing);
      expect(factory.lastHandle?.disposals, 1);
    });

    testWidgets('revoking consent disposes loaded inventory', (tester) async {
      final factory = _Factory();
      final container = await pumpSlot(tester, factory: factory);
      expect(find.byKey(const Key('loaded-native-ad')), findsOneWidget);

      (container.read(adConsentProvider.notifier) as _Consent).deny();
      await tester.pump();

      expect(find.byKey(const Key('loaded-native-ad')), findsNothing);
      expect(factory.lastHandle?.disposals, 1);
    });

    testWidgets('a later consent grant can request fresh inventory', (
      tester,
    ) async {
      final factory = _Factory();
      final container = await pumpSlot(tester, factory: factory);
      final consent = container.read(adConsentProvider.notifier) as _Consent;

      consent.deny();
      await tester.pump();
      consent.allow();
      await tester.pump();
      await tester.pump();

      expect(factory.creates, 2);
      expect(find.byKey(const Key('loaded-native-ad')), findsOneWidget);
    });

    testWidgets('SDK startup failure leaves content usable and requests none', (
      tester,
    ) async {
      final factory = _Factory();
      var unavailable = 0;
      await pumpSlot(
        tester,
        factory: factory,
        initializerAnswer: false,
        child: Column(
          children: [
            const Text('Primary content'),
            AdMobNativeSlot(
              placement: AdPlacement.community,
              onUnavailable: () => unavailable++,
            ),
          ],
        ),
      );

      expect(find.text('Primary content'), findsOneWidget);
      expect(factory.creates, 0);
      expect(unavailable, 1);
    });
  });
}
