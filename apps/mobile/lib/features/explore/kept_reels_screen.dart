import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_engagement.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';

/// Everything the member has kept from Explore.
///
/// Keeps used to live only on the handset, which meant a reinstall or a second
/// phone lost them and there was no screen to see them on. They are edges now,
/// so this list is the same wherever the member signs in.
class KeptReelsScreen extends ConsumerWidget {
  const KeptReelsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kept = ref.watch(keptReelsProvider);
    final signedIn = ref.watch(currentUidProvider) != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Your keeps')),
      body: !signedIn
          ? CommunityEmptyState(
              icon: Icons.lock_outline_rounded,
              title: 'Sign in to keep reels',
              message:
                  'Keeping a reel remembers it against your account, so it '
                  'is still there on your next phone.',
              action: FilledButton(
                onPressed: () => CommunityActions(ref).requireSignIn(context),
                child: const Text('Sign in'),
              ),
            )
          : switch (kept) {
              AsyncValue(:final value?) when value.isEmpty =>
                const CommunityEmptyState(
                  icon: Icons.bookmark_border_rounded,
                  title: 'Nothing kept yet',
                  message:
                      'Tap Keep on any reel in Explore and it will be waiting '
                      'here.',
                ),
              AsyncValue(:final value?) => RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(keptReelsProvider);
                  await ref.read(keptReelsProvider.future);
                },
                child: GridView.builder(
                  padding: const EdgeInsets.all(14),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 9 / 13,
                  ),
                  itemCount: value.length,
                  itemBuilder: (context, index) => _KeptTile(
                    reel: value[index],
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) => _KeptReelsPlayer(
                          reels: value
                              .map(Reel.fromPublished)
                              .toList(growable: false),
                          initialIndex: index,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              AsyncValue(hasError: true) => const CommunityEmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'Keeps unavailable',
                message: 'Check your connection and try again.',
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
    );
  }
}

class _KeptTile extends StatelessWidget {
  const _KeptTile({required this.reel, required this.onTap});

  final PublishedReel reel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final poster = reel.posterUrl;
    final video = reel.videoUrl;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (poster != null && poster.isNotEmpty)
              Image.network(
                poster,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) =>
                    const VideoCoverPlaceholder(),
              )
            else if (video != null)
              VideoCover(videoUrl: video)
            else
              const VideoCoverPlaceholder(),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0xD9000000)],
                  stops: [0.4, 1],
                ),
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    reel.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      height: 1.2,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    reel.creatorName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _KeptReelsPlayer extends StatelessWidget {
  const _KeptReelsPlayer({required this.reels, required this.initialIndex});

  final List<Reel> reels;
  final int initialIndex;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: BrandColors.nightInk,
    body: ReelFeedView(
      reels: reels,
      initialIndex: initialIndex,
      header: Padding(
        padding: const EdgeInsets.fromLTRB(6, 4, 16, 0),
        child: Row(
          children: [
            IconButton(
              tooltip: 'Back',
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
            ),
            const Text(
              'YOUR KEEPS',
              style: TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.4,
                shadows: [Shadow(blurRadius: 14, color: Colors.black)],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
