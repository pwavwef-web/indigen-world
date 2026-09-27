// The Music channel, from the outside.
//
// It used to be a grid of every published song in whatever order Firestore
// returned it, which answers "what is in here" and nothing else. These tests
// hold the things that replaced it: the people who made the music are a shelf
// you can open, a song can be found by name, the list underneath is readable
// rather than a wall of squares — and the channel is a place with its own
// rail, whose tabs keep their places and whose back button goes Home first.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_home_tab.dart';
import 'package:indigen_world_mobile/features/music/music_list_screen.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';
import 'package:indigen_world_mobile/features/music/music_screen.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:shared_preferences/shared_preferences.dart';

PublishedReel song({
  required String id,
  required String title,
  String creatorName = 'Awuni Atia',
  String creatorId = 'awuni',
  String category = '',
}) => PublishedReel(
  id: id,
  title: title,
  creatorName: creatorName,
  creatorId: creatorId,
  mediaUrl: 'https://example.test/$id.mp3',
  mediaType: 'audio',
  category: category,
);

final _catalogue = [
  song(id: '1', title: 'Na'),
  song(id: '2', title: 'Zaanem'),
  song(id: '3', title: 'Paga', creatorId: 'amina', creatorName: 'Amina Awe'),
];

Future<void> pumpMusic(
  WidgetTester tester, {
  List<PublishedReel> items = const [],
  CollectionKind kind = CollectionKind.music,
}) async {
  // A phone, not the test default: the stage at the top of Home is a phone's
  // header, and the shelves under it are laid out for a phone's width.
  tester.view
    ..physicalSize = const Size(1170, 2532)
    ..devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        musicCollectionProvider.overrideWith((ref) => Stream.value(items)),
        audiobookCollectionProvider.overrideWith((ref) => Stream.value(items)),
      ],
      child: MaterialApp(
        theme: buildIndigenTheme(),
        home: MusicScreen(kind: kind),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

/// The rail's destination called [label].
Finder railItem(String label) =>
    find.descendant(of: find.byType(FrostedNavBar), matching: find.text(label));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  testWidgets('the channel opens on its artists and its songs', (tester) async {
    await pumpMusic(tester, items: _catalogue);

    // The people are a shelf of their own. In a tradition carried by singers,
    // the name under a recording is not metadata.
    expect(find.widgetWithText(MusicSectionHeader, 'Artists'), findsOneWidget);
    expect(find.byType(MusicArtistCircle), findsNWidgets(2));

    // And the archive itself is a list you can read, not a grid of squares.
    expect(find.text('Every song'), findsOneWidget);
    expect(find.byType(MusicTrackRow), findsNWidgets(3));
    expect(find.text('Play all 3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the channel has its own rail, in the order a member reaches '
      'for it', (tester) async {
    await pumpMusic(tester, items: _catalogue);

    for (final label in ['Home', 'Search', 'Artists', 'Library']) {
      expect(railItem(label), findsOneWidget, reason: label);
    }
    final rail = tester.widget<FrostedNavBar>(find.byType(FrostedNavBar));
    // It is the app's rail, handing over rather than covering it.
    expect(rail.heroTag, kAppRailHeroTag);
  });

  testWidgets('audiobooks are the same place, with readers for artists', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue, kind: CollectionKind.audiobooks);

    expect(railItem('Readers'), findsOneWidget);
    expect(railItem('Artists'), findsNothing);
    expect(find.text('Every reading'), findsOneWidget);
  });

  testWidgets('an artist opens onto everything of theirs', (tester) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(find.widgetWithText(MusicArtistCircle, 'Awuni Atia'));
    await tester.pumpAndSettle();

    expect(find.byType(MusicArtistScreen), findsOneWidget);
    // Their two songs, and not the third singer's.
    expect(find.byType(MusicTrackRow), findsNWidgets(2));
    expect(find.textContaining('2 songs'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('search finds the song by name, exact match first', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(railItem('Search'));
    await tester.pumpAndSettle();
    expect(find.byType(MusicSearchScreen), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'zaa');
    await tester.pumpAndSettle();

    expect(find.byType(MusicTrackRow), findsOneWidget);
    expect(find.text('Zaanem'), findsOneWidget);
  });

  testWidgets('the Artists tab is everybody, and Browse on Home goes there', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(find.text('Browse'));
    await tester.pumpAndSettle();

    expect(find.text('Most pieces'), findsOneWidget);
    expect(find.byType(MusicArtistCircle), findsNWidgets(2));

    // A–Z puts Amina before Awuni; busiest put Awuni, with two, first.
    await tester.tap(find.text('A–Z'));
    await tester.pumpAndSettle();
    final names = tester
        .widgetList<MusicArtistCircle>(find.byType(MusicArtistCircle))
        .map((circle) => circle.artist.name)
        .toList();
    expect(names, ['Amina Awe', 'Awuni Atia']);
  });

  testWidgets('back from another tab goes Home before it leaves', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(railItem('Library'));
    await tester.pumpAndSettle();
    expect(find.text('Every song'), findsNothing);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    // Still in the channel, back on Home.
    expect(find.byType(MusicScreen), findsOneWidget);
    expect(find.text('Every song'), findsOneWidget);
  });

  testWidgets('a second tap on the tab you are on goes back to the top', (
    tester,
  ) async {
    await pumpMusic(
      tester,
      items: [for (var i = 0; i < 30; i++) song(id: 's$i', title: 'Song $i')],
    );

    await tester.drag(find.byType(MusicHomeTab), const Offset(0, -900));
    await tester.pumpAndSettle();
    final scrollable = find
        .descendant(
          of: find.byType(MusicHomeTab),
          matching: find.byType(Scrollable),
        )
        .first;
    expect(tester.state<ScrollableState>(scrollable).position.pixels, 900);

    await tester.tap(railItem('Home'));
    await tester.pumpAndSettle();

    expect(tester.state<ScrollableState>(scrollable).position.pixels, 0);
  });

  testWidgets('the library says what will land there before anything has', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(railItem('Library'));
    await tester.pumpAndSettle();

    expect(find.textContaining('What you play lands here'), findsOneWidget);
    expect(find.text('Recently played'), findsNothing);
  });

  testWidgets('what was played is in the library, and can be cleared', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      musicRecentPreferenceKey: ['3', '1'],
    });
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(railItem('Library'));
    await tester.pumpAndSettle();

    expect(find.text('Recently played'), findsOneWidget);
    expect(find.byType(MusicTrackRow), findsNWidgets(2));

    await tester.tap(find.text('Clear'));
    await tester.pumpAndSettle();

    expect(find.text('Recently played'), findsNothing);
    expect(find.textContaining('What you play lands here'), findsOneWidget);
  });

  testWidgets('kinds of song become tiles once there are enough of them', (
    tester,
  ) async {
    await pumpMusic(
      tester,
      items: [
        song(id: 'a', title: 'Harvest one', category: 'Harvest'),
        song(id: 'b', title: 'Harvest two', category: 'Harvest'),
        song(id: 'c', title: 'Dirge one', category: 'Funeral'),
        song(id: 'd', title: 'Dirge two', category: 'Funeral'),
        song(id: 'e', title: 'A lone lullaby', category: 'Lullaby'),
      ],
    );

    await tester.scrollUntilVisible(
      find.text('Browse by kind'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(MusicHomeTab),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    // Two kinds with two pieces each; the lone lullaby is not a section.
    expect(find.byType(MusicCategoryTile), findsNWidgets(2));
    expect(find.widgetWithText(MusicCategoryTile, 'Lullaby'), findsNothing);

    await tester.tap(find.widgetWithText(MusicCategoryTile, 'Harvest'));
    await tester.pumpAndSettle();

    expect(find.byType(MusicListScreen), findsOneWidget);
    expect(find.byType(MusicTrackRow), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('an empty channel says so rather than drawing a bare shelf', (
    tester,
  ) async {
    await pumpMusic(tester);

    expect(
      find.text('Music is ready for its first published piece'),
      findsOneWidget,
    );
    expect(find.byType(MusicArtistCircle), findsNothing);
    expect(find.widgetWithText(MusicSectionHeader, 'Artists'), findsNothing);
    expect(find.text('Jump back in'), findsNothing);
  });
}
