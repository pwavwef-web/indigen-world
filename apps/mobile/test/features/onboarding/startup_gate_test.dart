import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/indigen_world_app.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/onboarding/notifications_primer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the one permission prompt an install gets is spent.
void main() {
  late AppDatabase database;

  setUp(() => database = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => database.close());

  Future<void> launch(
    WidgetTester tester, {
    required bool firebaseReady,
  }) async {
    // Tall enough for the primer to lay out as it does on a phone, so its
    // buttons are reachable rather than clipped by the test surface.
    await tester.binding.setSurfaceSize(const Size(900, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDatabaseProvider.overrideWithValue(database),
          firebaseReadyProvider.overrideWithValue(firebaseReady),
        ],
        child: const IndigenWorldApp(),
      ),
    );
    // Past the launch animation the gate waits on.
    await tester.pump(const Duration(milliseconds: 3300));
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets(
    'a member who onboarded before the primer existed still meets it',
    (tester) async {
      // The upgrade path. Gating on the onboarding flag alone would mean every
      // existing install was never asked at all.
      SharedPreferences.setMockInitialValues({
        'indigen_world_onboarding_complete_v1': true,
      });

      await launch(tester, firebaseReady: true);

      expect(find.byType(NotificationsPrimer), findsOneWidget);
      expect(find.byType(AppShell), findsNothing);
    },
  );

  testWidgets('a launch with no Firebase does not spend the prompt', (
    tester,
  ) async {
    // Nothing could be done with a yes — no token can be minted and no topic
    // joined — so the ask is left for a launch that can honour it rather than
    // burned on one that cannot.
    SharedPreferences.setMockInitialValues({
      'indigen_world_onboarding_complete_v1': true,
    });

    await launch(tester, firebaseReady: false);

    expect(find.byType(NotificationsPrimer), findsNothing);
    expect(find.byType(AppShell), findsOneWidget);
    expect(await pushPrimerNeeded(), isTrue);
  });
}
