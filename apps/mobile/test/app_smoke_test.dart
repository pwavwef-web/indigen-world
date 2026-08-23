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

  testWidgets('guest explores, completes a lesson, and opens collection', (
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

    await tester.tap(find.text('Learn'));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('KASEM LEARNING PATH'), findsOneWidget);
    expect(find.text('Speak your first words.'), findsOneWidget);
    expect(find.text("TODAY'S QUEST"), findsOneWidget);

    await tester.tap(find.text('Complete 3 quick lessons'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Choose the greeting'), findsOneWidget);

    await tester.ensureVisible(find.text('De zaanem'));
    await tester.tap(find.text('De zaanem'));
    await tester.pump();
    await tester.ensureVisible(find.text('Check answer'));
    await tester.tap(find.text('Check answer'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.textContaining('Beautiful!'), findsOneWidget);

    await tester.ensureVisible(find.text('Collect 15 XP'));
    await tester.pump();
    await tester.tap(find.text('Collect 15 XP'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('15 XP'), findsOneWidget);

    await tester.tap(find.text('Collection'));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('THE KASENA COLLECTION'), findsOneWidget);
    expect(find.text('Kasena visual language'), findsOneWidget);

    await tester.tap(find.text('Places'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Paga Crocodile Pond'), findsOneWidget);

    await tester.tap(find.text('Songs'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Songs & sounds'), findsOneWidget);

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

    await tester.scrollUntilVisible(
      find.text('De zaanem. Ko gara.'),
      180,
      scrollable: find
          .descendant(
            of: find.byKey(const PageStorageKey('community-scroll')),
            matching: find.byType(Scrollable),
          )
          .first,
    );

    expect(find.text('You'), findsWidgets);
    expect(find.text('De zaanem. Ko gara.'), findsOneWidget);
    expect(
      tester
          .widget<TextField>(find.byKey(const Key('community-composer')))
          .controller
          ?.text,
      isEmpty,
    );

    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('You'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Guest learner'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
  });
}
