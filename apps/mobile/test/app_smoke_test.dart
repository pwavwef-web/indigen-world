import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/indigen_world_app.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';
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

    expect(find.text('New voices'), findsOneWidget);
    expect(find.text('Make a Kasem post'), findsOneWidget);

    // Community is the centre destination — the app opens on it, and it is the
    // third of the five slots.
    final railLabels = tester
        .widget<FrostedNavBar>(find.byType(FrostedNavBar))
        .items
        .map((item) => item.label)
        .toList();
    expect(railLabels, [
      'Explore',
      'Learn',
      'Community',
      'Collection',
      'Contribute',
    ]);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Explore'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Every rhythm remembers.'), findsOneWidget);
    // The LIVE/PREVIEW pill went with the wordmark: over a full-bleed reel,
    // chrome has to earn its place, and a badge saying which data source is
    // behind the feed was answering a question no viewer was asking.
    expect(find.text('PREVIEW'), findsNothing);
    expect(find.text('LIVE'), findsNothing);
    // The wordmark gave up its space to the two things a viewer wants there:
    // which feed they are on, and a way to search.
    expect(find.text('INDIGEN WORLD'), findsNothing);
    expect(find.bySemanticsLabel('Search Explore'), findsOneWidget);
    // Explore is full-bleed: the shell rail disappears until native back
    // returns to the exact tab the member came from.
    expect(find.byType(FrostedNavBar), findsNothing);
    // Context, not a share button that cannot share anything yet.
    expect(find.text('Context'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('New voices'), findsOneWidget);
    expect(find.byType(FrostedNavBar), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Learn'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    // Learn opens on the trail itself: a strip of numbers pinned to the top,
    // and the first unit's banner stuck under it. The quest and the momentum
    // summary live in that strip rather than in a lid the first lesson has to
    // be scrolled past.
    expect(find.text('UNIT 1'), findsOneWidget);
    expect(find.text('0/3'), findsOneWidget);

    await tester.tap(find.text('0/3'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Complete 3 quick lessons'), findsOneWidget);
    expect(find.text('0 of 3 done'), findsOneWidget);

    await tester.tap(find.text('Continue the quest'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('LESSON 1 OF 4'), findsOneWidget);
    expect(find.byKey(const Key('lesson-primary-action')), findsOneWidget);
    expect(find.byType(BottomSheet), findsNothing);
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
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    // A finished lesson gets a screen of its own rather than a snackbar
    // sliding out of the bottom of a scrolling path.
    expect(find.text('Perfect lesson!'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lesson-complete-continue')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    // And the XP it paid is on the strip at the top, where it stays.
    expect(find.text('15'), findsWidgets);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Collection'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    // The tab's name, and no slogan under it. It used to be the eyebrow over
    // "Knowledge, kept alive." and so arrived here upper-cased; it is the
    // heading itself now, in the case somebody actually wrote it in.
    expect(find.text('The Kassena Collection'), findsOneWidget);
    expect(find.text('Music'), findsOneWidget);
    expect(find.text('Dictionary'), findsOneWidget);
    final collectionScroll = find.descendant(
      of: find.byKey(const PageStorageKey('collection-overview-scroll')),
      matching: find.byType(Scrollable),
    );
    await tester.scrollUntilVisible(
      find.text('Literature'),
      180,
      scrollable: collectionScroll,
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Literature'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Audiobooks'),
      180,
      scrollable: collectionScroll,
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Audiobooks'), findsOneWidget);

    await tester.tap(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('Community'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('New voices'), findsOneWidget);
    expect(find.text('Make a Kasem post'), findsOneWidget);
    expect(find.text('For you'), findsWidgets);
    expect(find.text('Following'), findsWidgets);

    // The feed reads Firestore, which is unavailable in tests
    // (firebaseReadyProvider defaults to false), so it renders its empty state
    // and composing names the real obstacle rather than pretending to publish
    // — or blaming a connection that is fine.
    expect(find.text('No posts yet'), findsOneWidget);

    await tester.tap(find.byKey(const Key('community-compose-bar')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(
      find.textContaining('Indigen World could not be reached'),
      findsOneWidget,
    );

    // Account moved out of the bottom rail and into the top-right orb.
    expect(
      find.descendant(
        of: find.byType(FrostedNavBar),
        matching: find.text('You'),
      ),
      findsNothing,
    );

    await tester.tap(find.byType(ProfileOrb));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Guest learner'), findsOneWidget);
    expect(find.text('Sign in or create an account'), findsOneWidget);
  });
}
