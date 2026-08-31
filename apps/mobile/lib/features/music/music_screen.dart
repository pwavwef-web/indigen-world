import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// The Music channel, as something you can actually listen to.
///
/// It replaces the old list of cards, which could only open one song at a time
/// on a screen whose player died the moment you left it. A grid of artwork with
/// a queue behind it is what the archive has needed since the first song was
/// published: the whole channel is one sitting, and walking away from the
/// screen does not end it.
///
/// Audiobooks come through here too. They are the same shape — one long audio
/// record with a transcript — and giving them a second, near-identical screen
/// would mean two players fighting over one set of speakers.
class MusicScreen extends ConsumerWidget {
  const MusicScreen({this.kind = CollectionKind.music, super.key});

  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = kind == CollectionKind.audiobooks
        ? ref.watch(audiobookCollectionProvider)
        : ref.watch(musicCollectionProvider);

    return Scaffold(
      appBar: AppBar(title: Text(kind.label)),
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
          data: (entries) {
            // Only what can actually be queued. A record still being processed
            // by the publication workflow has no media URL yet, and a tile that
            // does nothing when tapped is worse than a tile that is not there.
            final playable = [
              for (final entry in entries)
                if (MusicTrack.fromReel(entry, kind: kind) != null) entry,
            ];
            return CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: _Header(kind: kind, items: playable),
                ),
                if (playable.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _Empty(kind: kind),
                  ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    18,
                    4,
                    18,
                    24 + musicInset(context),
                  ),
                  sliver: SliverGrid.builder(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: 14,
                          mainAxisSpacing: 16,
                          childAspectRatio: 0.78,
                        ),
                    itemCount: playable.length,
                    itemBuilder: (context, index) => _TrackTile(
                      item: playable[index],
                      onPlay: () => ref
                          .read(musicControllerProvider.notifier)
                          .playCollection(
                            playable,
                            startIndex: index,
                            kind: kind,
                          ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.kind, required this.items});

  final CollectionKind kind;
  final List<PublishedReel> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(musicControllerProvider.notifier);
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 6, 18, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            kind == CollectionKind.audiobooks
                ? 'Listen, learn, and carry it forward.'
                : 'Hear the rhythm of home.',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          // The channel keeps its name when it is empty — that line is what the
          // Collection promised on the way in. Only the transport goes, because
          // there is nothing for it to start.
          if (items.isNotEmpty) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: () => controller.playCollection(
                    items,
                    startIndex: 0,
                    kind: kind,
                  ),
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: Text('Play all ${items.length}'),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  // Shuffle goes on before the queue is loaded, so the first
                  // song is already a shuffled one. Starting at track one and
                  // then shuffling would always open on the same song.
                  onPressed: () async {
                    await controller.toggleShuffle();
                    await controller.playCollection(
                      items,
                      startIndex: 0,
                      kind: kind,
                    );
                  },
                  icon: const Icon(Icons.shuffle_rounded),
                  label: const Text('Shuffle'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TrackTile extends ConsumerWidget {
  const _TrackTile({required this.item, required this.onPlay});

  final PublishedReel item;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final nowPlaying = ref.watch(musicMediaItemProvider).asData?.value;
    final isCurrent = nowPlaying?.id == item.id;
    final art = item.posterUrl;
    final fallback = ColoredBox(
      color: brand.surfaceMuted,
      child: Center(
        child: Icon(Icons.graphic_eq_rounded, color: brand.mutedInk),
      ),
    );

    return Semantics(
      button: true,
      label: 'Play ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPlay,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (art == null || art.isEmpty)
                      fallback
                    else
                      CachedNetworkImage(
                        imageUrl: art,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => fallback,
                        errorWidget: (_, _, _) => fallback,
                      ),
                    if (isCurrent)
                      Container(
                        color: Colors.black.withValues(alpha: 0.35),
                        child: Icon(
                          Icons.equalizer_rounded,
                          color: brand.gold,
                          size: 34,
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              item.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: isCurrent ? brand.accent : brand.ink,
                fontWeight: FontWeight.w800,
                fontSize: 13.5,
              ),
            ),
            Text(
              item.creatorName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
            ),
          ],
        ),
      ),
    );
  }
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
