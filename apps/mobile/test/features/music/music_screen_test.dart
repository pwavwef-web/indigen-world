// The Music channel, from the outside.
//
// It used to be a grid of every published song in whatever order Firestore
// returned it, which answers "what is in here" and nothing else. These tests
// hold the three things that replaced it: the people who made the music are a
// shelf you can open, a song can be found by name, and the list underneath is
// readable rather than a wall of squares.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_screen.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';

PublishedReel song({
  required String id,
  required String title,
  String creatorName = 'Awuni Atia',
  String creatorId = 'awuni',
}) => PublishedReel(
  id: id,
  title: title,
  creatorName: creatorName,
  creatorId: creatorId,
  mediaUrl: 'https://example.test/$id.mp3',
  mediaType: 'audio',
);

final _catalogue = [
  song(id: '1', title: 'Na'),
  song(id: '2', title: 'Zaanem'),
  song(id: '3', title: 'Paga', creatorId: 'amina', creatorName: 'Amina Awe'),
];

Future<void> pumpMusic(
  WidgetTester tester, {
  List<PublishedReel> items = const [],
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        musicCollectionProvider.overrideWith((ref) => Stream.value(items)),
      ],
      child: MaterialApp(
        theme: buildIndigenTheme(),
        home: const MusicScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  testWidgets('the channel opens on its artists and its songs', (tester) async {
    await pumpMusic(tester, items: _catalogue);

    // The people are a shelf of their own. In a tradition carried by singers,
    // the name under a recording is not metadata.
    expect(find.text('Artists'), findsOneWidget);
    expect(find.byType(MusicArtistCircle), findsNWidgets(2));

    // And the archive itself is a list you can read, not a grid of squares.
    expect(find.text('Every song'), findsOneWidget);
    expect(find.byType(MusicTrackRow), findsNWidgets(3));
    expect(find.text('Play all 3'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an artist opens onto everything of theirs', (tester) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(find.text('Awuni Atia').first);
    await tester.pumpAndSettle();

    expect(find.byType(MusicArtistScreen), findsOneWidget);
    // Their two songs, and not the third singer's.
    expect(find.byType(MusicTrackRow), findsNWidgets(2));
    expect(find.textContaining('2 songs'), findsOneWidget);
  });

  testWidgets('search finds the song by name, exact match first', (
    tester,
  ) async {
    await pumpMusic(tester, items: _catalogue);

    await tester.tap(find.byTooltip('Search'));
    await tester.pumpAndSettle();
    expect(find.byType(MusicSearchScreen), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'zaa');
    await tester.pumpAndSettle();

    expect(find.byType(MusicTrackRow), findsOneWidget);
    expect(find.text('Zaanem'), findsOneWidget);
  });

  testWidgets('an empty channel says so rather than drawing a bare shelf', (
    tester,
  ) async {
    await pumpMusic(tester);

    expect(
      find.text('Music is ready for its first published piece'),
      findsOneWidget,
    );
    expect(find.text('Artists'), findsNothing);
    expect(find.text('Jump back in'), findsNothing);
  });
}
