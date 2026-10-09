import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_page_header.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// A handful of pieces under one name — everything filed as one kind of song.
///
/// The artist page's shape without the person: a coloured stage with a stack
/// of the pieces' sleeves on it, a play button that docks as the list scrolls,
/// and the list itself, numbered.
class MusicListScreen extends ConsumerWidget {
  const MusicListScreen({
    required this.title,
    required this.tracks,
    required this.kind,
    required this.color,
    super.key,
  });

  final String title;
  final List<PublishedReel> tracks;
  final CollectionKind kind;
  final Color color;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(musicControllerProvider.notifier);
    final covers = [
      for (final track in tracks)
        if (track.posterUrl?.isNotEmpty ?? false) track.posterUrl,
    ].take(3).toList();

    return Scaffold(
      body: EntranceGate(
        child: CustomScrollView(
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: MusicPageHeaderDelegate(
                title: title,
                subtitle:
                    '${tracks.length} '
                    '${tracks.length == 1 ? 'piece' : 'pieces'}',
                color: color,
                tracks: tracks,
                topPadding: MediaQuery.paddingOf(context).top,
                visual: _SleeveStack(covers: covers),
                onPlay: () => controller.playCollection(
                  tracks,
                  startIndex: 0,
                  kind: kind,
                ),
                onShuffle: () async {
                  await controller.toggleShuffle();
                  await controller.playCollection(
                    tracks,
                    startIndex: 0,
                    kind: kind,
                  );
                },
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.only(
                top: 8,
                bottom: 24 + musicInset(context),
              ),
              sliver: SliverList.builder(
                itemCount: tracks.length,
                itemBuilder: (context, index) => Entrance(
                  index: index,
                  child: MusicTrackRow(
                    item: tracks[index],
                    leadingNumber: index + 1,
                    accent: color,
                    onPlay: () => controller.playCollection(
                      tracks,
                      startIndex: index,
                      kind: kind,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Up to three sleeves fanned out, the way records lean in a crate.
class _SleeveStack extends StatelessWidget {
  const _SleeveStack({required this.covers});

  final List<String?> covers;

  @override
  Widget build(BuildContext context) {
    final shown = covers.isEmpty ? <String?>[null] : covers;
    return Stack(
      alignment: Alignment.center,
      children: [
        for (final (index, cover) in shown.indexed.toList().reversed)
          Transform.translate(
            offset: Offset((index - (shown.length - 1) / 2) * 26, index * -4),
            child: Transform.rotate(
              angle: (index - (shown.length - 1) / 2) * math.pi / 22,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.35),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: MusicArtwork(url: cover, size: 118, radius: 14),
              ),
            ),
          ),
      ],
    );
  }
}
