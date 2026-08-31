// What a published record has to look like before the player will touch it.
//
// `MusicTrack.fromReel` is the only gate between a Firestore document and an
// audio source, and everything it lets through becomes a URL handed to a native
// player and a row on somebody's lock screen. The interesting cases are all
// refusals, which is why most of this file is about what does *not* become a
// track.

import 'package:audio_service/audio_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';

PublishedReel _reel({
  String id = 'song',
  String title = 'Kasena lullaby',
  String creatorName = 'Afi',
  String? mediaUrl = 'https://example.test/song.m4a',
  String? thumbnailUrl,
  String? mediaType = 'audio',
  String category = '',
}) => PublishedReel(
  id: id,
  title: title,
  creatorName: creatorName,
  mediaUrl: mediaUrl,
  thumbnailUrl: thumbnailUrl,
  mediaType: mediaType,
  category: category,
);

void main() {
  group('MusicTrack.fromReel', () {
    test('builds a track from a published song', () {
      final track = MusicTrack.fromReel(_reel())!;

      expect(track.id, 'song');
      expect(track.title, 'Kasena lullaby');
      expect(track.url, 'https://example.test/song.m4a');
      expect(track.artist, 'Afi');
    });

    test('refuses a record whose media is still being processed', () {
      // `mediaUrl` is null until the publication workflow has a file, and an
      // AudioSource built from null is a crash rather than an empty player.
      expect(MusicTrack.fromReel(_reel(mediaUrl: null)), isNull);
      expect(MusicTrack.fromReel(_reel(mediaUrl: '')), isNull);
      expect(MusicTrack.fromReel(_reel(mediaUrl: '   ')), isNull);
    });

    test('refuses anything that is not audio', () {
      for (final type in const ['video', 'image', 'document', null]) {
        expect(
          MusicTrack.fromReel(_reel(mediaType: type)),
          isNull,
          reason: 'mediaType $type is not playable as music',
        );
      }
    });

    test('leaves the artist line empty rather than blank', () {
      // A record with no attribution should draw one clean line on the lock
      // screen, not a title with an empty row underneath it.
      expect(MusicTrack.fromReel(_reel(creatorName: ''))!.artist, isNull);
      expect(MusicTrack.fromReel(_reel(creatorName: '  '))!.artist, isNull);
    });

    test('names the album after the category, then the collection', () {
      expect(MusicTrack.fromReel(_reel(category: 'Praise song'))!.album,
          'Praise song');
      expect(MusicTrack.fromReel(_reel())!.album, CollectionKind.music.label);
      expect(
        MusicTrack.fromReel(_reel(), kind: CollectionKind.audiobooks)!.album,
        CollectionKind.audiobooks.label,
      );
    });

    test('takes artwork from the thumbnail, and never from the song itself',
        () {
      expect(
        MusicTrack.fromReel(_reel(thumbnailUrl: 'https://example.test/art.jpg'))!
            .artworkUrl,
        'https://example.test/art.jpg',
      );
      // No thumbnail: `posterUrl` falls through to null rather than offering
      // the .m4a to an image decoder, and the track inherits that.
      expect(MusicTrack.fromReel(_reel())!.artworkUrl, isNull);
    });
  });

  group('toMediaItem', () {
    test('carries the URL in the extras and the record id as the id', () {
      final item = MusicTrack.fromReel(_reel())!.toMediaItem();

      expect(item.id, 'song');
      expect(musicTrackUrlOf(item), 'https://example.test/song.m4a');
    });

    test('starts with no duration', () {
      // Nothing on `publishedContent` knows how long a song is. The handler
      // patches this in from the file's own header a moment after playback
      // starts; anything that renders a seek bar has to survive the gap.
      expect(MusicTrack.fromReel(_reel())!.toMediaItem().duration, isNull);
    });

    test('drops artwork it cannot parse instead of throwing', () {
      final item = MusicTrack.fromReel(
        _reel(thumbnailUrl: 'http://[not a uri'),
      )!.toMediaItem();

      expect(item.artUri, isNull);
    });

    test('an item stripped of its extras reports no URL', () {
      // Media items can come back from the platform side — a media button, a
      // resumption request — without what we put in them.
      expect(
        musicTrackUrlOf(const MediaItem(id: 'song', title: 'Kasena lullaby')),
        isNull,
      );
    });
  });
}
