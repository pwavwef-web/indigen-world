import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/profile/profile_screen.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    database = AppDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  testWidgets('guest profile opens the sign-in sheet and toggles to register', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: const MaterialApp(home: ProfileScreen()),
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
  });

  testWidgets('profile has four polished, working destinations', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    final rail = tester.widget<FrostedNavBar>(find.byType(FrostedNavBar));
    expect(rail.items.map((item) => item.label).toList(), [
      'Overview',
      'Community',
      'Saved',
      'Settings',
    ]);
    expect(find.text('Everything worth returning to.'), findsNothing);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Community'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 320));
    expect(find.text('Be known. Stay connected.'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Saved'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 320));
    expect(find.text('Everything worth returning to.'), findsOneWidget);
    expect(find.text('Saved dictionary words'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Settings'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 320));
    expect(find.text('Private by design.'), findsOneWidget);
    expect(find.text('App settings'), findsOneWidget);
  });
}
