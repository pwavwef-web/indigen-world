import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/share_text.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_likes.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/shared/glass_popup.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// What can be done with one song besides playing it: queue it, keep it,
/// pass it on.
///
/// Opened from a row's "More" button and by a long press anywhere on the row,
/// the two places every music app has taught people to look.
Future<void> showMusicTrackMenu(
  BuildContext context,
  WidgetRef ref, {
  required PublishedReel item,
  required CollectionKind kind,
}) {
  final brand = context.brand;
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: brand.surfaceElevated,
    sheetAnimationStyle: AnimationStyle(
      duration: motionOr(context, AppMotion.standard),
      reverseDuration: motionOr(context, AppMotion.quick),
    ),
    builder: (sheetContext) => _MusicTrackMenu(item: item, kind: kind),
  ).then((_) {});
}

class _MusicTrackMenu extends ConsumerWidget {
  const _MusicTrackMenu({required this.item, required this.kind});

  final PublishedReel item;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final liked = ref.watch(isSongLikedProvider(item.id));
    final hasQueue = ref.watch(musicHasQueueProvider);
    final controller = ref.read(musicControllerProvider.notifier);
    final root = Navigator.of(context, rootNavigator: true).context;

    void close() => Navigator.of(context).pop();

    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  if (item.creatorName.trim().isNotEmpty)
                    Text(
                      item.creatorName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: brand.mutedInk),
                    ),
                ],
              ),
            ),
            ListTile(
              key: const Key('music-menu-play-next'),
              leading: Icon(Icons.playlist_play_rounded, color: brand.accent),
              title: const Text('Play next'),
              subtitle: hasQueue
                  ? null
                  : const Text('Nothing is playing — plays now'),
              onTap: () {
                close();
                controller.playNext(item, kind: kind);
                if (hasQueue) showGlassToast(root, 'Plays next.');
              },
            ),
            ListTile(
              key: const Key('music-menu-add-to-queue'),
              leading: Icon(Icons.queue_music_rounded, color: brand.accent),
              title: const Text('Add to queue'),
              onTap: () {
                close();
                controller.addToQueue(item, kind: kind);
                if (hasQueue) showGlassToast(root, 'Added to the queue.');
              },
            ),
            ListTile(
              key: const Key('music-menu-like'),
              leading: Icon(
                liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color: liked ? brand.terracotta : brand.accent,
              ),
              title: Text(liked ? 'Remove from liked songs' : 'Like'),
              onTap: () async {
                close();
                final now = await toggleLikedSong(ref, item.id);
                if (root.mounted) {
                  showGlassToast(
                    root,
                    now
                        ? 'Added to your liked songs.'
                        : 'Removed from liked songs.',
                  );
                }
              },
            ),
            ListTile(
              key: const Key('music-menu-share'),
              leading: Icon(Icons.ios_share_rounded, color: brand.accent),
              title: const Text('Share'),
              onTap: () {
                close();
                shareText(
                  root,
                  collectionShareText(
                    title: item.title,
                    creator: item.creatorName,
                    kind: kind,
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}
