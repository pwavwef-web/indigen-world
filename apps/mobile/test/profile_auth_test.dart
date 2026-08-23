import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/profile/profile_screen.dart';

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
        child: const MaterialApp(home: Scaffold(body: ProfileScreen())),
      ),
    );
    await tester.pumpAndSettle();

    // Firebase is unavailable in tests (firebaseReadyProvider defaults to
    // false), so the screen stays in guest mode.
    expect(find.text('Guest learner'), findsOneWidget);

    final signInButton = find.text('Sign in or create an account');
    await tester.scrollUntilVisible(signInButton, 200);
    await tester.pumpAndSettle();
    await tester.tap(signInButton);
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);

    final toggle = find.text('New here? Create an account');
    await tester.tap(toggle);
    await tester.pumpAndSettle();

    expect(find.text('Create your account'), findsOneWidget);
  });
}
