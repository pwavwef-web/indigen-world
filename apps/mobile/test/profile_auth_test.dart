import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/ads/ads_screen.dart';
import 'package:indigen_world_mobile/features/profile/profile_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    database = AppDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  Future<void> pumpSpace(
    WidgetTester tester, {
    ProfileTab initialTab = ProfileTab.you,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ProfileScreen(initialTab: initialTab),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Drift-backed streams (downloads, saved words) schedule a zero-delay
  /// cleanup when their listeners go; give it a frame after the screen does.
  Future<void> tearDownSpace(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  }

  testWidgets('guest profile opens the sign-in sheet and toggles to register', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: ProfileScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));

    // Firebase is unavailable in tests (firebaseReadyProvider defaults to
    // false), so the screen stays in guest mode.
    expect(find.text('Guest learner'), findsOneWidget);

    final signInButton = find.text('Sign in or create an account');
    await tester.scrollUntilVisible(signInButton, 200);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(signInButton);
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);

    final toggle = find.text('New here? Create an account');
    await tester.ensureVisible(toggle);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.tap(toggle);
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Create your account'), findsOneWidget);

    await tearDownSpace(tester);
  });

  testWidgets('My Space is You, Membership and Settings', (tester) async {
    await pumpSpace(tester);

    final rail = tester.widget<FrostedNavBar>(find.byType(FrostedNavBar));
    // Overview and Profile were one subject split in two, and Adverts held a
    // fifth of the bar for a tool few members use. Adverts is a row on You.
    expect(rail.items.map((item) => item.label).toList(), [
      'You',
      'Membership',
      'Settings',
    ]);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Membership'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 320));
    // The tab is the plans themselves, not a status card with a button in
    // front of them.
    expect(find.text('Support the archive'), findsOneWidget);
    expect(find.text('Patron'), findsOneWidget);
    expect(find.text('See the plans'), findsNothing);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Settings'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 320));
    expect(find.text('ACCOUNT'), findsOneWidget);
    // The community profile is edited on You, and only there.
    expect(find.text('Manage community profile'), findsNothing);
    expect(find.text('Community profile setup'), findsNothing);

    await tearDownSpace(tester);
  });

  testWidgets('You holds the library and the work, each said once', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpSpace(tester);

    for (final label in const [
      'Contributions',
      'Approved',
      'Points',
      'YOUR LIBRARY',
      'Saved words',
      'Saved posts',
      'Kept reels',
      'YOUR WORK',
      'Your adverts',
    ]) {
      expect(find.text(label), findsOneWidget, reason: 'missing $label');
    }
    // Nothing sent back, so no row for it — and no permanent submissions row
    // repeating the Contributions count above.
    expect(find.text('Sent back to you'), findsNothing);
    expect(find.text('Your submissions'), findsNothing);
    // What Overview used to pad itself out with.
    expect(find.text('NEXT BEST STEP'), findsNothing);
    expect(find.text('Go to your profile'), findsNothing);
    expect(find.textContaining('ready to sync'), findsNothing);
    // A guest is told they are a guest, not which Firebase project this is.
    expect(find.text('Browsing as a guest'), findsOneWidget);
    expect(find.textContaining('environment'), findsNothing);

    await tearDownSpace(tester);
  });

  testWidgets('Your adverts opens the adverts screen on its own', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpSpace(tester);

    await tester.tap(find.text('Your adverts'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(AdsScreen), findsOneWidget);
    expect(tester.widget<AdsScreen>(find.byType(AdsScreen)).standalone, isTrue);

    await tearDownSpace(tester);
  });

  testWidgets('another screen can open My Space on Settings', (tester) async {
    await pumpSpace(tester, initialTab: ProfileTab.settings);

    expect(find.text('ACCOUNT'), findsOneWidget);
    final rail = tester.widget<FrostedNavBar>(find.byType(FrostedNavBar));
    expect(rail.currentIndex, ProfileTab.settings.index);

    await tearDownSpace(tester);
  });
}
