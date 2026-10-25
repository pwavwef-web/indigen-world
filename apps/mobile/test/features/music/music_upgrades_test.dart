// The 0.1.36 music upgrades: liked songs that follow the account, Play next
// that means next even on shuffle, a sleep timer that fades, a speed per
// channel, and a place kept in every audiobook.

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/share_text.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_audio_handler.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_likes.dart';
import 'package:indigen_world_mobile/features/music/music_places.dart';
import 'package:indigen_world_mobile/features/music/music_sleep_timer.dart';
import 'package:indigen_world_mobile/features/music/widgets/listening_tools.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

PublishedReel _book(String id) => PublishedReel(
  id: id,
  title: 'Reading $id',
  creatorName: 'Synthetic reader',
  mediaUrl: 'https://example.test/$id.mp3',
  mediaType: 'audio',
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  group('liked songs', () {
    test('a like goes to the front and is written down; a second tap takes '
        'it back', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final likes = container.read(likedSongsProvider.notifier);

      expect(await likes.toggle('a'), isTrue);
      expect(await likes.toggle('b'), isTrue);
      expect(container.read(likedSongsProvider), ['b', 'a']);
      expect(container.read(isSongLikedProvider('a')), isTrue);

      expect(await likes.toggle('a'), isFalse);
      expect(container.read(likedSongsProvider), ['b']);
      final preferences = await SharedPreferences.getInstance();
      expect(preferences.getStringList(musicLikedPreferenceKey), ['b']);
    });

    test('a guest\'s likes join the first account, in the phone\'s order', () {
      final result = reconcileSavedWords(
        uid: 'member',
        local: {'x', 'y'},
        cloud: {'z', 'x'},
        syncedUid: null,
      );
      expect(result.ids, {'x', 'y', 'z'});
      expect(result.writeCloud, isTrue);
      expect(
        orderLikedSongs(keep: result.ids, local: ['y', 'x'], cloud: ['z', 'x']),
        ['y', 'x', 'z'],
      );
    });

    test('likes reconciled with one account never join another', () {
      final result = reconcileSavedWords(
        uid: 'second',
        local: {'mine'},
        cloud: null,
        syncedUid: 'first',
      );
      expect(result.ids, isEmpty);
    });
  });

  group('queue order', () {
    test('Play next lands straight after the current song when shuffled', () {
      final order = MusicShuffleOrder()..indices.addAll([2, 0, 3, 1]);
      // Song 0 is playing; a new song is inserted at source index 1.
      order
        ..insertAfter = 0
        ..insert(1, 1);
      // Every old index from 1 up moved along by one, and the new song (1)
      // follows 0 in the shuffled order.
      expect(order.indices, [3, 0, 1, 4, 2]);
    });

    test('Add to queue lands at the end of the shuffled order', () {
      final order = MusicShuffleOrder()..indices.addAll([2, 0, 1]);
      order
        ..insertAfter = null
        ..insert(3, 1);
      expect(order.indices, [2, 0, 1, 3]);
    });

    test('the anchor is read once, so a later insert is not steered by it', () {
      final order = MusicShuffleOrder()..indices.addAll([1, 0]);
      order
        ..insertAfter = 1
        ..insert(2, 1);
      expect(order.insertAfter, isNull);
      expect(order.indices, [1, 2, 0]);
    });

    test('removing keeps the rest of the order and closes the gap', () {
      final order = MusicShuffleOrder()..indices.addAll([3, 0, 2, 1]);
      order.removeRange(1, 2);
      expect(order.indices, [2, 0, 1]);
    });
  });

  group('speed', () {
    test('is written the way a player writes it', () {
      expect(musicSpeedLabel(1), '1×');
      expect(musicSpeedLabel(1.5), '1.5×');
      expect(musicSpeedLabel(1.25), '1.25×');
      expect(musicSpeedLabel(0.75), '0.75×');
    });

    test('is remembered per channel', () {
      expect(
        musicSpeedPreferenceKey(CollectionKind.audiobooks),
        isNot(musicSpeedPreferenceKey(CollectionKind.music)),
      );
    });
  });

  group('sleep timer', () {
    final now = DateTime(2026, 10, 25, 22);

    test('counts down to a time on the clock', () {
      final timer = MusicSleepTimer.at(now.add(const Duration(minutes: 15)));
      expect(musicSleepRemaining(timer, now: now), const Duration(minutes: 15));
      expect(
        musicSleepRemaining(timer, now: now.add(const Duration(hours: 1))),
        Duration.zero,
      );
    });

    test('at the end of a song, waits for the song to say how long it is', () {
      const timer = MusicSleepTimer.endOfTrack('song');
      expect(musicSleepRemaining(timer, now: now), isNull);
      expect(
        musicSleepRemaining(
          timer,
          now: now,
          position: const Duration(minutes: 2),
          duration: const Duration(minutes: 3),
        ),
        const Duration(minutes: 1),
      );
    });

    test('fades over the last ten seconds and no sooner', () {
      expect(musicSleepVolume(const Duration(minutes: 1)), 1);
      expect(musicSleepVolume(null), 1);
      expect(musicSleepVolume(const Duration(seconds: 5)), closeTo(0.5, 0.001));
      expect(musicSleepVolume(Duration.zero), 0);
    });

    test('says the time left like a clock', () {
      expect(musicSleepLabel(const Duration(minutes: 12, seconds: 5)), '12:05');
      expect(musicSleepLabel(const Duration(hours: 1)), '1:00:00');
    });
  });

  group('audiobook places', () {
    final at = DateTime(2026, 10, 25, 20);

    AudiobookPlace place(
      String id, {
      int minutes = 10,
      int length = 60,
      int ago = 0,
    }) => AudiobookPlace(
      trackId: id,
      position: Duration(minutes: minutes),
      duration: Duration(minutes: length),
      updatedAt: at.subtract(Duration(minutes: ago)),
    );

    test('each book keeps its own place', () {
      var places = recordAudiobookPlace(const {}, place('one', minutes: 12));
      places = recordAudiobookPlace(places, place('two', minutes: 40));
      expect(places['one']!.position, const Duration(minutes: 12));
      expect(places['two']!.position, const Duration(minutes: 40));
    });

    test('a finished book gives its place up', () {
      final places = recordAudiobookPlace(
        {'one': place('one')},
        AudiobookPlace(
          trackId: 'one',
          position: const Duration(minutes: 59, seconds: 45),
          duration: const Duration(minutes: 60),
          updatedAt: at,
        ),
      );
      expect(places, isEmpty);
    });

    test('only the most recently heard are kept', () {
      var places = <String, AudiobookPlace>{};
      for (var index = 0; index < 5; index++) {
        places = recordAudiobookPlace(
          places,
          place('book-$index', ago: 10 - index),
          limit: 3,
        );
      }
      expect(places.keys.toSet(), {'book-2', 'book-3', 'book-4'});
    });

    test('Continue listening offers started, unfinished, published books, '
        'newest first', () {
      final shelf = continueListening(
        {
          'old': place('old', ago: 30),
          'new': place('new', ago: 1),
          'barely': AudiobookPlace(
            trackId: 'barely',
            position: const Duration(seconds: 5),
            duration: const Duration(minutes: 60),
            updatedAt: at,
          ),
          'gone': place('gone'),
        },
        [_book('old'), _book('new'), _book('barely')],
      );
      expect([for (final book in shelf) book.item.id], ['new', 'old']);
      expect(shelf.first.place.progress, closeTo(10 / 60, 0.001));
    });

    test('places survive the trip through storage', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      await container
          .read(audiobookPlacesProvider.notifier)
          .record(
            'one',
            const Duration(minutes: 7),
            duration: const Duration(minutes: 30),
            at: at,
          );
      final second = ProviderContainer();
      addTearDown(second.dispose);
      second.read(audiobookPlacesProvider);
      await pumpEventQueue();
      expect(
        second.read(audiobookPlacesProvider)['one']?.position,
        const Duration(minutes: 7),
      );
    });
  });

  test('sharing a song names it, its singer and where to hear it', () {
    final text = collectionShareText(
      title: 'A synthetic song',
      creator: 'Synthetic choir',
      kind: CollectionKind.music,
    );
    expect(text, contains('“A synthetic song” by Synthetic choir — a song'));
    expect(text, contains('Listen in the Indigen World app'));
    expect(text, contains('play.google.com'));
  });

  testWidgets('the now playing pills: like, speed, sleep and share', (
    tester,
  ) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const Scaffold(
            backgroundColor: Colors.indigo,
            body: Center(
              child: ListeningTools(
                item: MediaItem(id: 'song', title: 'Synthetic song'),
                kind: CollectionKind.music,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Like'), findsOneWidget);
    expect(find.text('1×'), findsOneWidget);
    expect(find.text('Sleep'), findsOneWidget);
    expect(find.text('Share'), findsOneWidget);

    await tester.tap(find.byKey(const Key('now-playing-like')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Liked'), findsOneWidget);
    expect(container.read(likedSongsProvider), ['song']);

    await tester.tap(find.byKey(const Key('now-playing-sleep')));
    await tester.pumpAndSettle();
    expect(find.text('Sleep timer'), findsOneWidget);
    expect(find.byKey(const Key('sleep-15')), findsOneWidget);
    expect(find.byKey(const Key('sleep-end-of-track')), findsOneWidget);
    // Nothing running yet, so nothing to turn off.
    expect(find.byKey(const Key('sleep-off')), findsNothing);
  });
}
