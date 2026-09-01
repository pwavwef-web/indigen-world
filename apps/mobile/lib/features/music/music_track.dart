import 'package:audio_service/audio_service.dart';
import 'package:flutter/foundation.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

/// Where the playable URL rides inside a [MediaItem].
///
/// The queue the handler broadcasts is a list of [MediaItem]s, because that is
/// what the notification, the lock screen and Android Auto all read. But a
/// `MediaItem.id` is an *identity*, and the published record id is the identity
/// worth having: it is what the resume point is keyed by, what the collection
/// stream can be looked up against, and what stays stable if a file is
/// re-uploaded. So the URL travels in the extras rather than in the id, and the
/// handler rebuilds its audio sources from the queue alone.
const musicTrackUrlExtra = 'url';

/// One playable song or audiobook chapter, as the player understands it.
///
/// ── Why this is not just a PublishedReel ──────────────────────────────────
/// `publishedContent` is a publishing record: it knows a title, a creator and a
/// file. A player needs a *track* — something with an artist line, an album
/// line and artwork, in the shape the operating system's media session wants.
/// Translating once, here, keeps that mapping in one readable place instead of
/// smeared across the handler, the queue and three widgets.
///
/// ── Why there is no duration ──────────────────────────────────────────────
/// [MediaItem.duration] deliberately starts null and is patched in by the
/// handler from `player.durationStream` a moment after playback begins. The
/// alternative was a `durationMs` field on `publishedContent`, which would mean
/// changing the publication function, the open-publishing path *and* the
/// contract schema — which is `additionalProperties: false` and enforced by the
/// test suite — for a number the player learns for itself a second later. And
/// the queue is never pre-scanned for durations: that would be one HTTP range
/// request per song, on a connection somebody is paying for by the megabyte.
@immutable
class MusicTrack {
  const MusicTrack({
    required this.id,
    required this.title,
    required this.url,
    required this.album,
    this.artist,
    this.artworkUrl,
  });

  /// The published record id — the same id the collection stream is keyed by.
  final String id;

  final String title;

  /// The audio file. Never null and never empty; [fromReel] refuses to build a
  /// track without one.
  final String url;

  /// `creatorAttribution.displayName`, or null when the record carries no name
  /// at all. Null rather than an empty string, so the notification draws one
  /// clean line instead of a title with a blank beneath it.
  final String? artist;

  /// The record's own `category` when it has one, otherwise the name of the
  /// collection it was played from. Something is always better than nothing
  /// here: the album line is the only place the lock screen says *what kind of
  /// thing* is playing.
  final String album;

  /// Artwork for the lock screen. Read from [PublishedReel.posterUrl], which
  /// already refuses to hand an audio file to an image decoder.
  final String? artworkUrl;

  /// The track a published record plays as, or null when it does not play.
  ///
  /// Null for two reasons and only two: the media has no URL yet (the
  /// publication workflow is still processing it), or the record is not audio.
  /// Callers map a whole collection through this and drop the nulls — see
  /// `buildMusicQueue` in music_controller.dart for why the tapped index has to
  /// be re-found after that filter rather than carried across it.
  static MusicTrack? fromReel(
    PublishedReel reel, {
    CollectionKind kind = CollectionKind.music,
  }) {
    final url = reel.mediaUrl?.trim() ?? '';
    // `isAudio` is the exact media-type comparison PublishedReel documents.
    // Asking it here rather than re-testing `mediaType.contains('audio')` is
    // the point of that getter existing.
    if (url.isEmpty || !reel.isAudio) return null;

    final artist = reel.creatorName.trim();
    final category = reel.category.trim();
    return MusicTrack(
      id: reel.id,
      title: reel.title,
      url: url,
      artist: artist.isEmpty ? null : artist,
      album: category.isEmpty ? kind.label : category,
      artworkUrl: reel.posterUrl,
    );
  }

  /// The same track playing from somewhere else — a downloaded copy.
  ///
  /// Everything but the URL is kept, deliberately: the id is what the resume
  /// point and the collection lookup are both keyed by, and swapping it for a
  /// file path would break both the moment somebody deleted the download.
  MusicTrack withUrl(String url) => MusicTrack(
    id: id,
    title: title,
    url: url,
    album: album,
    artist: artist,
    artworkUrl: artworkUrl,
  );

  /// The media-session view of this track.
  MediaItem toMediaItem() => MediaItem(
    id: id,
    title: title,
    artist: artist,
    album: album,
    // A poster that is not a parseable URI is simply no artwork. Handing
    // `Uri.parse` a malformed string here would throw on the way into the
    // queue and take the whole collection down with it.
    artUri: artworkUrl == null ? null : Uri.tryParse(artworkUrl!),
    playable: true,
    extras: {musicTrackUrlExtra: url},
  );
}

/// The playable URL carried by a queue entry, or null if it lost its extras.
///
/// A [MediaItem] can arrive from the platform side — a media button, a
/// resumption request — with the extras stripped, so this never assumes.
String? musicTrackUrlOf(MediaItem item) {
  final url = item.extras?[musicTrackUrlExtra];
  return url is String && url.isNotEmpty ? url : null;
}
