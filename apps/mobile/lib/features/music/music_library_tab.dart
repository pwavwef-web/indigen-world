import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// What this member has made of the channel: what they have been listening
/// to, and what they keep on the phone.
///
/// ── Why it shows only what exists ─────────────────────────────────────────
/// There are no *Liked* or *Playlists* sections here yet, and there will not
/// be empty ones waiting for them. A library full of headings over nothing is
/// a library that tells a new member they are doing it wrong. Until they have
/// played something, the tab says what will land here and nothing more.
class MusicLibraryTab extends ConsumerWidget {
  const MusicLibraryTab({
    required this.kind,
    required this.accent,
    this.scrollController,
    super.key,
  });

  final CollectionKind kind;
  final Color accent;
  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final items =
        ref.watch(playableMusicProvider(kind)).asData?.value ??
        const <PublishedReel>[];
    final recent = resolveRecent(ref.watch(recentlyPlayedProvider), items);
    final offlineIds = ref.watch(musicOfflineIdsProvider);
    final offline = [
      for (final item in items)
        if (offlineIds.contains(item.id)) item,
    ];
    final downloadsAllowed = ref.watch(downloadsAllowedProvider);
    final controller = ref.read(musicControllerProvider.notifier);

    Future<void> play(List<PublishedReel> queue, int index) =>
        controller.playCollection(queue, startIndex: index, kind: kind);

    return CustomScrollView(
      controller: scrollController,
      slivers: [
        const MusicTabAppBar(title: 'Library'),
        if (recent.isEmpty && offline.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: GlassEmptyState(
                  icon: Icons.library_music_rounded,
                  color: accent,
                  title:
                      'What you play lands here, so the next time is one '
                      'tap away.',
                ),
              ),
            ),
          ),
        if (recent.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Row(
              children: [
                const Expanded(
                  child: MusicSectionHeader(
                    title: 'Recently played',
                    eyebrow: 'On this phone only',
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(right: 10, top: 20),
                  child: TextButton(
                    onPressed: () =>
                        ref.read(recentlyPlayedProvider.notifier).clear(),
                    child: const Text('Clear'),
                  ),
                ),
              ],
            ),
          ),
          SliverList.builder(
            itemCount: recent.length,
            itemBuilder: (context, index) => Entrance(
              index: index,
              child: MusicTrackRow(
                item: recent[index],
                accent: accent,
                onPlay: () => play(recent, index),
              ),
            ),
          ),
        ],
        if (offline.isNotEmpty) ...[
          const SliverToBoxAdapter(
            child: MusicSectionHeader(
              title: 'Kept on this phone',
              eyebrow: 'Plays with no signal',
            ),
          ),
          SliverList.builder(
            itemCount: offline.length,
            itemBuilder: (context, index) => MusicTrackRow(
              item: offline[index],
              accent: accent,
              onPlay: () => play(offline, index),
            ),
          ),
        ],
        if (downloadsAllowed)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
              child: PressScale(
                child: OutlinedButton.icon(
                  onPressed: () => GoRouter.of(context).push('/downloads'),
                  icon: Icon(Icons.download_for_offline_rounded, color: accent),
                  label: Text(
                    'Manage downloads',
                    style: TextStyle(color: brand.ink),
                  ),
                ),
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }
}
