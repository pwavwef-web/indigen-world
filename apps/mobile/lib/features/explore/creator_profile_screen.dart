import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// Everything one creator has published, reached by tapping their face on a
/// reel.
///
/// Explore used to be a dead end: the rail showed a creator's initials, the
/// avatar did nothing, and there was no way to follow somebody whose work you
/// had just watched or to find the rest of it. This is that way — their photo,
/// their other pieces, and a follow button that uses the same follow edges the
/// community feed already runs on.
class CreatorProfileScreen extends ConsumerWidget {
  const CreatorProfileScreen({
    required this.creatorId,
    this.fallbackName,
    this.fallbackAvatarUrl,
    super.key,
  });

  final String creatorId;

  /// What the reel already knew, shown while the profile read is in flight so
  /// the page opens with a name on it rather than a spinner.
  final String? fallbackName;
  final String? fallbackAvatarUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final member = ref.watch(communityProfileProvider(creatorId)).asData?.value;
    final works = ref.watch(creatorWorksProvider(creatorId));
    final counts = ref.watch(profileCountsProvider(creatorId)).asData?.value;

    final name = member?.displayName ?? fallbackName ?? 'Indigen World creator';
    final avatarUrl = member?.avatarUrl ?? fallbackAvatarUrl;

    return Scaffold(
      backgroundColor: context.brand.background,
      appBar: AppBar(
        backgroundColor: context.brand.background,
        surfaceTintColor: Colors.transparent,
        title: Text(
          name,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CommunityAvatar(
                initials: member?.initials ?? reelInitials(name),
                imageUrl: avatarUrl,
                size: 74,
                ringed: true,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        if (member?.isVerified ?? false) ...[
                          const SizedBox(width: 5),
                          Icon(
                            Icons.verified_rounded,
                            size: 17,
                            color: context.brand.success,
                          ),
                        ],
                      ],
                    ),
                    if (member != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        member.handle,
                        style: TextStyle(
                          color: context.brand.mutedInk,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        // A creator page is worth following even before the
                        // person has taken a community handle — the edge is
                        // keyed by their account, not by their profile.
                        FollowButton(targetUid: creatorId, dense: true),
                        if (member != null) ...[
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (context) =>
                                    CommunityProfileScreen(uid: creatorId),
                              ),
                            ),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 36),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                              ),
                              textStyle: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            child: const Text('Community'),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (member != null && member.bio.trim().isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              member.bio,
              style: const TextStyle(fontSize: 14.5, height: 1.5),
            ),
          ],
          const SizedBox(height: 16),
          _CreatorStats(
            works: works.asData?.value.length,
            followers: counts?.followers,
            following: counts?.following,
          ),
          const SizedBox(height: 22),
          Text(
            'PUBLISHED WORK',
            style: TextStyle(
              color: context.brand.terracotta,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 10),
          switch (works) {
            AsyncValue(:final value?) when value.isEmpty =>
              const CommunityEmptyState(
                icon: Icons.video_library_outlined,
                title: 'Nothing published yet',
                message:
                    'When this creator publishes to Explore, their work '
                    'appears here.',
              ),
            AsyncValue(:final value?) => _WorkGrid(works: value, name: name),
            AsyncValue(hasError: true) => const CommunityEmptyState(
              icon: Icons.cloud_off_rounded,
              title: 'Work unavailable',
              message: 'Check your connection and try again.',
            ),
            _ => Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(
                child: CircularProgressIndicator(color: context.brand.accent),
              ),
            ),
          },
        ],
      ),
    );
  }
}

class _CreatorStats extends StatelessWidget {
  const _CreatorStats({
    required this.works,
    required this.followers,
    required this.following,
  });

  final int? works;
  final int? followers;
  final int? following;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: BoxDecoration(
      gradient: BrandGradients.parchment(context.brand),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: context.brand.divider),
    ),
    child: Row(
      children: [
        _Stat(value: works, label: 'Published'),
        _Stat(value: followers, label: 'Followers'),
        _Stat(value: following, label: 'Following'),
      ],
    ),
  );
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final int? value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      children: [
        Text(
          // An em dash while the count is in flight, never a zero: a zero is a
          // claim, and we do not know it yet.
          value == null ? '—' : reelCountLabel(value!),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: TextStyle(
            color: context.brand.mutedInk,
            fontSize: 9.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
      ],
    ),
  );
}

class _WorkGrid extends StatelessWidget {
  const _WorkGrid({required this.works, required this.name});

  final List<PublishedReel> works;
  final String name;

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    padding: EdgeInsets.zero,
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 3,
      mainAxisSpacing: 5,
      crossAxisSpacing: 5,
      childAspectRatio: 9 / 15,
    ),
    itemCount: works.length,
    itemBuilder: (context, index) => _WorkTile(
      work: works[index],
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => _CreatorReelsScreen(
            reels: works.map(Reel.fromPublished).toList(growable: false),
            initialIndex: index,
            title: name,
          ),
        ),
      ),
    ),
  );
}

class _WorkTile extends StatelessWidget {
  const _WorkTile({required this.work, required this.onTap});

  final PublishedReel work;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final poster = work.posterUrl;
    final video = work.videoUrl;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (poster != null && poster.isNotEmpty)
              CachedNetworkImage(
                imageUrl: poster,
                fit: BoxFit.cover,
                placeholder: (context, url) => const VideoCoverPlaceholder(),
                errorWidget: (context, url, error) =>
                    const VideoCoverPlaceholder(),
              )
            else if (video != null)
              // No server-made poster: take the clip's own opening frame
              // rather than showing a tile that says nothing about the work.
              VideoCover(videoUrl: video)
            else
              const VideoCoverPlaceholder(),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0xCC000000)],
                  stops: [0.45, 1],
                ),
              ),
            ),
            if (work.isVideo)
              const Positioned(
                right: 6,
                top: 6,
                child: Icon(
                  Icons.play_circle_fill_rounded,
                  color: Colors.white70,
                  size: 20,
                ),
              ),
            Positioned(
              left: 7,
              right: 7,
              bottom: 7,
              child: Text(
                work.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10.5,
                  height: 1.25,
                  fontWeight: FontWeight.w800,
                  shadows: [Shadow(blurRadius: 6, color: Colors.black)],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One creator's work, played full-bleed with the same card Explore uses.
class _CreatorReelsScreen extends StatelessWidget {
  const _CreatorReelsScreen({
    required this.reels,
    required this.initialIndex,
    required this.title,
  });

  final List<Reel> reels;
  final int initialIndex;
  final String title;

  @override
  Widget build(BuildContext context) => NightTheme(
    child: Scaffold(
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
              Expanded(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    shadows: [Shadow(blurRadius: 14, color: Colors.black)],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
