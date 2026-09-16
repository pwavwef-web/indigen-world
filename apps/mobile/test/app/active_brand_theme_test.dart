// Which theme is actually painted.
//
// What these hold:
//   * the default is blue, and the two free themes need nobody's permission;
//   * a supporters' theme is drawn for an active Patron or Creator subscription
//     and for nobody else — not a guest, not Plus, not a lapsed subscription;
//   * a locked theme leaves the member's choice alone, so it comes back with
//     the subscription;
//   * until sign-in and the entitlement are known, the last remembered answer
//     stands, so a supporter's app is not repainted blue on every launch.

import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/active_brand_theme.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/brand_theme_choice.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeUser extends Fake implements User {
  @override
  String get uid => 'member-1';
}

Entitlement _subscription(SubscriptionTier tier, {bool lapsed = false}) =>
    Entitlement(
      tier: tier,
      status: EntitlementStatus.active,
      expiresAt: lapsed
          ? DateTime.now().subtract(const Duration(days: 3))
          : DateTime.now().add(const Duration(days: 30)),
    );

class _Chosen extends BrandThemeChoiceController {
  _Chosen(this._id);
  final String _id;
  @override
  String build() => _id;
}

class _Remembered extends LastKnownThemeUnlockController {
  _Remembered(this._unlocked);
  final bool _unlocked;
  @override
  bool build() => _unlocked;
}

ProviderContainer _container({
  String chosen = 'blue',
  bool remembered = false,
  Stream<User?>? auth,
  Stream<Entitlement>? entitlement,
}) {
  final container = ProviderContainer(
    overrides: <Override>[
      brandThemeChoiceProvider.overrideWith(() => _Chosen(chosen)),
      lastKnownPremiumThemesUnlockedProvider.overrideWith(
        () => _Remembered(remembered),
      ),
      authStateProvider.overrideWith(
        (ref) => auth ?? Stream<User?>.value(null),
      ),
      entitlementProvider.overrideWith(
        (ref) => entitlement ?? Stream.value(Entitlement.none),
      ),
      serverBenefitsProvider.overrideWith((ref) async => null),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

/// Subscribes, then turns the event loop until the stubbed streams land.
/// Reading `.future` in a bare container hangs; see subscriptions_test.dart.
Future<void> _settle(ProviderContainer container) async {
  container.listen(activeBrandThemeProvider, (_, _) {});
  for (var turn = 0; turn < 6; turn++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('a fresh install is blue', () async {
    final container = _container();
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
  });

  test('heritage green needs no membership', () async {
    final container = _container(chosen: 'green');
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.green);
  });

  test('a guest who picked a supporters theme is drawn in blue', () async {
    final container = _container(chosen: 'kente');
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
    // The choice itself is untouched.
    expect(container.read(brandThemeChoiceProvider), 'kente');
  });

  for (final tier in [SubscriptionTier.patron, SubscriptionTier.creator]) {
    test('an active ${tier.name} subscription unlocks the themes', () async {
      final container = _container(
        chosen: 'kente',
        auth: Stream.value(_FakeUser()),
        entitlement: Stream.value(_subscription(tier)),
      );
      await _settle(container);
      expect(container.read(premiumThemesUnlockedProvider), isTrue);
      expect(container.read(activeBrandThemeProvider), BrandThemes.kente);
    });
  }

  test('Plus does not unlock them', () async {
    final container = _container(
      chosen: 'aurora',
      auth: Stream.value(_FakeUser()),
      entitlement: Stream.value(_subscription(SubscriptionTier.plus)),
    );
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
  });

  test('a lapsed Patron subscription puts the app back in blue', () async {
    final container = _container(
      chosen: 'tiebele',
      remembered: true,
      auth: Stream.value(_FakeUser()),
      entitlement: Stream.value(
        _subscription(SubscriptionTier.patron, lapsed: true),
      ),
    );
    await _settle(container);
    expect(container.read(premiumThemesUnlockedProvider), isFalse);
    expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
    expect(container.read(brandThemeChoiceProvider), 'tiebele');
  });

  test('before sign-in is restored the remembered answer stands', () async {
    final auth = StreamController<User?>();
    addTearDown(auth.close);
    final container = _container(
      chosen: 'harmattan',
      remembered: true,
      auth: auth.stream,
    );
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.harmattan);
  });

  test(
    'while a member\'s entitlement loads, the remembered answer stands',
    () async {
      final entitlement = StreamController<Entitlement>();
      addTearDown(entitlement.close);
      final container = _container(
        chosen: 'harmattan',
        remembered: true,
        auth: Stream.value(_FakeUser()),
        entitlement: entitlement.stream,
      );
      await _settle(container);
      expect(container.read(activeBrandThemeProvider), BrandThemes.harmattan);

      // And once it arrives without a subscription, it decides.
      entitlement.add(Entitlement.none);
      await _settle(container);
      expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
    },
  );

  test('the backend benefit alone is enough to unlock', () async {
    final container = ProviderContainer(
      overrides: <Override>[
        brandThemeChoiceProvider.overrideWith(() => _Chosen('kente')),
        authStateProvider.overrideWith((ref) => Stream<User?>.value(null)),
        entitlementProvider.overrideWith(
          (ref) => Stream.value(Entitlement.none),
        ),
        tierBenefitsProvider.overrideWithValue(
          tierBenefits[SubscriptionTier.patron]!,
        ),
      ],
    );
    addTearDown(container.dispose);
    await _settle(container);
    expect(container.read(activeBrandThemeProvider), BrandThemes.kente);
  });

  testWidgets('choosing a theme is remembered on the phone', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await container
        .read(brandThemeChoiceProvider.notifier)
        .choose(BrandThemes.green);

    final stored = await readStoredBrandTheme();
    expect(stored.themeId, 'green');
  });

  test('an unknown stored id reads back as blue', () async {
    SharedPreferences.setMockInitialValues({
      brandThemePreferenceKey: 'retired-theme',
      premiumThemesUnlockedPreferenceKey: true,
    });
    final stored = await readStoredBrandTheme();
    expect(stored.themeId, 'blue');
    expect(stored.premiumUnlocked, isTrue);
  });

  testWidgets('night surfaces follow the theme they are opened from', (
    tester,
  ) async {
    late BrandPalette inside;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildBrandTheme(BrandThemes.green, Brightness.light),
        home: NightTheme(
          child: Builder(
            builder: (context) {
              inside = context.brand;
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
    expect(inside, BrandThemes.green.dark);
  });
}
