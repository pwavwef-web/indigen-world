// The bug this file exists to prevent: tap a song, hear a different one.
//
// A collection listing and a playable queue are not the same list. Records with
// no processed media, and the occasional non-audio record filed under music,
// are dropped on the way in — so the index of the row somebody tapped is not
// the index of the track they meant. These tests hold the re-mapping, and they
// are deliberately arranged so that carrying the index across the filter would
// give a plausible-looking wrong answer rather than an obvious crash.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

PublishedReel _reel(String id, {String? mediaUrl, String? mediaType = 'audio'}) =>
    PublishedReel(
      id: id,
      title: id,
      creatorName: 'Afi',
      mediaUrl: mediaUrl ?? 'https://example.test/$id.m4a',
      mediaType: mediaType,
    );

/// Five rows as a member sees them, two of which cannot be played: the second
/// is still being processed and the fourth is a poem somebody filed under
/// music. The playable three are first, third, fifth.
final _listing = [
  _reel('first'),
  _reel('pending', mediaUrl: ''),
  _reel('third'),
  _reel('poem', mediaType: 'document'),
  _reel('fifth'),
];

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('buildMusicQueue', () {
    test('keeps only what can actually be played', () {
      final plan = buildMusicQueue(
        _listing,
        startIndex: 0,
        kind: CollectionKind.music,
      );

      expect(plan.tracks.map((track) => track.id), ['first', 'third', 'fifth']);
    });

    test('re-finds the tapped song after the filter', () {
      // Row 4 is 'fifth'. Carried straight across, index 4 would be out of
      // range of a three-track queue; clamped, it would play 'fifth' by luck.
      // Row 2 is the case that matters: carried across, index 2 plays 'fifth'
      // when the member asked for 'third'.
      final tapped = buildMusicQueue(
        _listing,
        startIndex: 2,
        kind: CollectionKind.music,
      );

      expect(tapped.startIndex, 1);
      expect(tapped.tracks[tapped.startIndex].id, 'third');

      final last = buildMusicQueue(
        _listing,
        startIndex: 4,
        kind: CollectionKind.music,
      );
      expect(last.tracks[last.startIndex].id, 'fifth');
    });

    test('starts at the top when the tapped row was dropped', () {
      // Tapping the poem is not a request to play the song next to it.
      final plan = buildMusicQueue(
        _listing,
        startIndex: 3,
        kind: CollectionKind.music,
      );

      expect(plan.startIndex, 0);
      expect(plan.tracks[plan.startIndex].id, 'first');
    });

    test('survives an index that is not in the listing at all', () {
      for (final index in const [-1, 99]) {
        final plan = buildMusicQueue(
          _listing,
          startIndex: index,
          kind: CollectionKind.music,
        );
        expect(plan.startIndex, 0);
      }
    });

    test('an unplayable collection produces an empty plan', () {
      final plan = buildMusicQueue(
        [_reel('poem', mediaType: 'document')],
        startIndex: 0,
        kind: CollectionKind.music,
      );

      expect(plan.isEmpty, isTrue);
      expect(plan.startIndex, 0);
    });

    test('the album line follows the collection it was played from', () {
      final plan = buildMusicQueue(
        _listing,
        startIndex: 0,
        kind: CollectionKind.audiobooks,
      );

      expect(
        plan.tracks.map((track) => track.album),
        everyElement(CollectionKind.audiobooks.label),
      );
    });
  });

  group('playCollection without a handler', () {
    setUp(() => SharedPreferences.setMockInitialValues(const {}));

    test('reports it rather than throwing', () async {
      // Every widget test in the suite builds a scope with no handler
      // override, so this is the shape the controller is in far more often
      // than not.
      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container
          .read(musicControllerProvider.notifier)
          .playCollection(_listing, startIndex: 0, kind: CollectionKind.music);

      expect(container.read(musicControllerProvider).error, isNotNull);
      expect(container.read(musicControllerProvider).queueKind, isNull);
    });

    test('an unplayable collection is a different message, and not a queue',
        () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      await container.read(musicControllerProvider.notifier).playCollection(
        [_reel('poem', mediaType: 'document')],
        startIndex: 0,
        kind: CollectionKind.music,
      );

      expect(container.read(musicControllerProvider).error, contains('yet'));
    });
  });
}
