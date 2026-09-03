import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// The Music channel, as something you can actually listen to.
///
/// ── What changed, and why ─────────────────────────────────────────────────
/// It used to be one grid of every published song, ordered by whatever
/// Firestore returned. That is a directory, not a player: it answers "what is
/// in here" and nothing else. It cannot answer "everything by this singer",
/// "the song called Na", or "the thing I had on yesterday" — which are the
/// three questions anybody actually opens a music app with.
///
/// So the channel is now a library. The people who made the music are a shelf
/// of their own, because in an oral tradition the singer is at least as much
/// the point as the song. What you came back to is at the top, because a
/// player that opens identically on the hundredth visit is one nobody makes a
/// habit of. And everything else is a list you can read rather than a wall of
/// squares — a hundred song titles in a grid is a hundred songs nobody can
/// find.
///
/// Audiobooks come through here too. They are the same shape — one long audio
/// record with a transcript — and giving them a second, near-identical screen
/// would mean two players fighting over one set of speakers.
class MusicScreen extends ConsumerWidget {
  const MusicScreen({this.kind = CollectionKind.music, super.key});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(playableMusicProvider(kind));

    return Scaffold(
      appBar: AppBar(
        title: Text(kind.label),
        actions: [
          IconButton(
            tooltip: 'Search',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => MusicSearchScreen(kind: kind),
              ),
            ),
            icon: const Icon(Icons.search_rounded),
          ),
        ],
      ),
      body: ScreenContainer(
        child: items.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, _) => _Unavailable(
            onRetry: () => ref.invalidate(
              kind == CollectionKind.audiobooks
                  ? audiobookCollectionProvider
                  : musicCollectionProvider,
            ),
          ),
          data: (playable) => _Library(kind: kind, items: playable),
        ),
      ),
    );
  }
}

class _Library extends ConsumerWidget {
  const _Library({required this.kind, required this.items});

  final CollectionKind kind;
  final List<PublishedReel> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(musicControllerProvider.notifier);
    final artists = ref.watch(musicArtistsProvider(kind));
    final recent = resolveRecent(ref.watch(recentlyPlayedProvider), items);

    Future<void> play(List<PublishedReel> queue, int index) =>
        controller.playCollection(queue, startIndex: index, kind: kind);

    void openArtist(MusicArtist artist) => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            MusicArtistScreen(artistId: artist.id, kind: kind),
      ),
    );

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  kind == CollectionKind.audiobooks
                      ? 'Listen, learn, and carry it forward.'
                      : 'Hear the rhythm of home.',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                // The channel keeps its name when it is empty — that line is
                // what the Collection promised on the way in. Only the
                // transport goes, because there is nothing for it to start.
                if (items.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  MusicTransportRow(
                    count: items.length,
                    onPlayAll: () => play(items, 0),
                    onShuffle: () async {
                      await controller.toggleShuffle();
                      await play(items, 0);
                    },
                  ),
                ],
              ],
            ),
          ),
        ),

        if (items.isEmpty)
          SliverFillRemaining(hasScrollBody: false, child: _Empty(kind: kind)),

        // What they came back for, first. Only when there is something to
        // show: an empty shelf labelled "Jump back in" is a promise the app
        // has not kept yet.
        if (recent.isNotEmpty) ...[
          const SliverToBoxAdapter(
            child: MusicSectionHeader(title: 'Jump back in'),
          ),
          SliverToBoxAdapter(
            child: _Shelf(
              children: [
                for (final item in recent)
                  MusicShelfCard(
                    item: item,
                    // The shelf plays *the shelf*, not the whole archive:
                    // somebody who taps what they were listening to yesterday
                    // is asking for that sitting back, not for the collection
                    // in publication order.
                    onPlay: () => play(recent, recent.indexOf(item)),
                  ),
              ],
            ),
          ),
        ],

        // The people. Above the songs, deliberately — the name under a
        // recording is the thing a listener reaches for next, and in a
        // tradition carried by singers the singer is not metadata.
        if (artists.length > 1) ...[
          SliverToBoxAdapter(
            child: MusicSectionHeader(
              title: 'Artists',
              onSeeAll: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => MusicSearchScreen(kind: kind),
                ),
              ),
              seeAllLabel: 'Browse',
            ),
          ),
          SliverToBoxAdapter(
            child: _Shelf(
              height: 148,
              children: [
                for (final artist in artists.take(12))
                  MusicArtistCircle(
                    artist: artist,
                    onOpen: () => openArtist(artist),
                  ),
              ],
            ),
          ),
        ],

        if (items.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: MusicSectionHeader(
              title: kind == CollectionKind.audiobooks
                  ? 'Every reading'
                  : 'Every song',
            ),
          ),
          SliverPadding(
            padding: EdgeInsets.only(bottom: 24 + musicInset(context)),
            sliver: SliverList.builder(
              itemCount: items.length,
              itemBuilder: (context, index) => MusicTrackRow(
                item: items[index],
                onPlay: () => play(items, index),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// A horizontally scrolling row of cards.
///
/// Fixed height rather than intrinsic, because a shelf whose height is decided
/// by its tallest child jumps every time a longer title loads in.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.children, this.height = 186});

  final List<Widget> children;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(width: 14),
      itemBuilder: (context, index) => children[index],
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.kind});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Text(
        kind == CollectionKind.audiobooks
            ? 'Audiobooks are ready for their first published piece'
            : 'Music is ready for its first published piece',
        textAlign: TextAlign.center,
        style: TextStyle(color: context.brand.mutedInk),
      ),
    ),
  );
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'That could not be loaded.',
          style: TextStyle(color: context.brand.mutedInk),
        ),
        const SizedBox(height: 10),
        OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    ),
  );
}
