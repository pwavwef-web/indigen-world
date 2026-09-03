// The Music channel as a library rather than as a list.
//
// Everything here is the part of the player that has no player in it: who an
// artist is when the archive only half-remembers them, what a search should
// put at the top, and which of the ids on the "jump back in" shelf still point
// at something published. All three are quiet failure modes — a creator whose
// catalogue silently splits in two, a search that buries the exact match, a
// shelf that throws on a record somebody unpublished — so they are tested
// without Firestore, without a handler and without a widget tree.

import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';

PublishedReel song({
  required String id,
  required String title,
  String creatorName = 'Awuni Atia',
  String creatorId = 'awuni',
  String category = '',
  String? mediaUrl = 'https://example.test/song.mp3',
  String mediaType = 'audio',
  String? avatar,
}) => PublishedReel(
  id: id,
  title: title,
  creatorName: creatorName,
  creatorId: creatorId,
  creatorAvatarUrl: avatar,
  mediaUrl: mediaUrl,
  mediaType: mediaType,
  category: category,
  thumbnailUrl: 'https://example.test/$id.jpg',
);

void main() {
  group('artists', () {
    test('groups a catalogue by the person who made it, busiest first', () {
      final artists = groupArtists([
        song(id: '1', title: 'Na'),
        song(id: '2', title: 'Zaanem'),
        song(id: '3', title: 'Paga', creatorId: 'amina', creatorName: 'Amina'),
      ]);

      expect(artists.map((artist) => artist.name), ['Awuni Atia', 'Amina']);
      expect(artists.first.trackCount, 2);
    });

    test('a record published before creator ids joins the same artist', () {
      // The archive holds three generations of publication record. A creator
      // whose older work carries only a name must not appear twice with their
      // catalogue split down the middle.
      final artists = groupArtists([
        song(id: '1', title: 'Na'),
        song(id: '2', title: 'Old song', creatorId: ''),
      ]);

      expect(artists, hasLength(1));
      expect(artists.single.trackCount, 2);
      expect(artists.single.id, 'awuni');
    });

    test('records that cannot be played are not an artist', () {
      // A piece still being processed by the publication workflow has no media
      // URL. An artist page built from one would be a page of dead rows.
      final artists = groupArtists([
        song(id: '1', title: 'Pending', mediaUrl: null),
        song(id: '2', title: 'A poem', mediaType: 'document'),
      ]);

      expect(artists, isEmpty);
    });

    test('the circle shows their face, then their artwork, then a letter', () {
      final withPhoto = groupArtists([
        song(id: '1', title: 'Na', avatar: 'https://example.test/face.jpg'),
      ]).single;
      expect(withPhoto.imageUrl, 'https://example.test/face.jpg');

      final withoutPhoto = groupArtists([song(id: '2', title: 'Na')]).single;
      expect(withoutPhoto.imageUrl, 'https://example.test/2.jpg');
      expect(withoutPhoto.initial, 'A');
    });
  });

  group('search', () {
    final tracks = [
      song(id: '1', title: 'Na', category: 'Praise'),
      song(id: '2', title: 'Nabiina', creatorId: 'amina', creatorName: 'Amina'),
      song(id: '3', title: 'Harvest', category: 'Naming ceremony'),
    ];
    final artists = groupArtists(tracks);

    test('the exact title comes first, not whatever was published first', () {
      final results = searchMusicLibrary(
        tracks: tracks,
        artists: artists,
        query: 'na',
      );

      expect(results.tracks.first.title, 'Na');
      // Everything that mentions it is still there, ranked underneath.
      expect(results.tracks.map((track) => track.id), ['1', '2', '3']);
    });

    test('a singer is found by name, and so is their work', () {
      final results = searchMusicLibrary(
        tracks: tracks,
        artists: artists,
        query: 'amina',
      );

      expect(results.artists.single.name, 'Amina');
      expect(results.tracks.single.title, 'Nabiina');
    });

    test('an empty query is not a search for everything', () {
      final results = searchMusicLibrary(
        tracks: tracks,
        artists: artists,
        query: '   ',
      );

      expect(results.isEmpty, isTrue);
    });

    test('nothing matching is nothing, rather than the whole archive', () {
      final results = searchMusicLibrary(
        tracks: tracks,
        artists: artists,
        query: 'aeroplane',
      );

      expect(results.isEmpty, isTrue);
    });
  });

  group('recently played', () {
    test('resolves ids in the order they were played', () {
      final items = [
        song(id: '1', title: 'Na'),
        song(id: '2', title: 'Zaanem'),
      ];

      expect(
        resolveRecent(['2', '1'], items).map((item) => item.title),
        ['Zaanem', 'Na'],
      );
    });

    test('an unpublished record drops off the shelf instead of throwing', () {
      // The shelf keeps ids precisely so that this is what happens: a stored
      // copy of the record would still be drawn, and would open on nothing.
      expect(
        resolveRecent(['gone', '1'], [song(id: '1', title: 'Na')]),
        hasLength(1),
      );
    });
  });
}
