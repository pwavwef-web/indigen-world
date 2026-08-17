import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/indigen_world_app.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late AppDatabase database;

  setUp(() {
    database = AppDatabase.forTesting(NativeDatabase.memory());
  });

  tearDown(() => database.close());

  testWidgets('guest home renders and local search filters results', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'indigen_world_onboarding_complete_v1': true,
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: const IndigenWorldApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Kasem, close at hand.'), findsOneWidget);
    expect(find.text('AVAILABLE OFFLINE'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'water');
    await tester.pump();

    expect(find.text('Kasem word for water · demo'), findsOneWidget);
    expect(find.text('1 local match'), findsOneWidget);
  });
}
