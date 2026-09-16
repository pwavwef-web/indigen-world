// The theme picker.
//
// Every theme is shown to everybody. The free ones switch on a tap; the
// supporters' ones open a preview that points at memberships instead, and
// leave the app's theme exactly as it was.

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/active_brand_theme.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/brand_theme_choice.dart';
import 'package:indigen_world_mobile/core/brand_themes.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/settings/theme_picker_screen.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/entitlement.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeUser extends Fake implements User {
  @override
  String get uid => 'member-1';
}

Future<ProviderContainer> _pump(
  WidgetTester tester, {
  Entitlement entitlement = Entitlement.none,
}) async {
  tester.view.physicalSize = const Size(412, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final signedIn = entitlement != Entitlement.none;
  final container = ProviderContainer(
    overrides: <Override>[
      authStateProvider.overrideWith(
        (ref) => Stream<User?>.value(signedIn ? _FakeUser() : null),
      ),
      entitlementProvider.overrideWith((ref) => Stream.value(entitlement)),
      serverBenefitsProvider.overrideWith((ref) async => null),
    ],
  );
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: Consumer(
        builder: (context, ref, _) {
          final theme = ref.watch(activeBrandThemeProvider);
          return MaterialApp(
            theme: buildBrandTheme(theme, Brightness.light),
            home: const ThemePickerScreen(),
          );
        },
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  return container;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('every theme is on the screen', (tester) async {
    await _pump(tester);
    for (final theme in BrandThemes.all) {
      expect(find.byKey(Key('theme-tile-${theme.id}')), findsOneWidget);
    }
    expect(find.text('See memberships'), findsOneWidget);
  });

  testWidgets('a free theme switches on a tap', (tester) async {
    final container = await _pump(tester);
    await tester.tap(find.byKey(const Key('theme-tile-green')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(container.read(brandThemeChoiceProvider), 'green');
    expect(container.read(activeBrandThemeProvider), BrandThemes.green);
  });

  testWidgets('a locked theme previews and changes nothing', (tester) async {
    final container = await _pump(tester);
    await tester.tap(find.byKey(const Key('theme-tile-kente')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.text('This theme comes with Indigen Patron and Indigen Creator.'),
      findsOneWidget,
    );
    expect(container.read(brandThemeChoiceProvider), 'blue');

    await tester.tap(find.text('Not now'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(container.read(activeBrandThemeProvider), BrandThemes.blue);
  });

  testWidgets('a Patron picks a supporters theme directly', (tester) async {
    final container = await _pump(
      tester,
      entitlement: Entitlement(
        tier: SubscriptionTier.patron,
        status: EntitlementStatus.active,
        expiresAt: DateTime.now().add(const Duration(days: 30)),
      ),
    );
    // No invitation to subscribe for somebody who already does.
    expect(find.text('See memberships'), findsNothing);

    await tester.tap(find.byKey(const Key('theme-tile-aurora')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(container.read(activeBrandThemeProvider), BrandThemes.aurora);
  });
}
