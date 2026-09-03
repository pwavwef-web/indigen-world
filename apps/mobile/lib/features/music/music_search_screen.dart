import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// Find a song, or the person who made it.
///
/// ── Why the search is local ───────────────────────────────────────────────
/// The collection is already streamed and already in memory — it is what draws
/// the screen behind this one. Matching against that list costs nothing, works
/// with no signal, and answers on the keystroke rather than after a round trip
/// somebody is paying for by the megabyte. A server-side search becomes worth
/// its cost when the archive is too large to hold, and the honest answer today
/// is that it is not.
class MusicSearchScreen extends ConsumerStatefulWidget {
  const MusicSearchScreen({this.kind = CollectionKind.music, super.key});

  final CollectionKind kind;

  @override
  ConsumerState<MusicSearchScreen> createState() => _MusicSearchScreenState();
}

class _MusicSearchScreenState extends ConsumerState<MusicSearchScreen> {
  final _controller = TextEditingController();
  var _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final kind = widget.kind;
    final tracks =
        ref.watch(playableMusicProvider(kind)).asData?.value ?? const [];
    final artists = ref.watch(musicArtistsProvider(kind));
    final results = searchMusicLibrary(
      tracks: tracks,
      artists: artists,
      query: _query,
    );
    final player = ref.read(musicControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: (value) => setState(() => _query = value),
          decoration: InputDecoration(
            border: InputBorder.none,
            hintText: kind == CollectionKind.audiobooks
                ? 'Readings, readers'
                : 'Songs, artists',
            hintStyle: TextStyle(color: brand.faintInk),
          ),
          style: TextStyle(color: brand.ink, fontSize: 16),
        ),
        actions: [
          if (_query.isNotEmpty)
            IconButton(
              tooltip: 'Clear',
              onPressed: () {
                _controller.clear();
                setState(() => _query = '');
              },
              icon: const Icon(Icons.close_rounded),
            ),
        ],
      ),
      body: _query.trim().isEmpty
          ? _Prompt(kind: kind, artists: artists)
          : results.isEmpty
          ? _NoResults(query: _query)
          : ListView(
              padding: EdgeInsets.only(bottom: 24 + musicInset(context)),
              children: [
                if (results.artists.isNotEmpty) ...[
                  const MusicSectionHeader(title: 'Artists'),
                  for (final artist in results.artists.take(6))
                    _ArtistRow(
                      artist: artist,
                      onOpen: () => _openArtist(artist),
                    ),
                ],
                if (results.tracks.isNotEmpty) ...[
                  MusicSectionHeader(
                    title: kind == CollectionKind.audiobooks
                        ? 'Readings'
                        : 'Songs',
                  ),
                  for (final (index, track) in results.tracks.indexed)
                    MusicTrackRow(
                      item: track,
                      // The queue is the result list, so playing the third
                      // result and letting it run plays the rest of what was
                      // searched for rather than jumping back to the archive.
                      onPlay: () => player.playCollection(
                        results.tracks,
                        startIndex: index,
                        kind: kind,
                      ),
                    ),
                ],
              ],
            ),
    );
  }

  void _openArtist(MusicArtist artist) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (context) =>
          MusicArtistScreen(artistId: artist.id, kind: widget.kind),
    ),
  );
}

/// One artist as a list row, for results rather than for a shelf.
class _ArtistRow extends StatelessWidget {
  const _ArtistRow({required this.artist, required this.onOpen});

  final MusicArtist artist;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return ListTile(
      onTap: onOpen,
      leading: MusicArtwork(
        url: artist.imageUrl,
        size: 46,
        circle: true,
        initial: artist.initial,
      ),
      title: Text(
        artist.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: brand.ink,
          fontSize: 14.5,
          fontWeight: FontWeight.w700,
        ),
      ),
      subtitle: Text(
        '${artist.trackCount} ${artist.trackCount == 1 ? 'piece' : 'pieces'}',
        style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
      ),
      trailing: Icon(Icons.chevron_right_rounded, color: brand.faintInk),
    );
  }
}

/// The empty search: the artists, as something to tap rather than a blank page.
class _Prompt extends StatelessWidget {
  const _Prompt({required this.kind, required this.artists});

  final CollectionKind kind;
  final List<MusicArtist> artists;

  @override
  Widget build(BuildContext context) {
    if (artists.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'Nothing is published here yet to search.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.brand.mutedInk),
          ),
        ),
      );
    }
    return ListView(
      padding: EdgeInsets.only(bottom: 24 + musicInset(context)),
      children: [
        const MusicSectionHeader(title: 'Browse by artist'),
        for (final artist in artists)
          _ArtistRow(
            artist: artist,
            onOpen: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) =>
                    MusicArtistScreen(artistId: artist.id, kind: kind),
              ),
            ),
          ),
      ],
    );
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Nothing here matches “${query.trim()}”.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: context.brand.ink,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'The archive only holds what has been published to it. If you know '
            'the piece, it may be waiting for somebody to contribute it.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.brand.mutedInk, fontSize: 13),
          ),
        ],
      ),
    ),
  );
}
