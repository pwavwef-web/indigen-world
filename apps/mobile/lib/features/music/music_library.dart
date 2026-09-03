import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';

/// The Music channel as a library rather than as a list.
///
/// ── Why a layer between the collection stream and the screen ──────────────
/// Because "the Music collection" and "the music library" are not the same
/// thing. The collection is a stream of publication records in whatever order
/// Firestore returned them; a library is what somebody browses — the people
/// who made the songs, the song you want by name, the thing you were listening
/// to yesterday. None of that exists in the record; all of it is derivable from
/// the records taken together, and deriving it once, here, is what stops three
/// screens each inventing their own slightly different idea of who an artist
/// is.
///
/// Everything in this file is a pure function over a list of [PublishedReel]s,
/// so all of it is testable without Firestore, a player or a widget tree.

/// One person, and everything of theirs the archive can play.
@immutable
class MusicArtist {
  const MusicArtist({
    required this.id,
    required this.name,
    required this.tracks,
  });

  /// The creator's account id where the record carries one, and their
  /// normalised name where it does not — see [artistKey].
  final String id;

  /// The name as it is published, taken from the record that has the most to
  /// say about them.
  final String name;

  /// Their playable records, newest publication first where dates allow.
  final List<PublishedReel> tracks;

  int get trackCount => tracks.length;

  /// The face on the circle. Their own photograph if the archive has one,
  /// otherwise the artwork of their first piece — never nothing, because a row
  /// of empty circles is a row that says the artists are missing rather than
  /// their photographs.
  String? get imageUrl {
    for (final track in tracks) {
      final avatar = track.creatorAvatarUrl;
      if (avatar != null && avatar.isNotEmpty) return avatar;
    }
    for (final track in tracks) {
      final poster = track.posterUrl;
      if (poster != null && poster.isNotEmpty) return poster;
    }
    return null;
  }

  /// The initial drawn where there is no picture at all.
  ///
  /// Taken by rune rather than by code unit, so a name that starts outside the
  /// basic plane draws a letter rather than half of one.
  String get initial {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    return String.fromCharCodes(trimmed.runes.take(1)).toUpperCase();
  }
}

/// The comparable form of a title, a name or a query.
String normaliseMusicText(String raw) => raw
    .toLowerCase()
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// Which artist a record belongs to.
///
/// The account id when the publication workflow stamped one, because that is
/// the only identity that survives somebody changing how their name is spelled.
/// Records published before `creatorId` existed have nothing but the name, so
/// they group by the name — and [groupArtists] folds those groups into the
/// id-keyed one when the names agree, so a creator does not appear twice with
/// their catalogue split down the middle.
String artistKey(PublishedReel reel) {
  final id = reel.creatorId.trim();
  if (id.isNotEmpty) return 'id:$id';
  return 'name:${normaliseMusicText(reel.creatorName)}';
}

/// Everybody with something playable in [items], busiest first.
///
/// Ordered by how much of their work is here rather than alphabetically: the
/// row is a shelf of who this archive actually holds, and an alphabetical shelf
/// puts whoever is called Abu at the front of it forever.
List<MusicArtist> groupArtists(List<PublishedReel> items) {
  final byKey = <String, List<PublishedReel>>{};
  for (final item in items) {
    if (MusicTrack.fromReel(item) == null) continue;
    byKey.putIfAbsent(artistKey(item), () => <PublishedReel>[]).add(item);
  }

  // Fold the nameless-id groups into the account they clearly belong to. Done
  // as a second pass rather than in the loop above because the id-keyed group
  // may not have been seen yet when the name-keyed record arrives.
  final idKeyByName = <String, String>{};
  for (final entry in byKey.entries) {
    if (!entry.key.startsWith('id:')) continue;
    final name = normaliseMusicText(entry.value.first.creatorName);
    if (name.isNotEmpty) idKeyByName.putIfAbsent(name, () => entry.key);
  }
  for (final key in byKey.keys.toList()) {
    if (!key.startsWith('name:')) continue;
    final target = idKeyByName[key.substring('name:'.length)];
    if (target == null) continue;
    byKey[target]!.addAll(byKey.remove(key)!);
  }

  final artists = <MusicArtist>[
    for (final entry in byKey.entries)
      MusicArtist(
        id: entry.key.startsWith('id:')
            ? entry.key.substring('id:'.length)
            : entry.key,
        name: entry.value.first.creatorName.trim().isEmpty
            ? 'Unknown artist'
            : entry.value.first.creatorName.trim(),
        tracks: List.unmodifiable(entry.value),
      ),
  ];
  artists.sort((a, b) {
    final byCount = b.trackCount.compareTo(a.trackCount);
    return byCount != 0
        ? byCount
        : a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
  return List.unmodifiable(artists);
}

/// What a search turned up, in the two shapes a member is looking for.
@immutable
class MusicSearchResults {
  const MusicSearchResults({required this.artists, required this.tracks});

  static const empty = MusicSearchResults(
    artists: <MusicArtist>[],
    tracks: <PublishedReel>[],
  );

  final List<MusicArtist> artists;
  final List<PublishedReel> tracks;

  bool get isEmpty => artists.isEmpty && tracks.isEmpty;
}

/// The library, filtered to [query] and ranked by how well it answers it.
///
/// ── Why ranking, and not just a filter ────────────────────────────────────
/// Because "na" should find the song called *Na* before it finds the four
/// songs with "na" somewhere in a description. A `contains` filter returns all
/// five in publication order and buries the answer; ranking the title match
/// above the artist match above the everything-else match is the difference
/// between a search box and a list that happens to get shorter as you type.
MusicSearchResults searchMusicLibrary({
  required List<PublishedReel> tracks,
  required List<MusicArtist> artists,
  required String query,
}) {
  final needle = normaliseMusicText(query);
  if (needle.isEmpty) return MusicSearchResults.empty;

  final rankedArtists = <({MusicArtist artist, int rank})>[];
  for (final artist in artists) {
    final name = normaliseMusicText(artist.name);
    if (name.startsWith(needle)) {
      rankedArtists.add((artist: artist, rank: 0));
    } else if (name.contains(needle)) {
      rankedArtists.add((artist: artist, rank: 1));
    }
  }
  rankedArtists.sort((a, b) => a.rank.compareTo(b.rank));

  final rankedTracks = <({PublishedReel track, int rank})>[];
  for (final track in tracks) {
    final title = normaliseMusicText(track.title);
    final artist = normaliseMusicText(track.creatorName);
    final category = normaliseMusicText(track.category);
    final rank = title.startsWith(needle)
        ? 0
        : title.contains(needle)
        ? 1
        : artist.contains(needle)
        ? 2
        : category.contains(needle)
        ? 3
        : -1;
    if (rank >= 0) rankedTracks.add((track: track, rank: rank));
  }
  rankedTracks.sort((a, b) => a.rank.compareTo(b.rank));

  return MusicSearchResults(
    artists: List.unmodifiable([
      for (final entry in rankedArtists) entry.artist,
    ]),
    tracks: List.unmodifiable([for (final entry in rankedTracks) entry.track]),
  );
}

/// The records of [kind] that can actually be queued.
///
/// A record still being processed by the publication workflow has no media URL
/// yet, and a tile that does nothing when tapped is worse than a tile that is
/// not there. Filtering once here means no screen has to remember the rule.
final playableMusicProvider =
    Provider.family<AsyncValue<List<PublishedReel>>, CollectionKind>((
      ref,
      kind,
    ) {
      final items = kind == CollectionKind.audiobooks
          ? ref.watch(audiobookCollectionProvider)
          : ref.watch(musicCollectionProvider);
      return items.whenData(
        (entries) => List<PublishedReel>.unmodifiable([
          for (final entry in entries)
            if (MusicTrack.fromReel(entry, kind: kind) != null) entry,
        ]),
      );
    });

/// Everybody in [kind], busiest first.
final musicArtistsProvider =
    Provider.family<List<MusicArtist>, CollectionKind>(
      (ref, kind) => groupArtists(
        ref.watch(playableMusicProvider(kind)).asData?.value ??
            const <PublishedReel>[],
      ),
    );

/// One artist by id, or null once their last record leaves the collection.
///
/// A family rather than something the screen holds, so that an artist page
/// stays live: publish another song while it is open and the track list grows
/// underneath, exactly as the collection screen behind it does.
final musicArtistProvider =
    Provider.family<MusicArtist?, ({CollectionKind kind, String id})>((
      ref,
      args,
    ) {
      for (final artist in ref.watch(musicArtistsProvider(args.kind))) {
        if (artist.id == args.id) return artist;
      }
      return null;
    });
