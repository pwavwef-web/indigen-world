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

  testWidgets('guest lands on reels, joins community, and can still learn', (
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
    await tester.pump(const Duration(milliseconds: 3300));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('For you'), findsOneWidget);
    expect(find.text('Every rhythm remembers.'), findsOneWidget);
    expect(find.text('Explore'), findsOneWidget);

    await tester.tap(find.text('Community'));
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.text('A room where Kasem never has to translate itself.'),
      findsOneWidget,
    );
    expect(find.text('KASEM-ONLY SPACE'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('community-composer')),
      'De zaanem. Ko gara.',
    );
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -320));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('I confirm this post is written in Kasem.'));
    await tester.tap(find.byKey(const Key('community-publish')));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('You'), findsWidgets);
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('community-composer')))
          .controller
          ?.text,
      isEmpty,
    );

    await tester.tap(find.text('Learn'));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Kasem, close at hand.'), findsOneWidget);
    expect(find.text('AVAILABLE OFFLINE'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'water');
    await tester.pump();

    expect(find.text('Kasem word for water · demo'), findsOneWidget);
    expect(find.text('1 local match'), findsOneWidget);
  });
}
