import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/edit_community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';

/// A member's community profile: cover, identity, counts and their posts,
/// replies, media and appreciated posts.
class CommunityProfileScreen extends ConsumerStatefulWidget {
  const CommunityProfileScreen({required this.uid, super.key});

  final String uid;

  @override
  ConsumerState<CommunityProfileScreen> createState() =>
      _CommunityProfileScreenState();
}

class _CommunityProfileScreenState
    extends ConsumerState<CommunityProfileScreen> {
  var _tab = 0;

  @override
  Widget build(BuildContext context) {
    final profileState = ref.watch(communityProfileProvider(widget.uid));
    final profile = profileState.asData?.value;

    return Scaffold(
      body: switch (profileState) {
        AsyncData() when profile == null => const _MissingProfile(),
        AsyncData() => _ProfileBody(
          profile: profile!,
          tab: _tab,
          onTabChanged: (value) => setState(() => _tab = value),
        ),
        AsyncError() => Scaffold(
          appBar: AppBar(),
          body: const CommunityEmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Profile unavailable',
            message: 'Check your connection and try again.',
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _MissingProfile extends StatelessWidget {
  const _MissingProfile();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(),
    body: const CommunityEmptyState(
      icon: Icons.person_off_outlined,
      title: 'No community profile',
      message: 'This member has not joined the community feed yet.',
    ),
  );
}

class _ProfileBody extends ConsumerWidget {
  const _ProfileBody({
    required this.profile,
    required this.tab,
    required this.onTabChanged,
  });

  final CommunityProfile profile;
  final int tab;
  final ValueChanged<int> onTabChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actions = CommunityActions(ref);
    final myUid = ref.watch(currentUidProvider);
    final isMe = myUid == profile.uid;

    return NestedScrollView(
      headerSliverBuilder: (context, innerScrolled) => [
        SliverAppBar(
          pinned: true,
          expandedHeight: 116,
          backgroundColor: BrandColors.plasterCream,
          surfaceTintColor: Colors.transparent,
          title: Text(
            profile.displayName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
          flexibleSpace: FlexibleSpaceBar(
            background: _Banner(profile: profile),
          ),
        ),
        SliverToBoxAdapter(
          child: _ProfileHeader(profile: profile, isMe: isMe),
        ),
        SliverToBoxAdapter(
          child: _ProfileTabs(selected: tab, onChanged: onTabChanged),
        ),
      ],
      body: _ProfileTabContent(uid: profile.uid, tab: tab, actions: actions),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.profile});

  final CommunityProfile profile;

  @override
  Widget build(BuildContext context) => profile.bannerUrl != null
      ? CachedNetworkImage(
          imageUrl: profile.bannerUrl!,
          fit: BoxFit.cover,
          placeholder: (context, url) => const _BannerPlaceholder(),
          errorWidget: (context, url, error) => const _BannerPlaceholder(),
        )
      : const _BannerPlaceholder();
}

class _BannerPlaceholder extends StatelessWidget {
  const _BannerPlaceholder();

  @override
  Widget build(BuildContext context) => const DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          BrandColors.heritageGreen,
          BrandColors.savannahGreen,
          BrandColors.kenteGold,
        ],
      ),
    ),
    child: Align(
      alignment: Alignment.bottomRight,
      child: Padding(
        padding: EdgeInsets.only(right: 18, bottom: 6),
        child: Opacity(
          opacity: 0.18,
          child: Text('✣', style: TextStyle(fontSize: 76, color: Colors.white)),
        ),
      ),
    ),
  );
}

class _ProfileHeader extends ConsumerWidget {
  const _ProfileHeader({required this.profile, required this.isMe});

  final CommunityProfile profile;
  final bool isMe;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = ref.watch(profileCountsProvider(profile.uid)).asData?.value;

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Transform.translate(
                offset: const Offset(0, -22),
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: BrandColors.plasterCream,
                  ),
                  child: CommunityAvatar(
                    initials: profile.initials,
                    imageUrl: profile.avatarUrl,
                    size: 74,
                  ),
                ),
              ),
              const Spacer(),
              if (isMe)
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (context) =>
                          EditCommunityProfileScreen(profile: profile),
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    textStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit profile'),
                )
              else
                FollowButton(targetUid: profile.uid),
            ],
          ),
          Transform.translate(
            offset: const Offset(0, -10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        profile.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                    ),
                    if (profile.isVerified) ...[
                      const SizedBox(width: 6),
                      const Icon(
                        Icons.verified_rounded,
                        size: 18,
                        color: BrandColors.savannahGreen,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  profile.handle,
                  style: const TextStyle(
                    color: BrandColors.mutedInk,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (profile.bio.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(
                    profile.bio,
                    style: const TextStyle(fontSize: 14.5, height: 1.45),
                  ),
                ],
                if (profile.location.isNotEmpty ||
                    profile.dialect.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      if (profile.location.isNotEmpty)
                        StatusPillChip(
                          icon: Icons.place_outlined,
                          label: profile.location,
                        ),
                      if (profile.dialect.isNotEmpty)
                        StatusPillChip(
                          icon: Icons.record_voice_over_outlined,
                          label: profile.dialect,
                        ),
                    ],
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    _CountChip(
                      value: counts?.posts,
                      label: 'Posts',
                      onTap: null,
                    ),
                    const SizedBox(width: 18),
                    _CountChip(
                      value: counts?.following,
                      label: 'Following',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) => PeopleListScreen(
                            uid: profile.uid,
                            mode: PeopleListMode.following,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 18),
                    _CountChip(
                      value: counts?.followers,
                      label: 'Followers',
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (context) => PeopleListScreen(
                            uid: profile.uid,
                            mode: PeopleListMode.followers,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Small icon + label pill used for a member's location and dialect.
class StatusPillChip extends StatelessWidget {
  const StatusPillChip({required this.icon, required this.label, super.key});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: BrandColors.heritageGreen.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: BrandColors.heritageGreen),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            color: BrandColors.heritageGreen,
            fontSize: 11.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class _CountChip extends StatelessWidget {
  const _CountChip({
    required this.value,
    required this.label,
    required this.onTap,
  });

  final int? value;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(8),
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value == null ? '—' : communityCountLabel(value!),
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: BrandColors.ink,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              color: BrandColors.mutedInk,
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}

class _ProfileTabs extends StatelessWidget {
  const _ProfileTabs({required this.selected, required this.onChanged});

  final int selected;
  final ValueChanged<int> onChanged;

  static const _labels = ['Posts', 'Replies', 'Media', 'Appreciated'];

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: BrandColors.divider)),
    ),
    child: Row(
      children: [
        for (var index = 0; index < _labels.length; index++)
          Expanded(
            child: InkWell(
              onTap: () => onChanged(index),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 13),
                child: Column(
                  children: [
                    Text(
                      _labels[index],
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: selected == index
                            ? FontWeight.w900
                            : FontWeight.w600,
                        color: selected == index
                            ? BrandColors.heritageGreen
                            : BrandColors.mutedInk,
                      ),
                    ),
                    const SizedBox(height: 7),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      height: 3,
                      width: selected == index ? 26 : 0,
                      decoration: BoxDecoration(
                        color: BrandColors.kenteGold,
                        borderRadius: BorderRadius.circular(999),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _ProfileTabContent extends ConsumerWidget {
  const _ProfileTabContent({
    required this.uid,
    required this.tab,
    required this.actions,
  });

  final String uid;
  final int tab;
  final CommunityActions actions;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final posts = switch (tab) {
      1 => ref.watch(authorRepliesProvider(uid)),
      2 => ref.watch(authorMediaProvider(uid)),
      3 => ref.watch(authorLikesProvider(uid)),
      _ => ref.watch(authorPostsProvider(uid)),
    };
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final reposts =
        ref.watch(myRepostsProvider).asData?.value ?? const <String>{};
    final pollVotes =
        ref.watch(myPollVotesProvider).asData?.value ??
        const <String, String>{};
    final currentUid = ref.watch(currentUidProvider);

    return switch (posts) {
      AsyncData(:final value) when value.isEmpty => ListView(
        children: [
          CommunityEmptyState(
            icon: Icons.inbox_outlined,
            title: 'Nothing here yet',
            message: switch (tab) {
              1 => 'Replies this member writes will show up here.',
              2 => 'Photos and reels appear here once they are posted.',
              3 => 'Posts this member appreciates gather here.',
              _ => 'Posts appear here once they are published.',
            },
          ),
        ],
      ),
      AsyncData(:final value) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 40),
        itemCount: value.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final post = value[index];
          return CommunityPostCard(
            post: post,
            liked: likes.contains(post.id),
            saved: saved.contains(post.id),
            reposted: reposts.contains(post.id),
            votedOptionId: pollVotes[post.id],
            onLike: () => actions.toggleLike(context, post),
            onRepost: () => actions.toggleRepost(context, post),
            onQuote: () => actions.quote(context, post),
            onSave: () => actions.toggleSave(context, post),
            onShare: () => actions.share(context, post),
            onViews: currentUid == post.authorId
                ? () => actions.openEngagement(context, post)
                : null,
            onVote: (optionId) => actions.vote(context, post, optionId),
            onPollVotes: currentUid == post.authorId && post.hasPoll
                ? () => actions.openEngagement(
                    context,
                    post,
                    initialKind: CommunityEngagementKind.pollVotes,
                  )
                : null,
            onReply: () => actions.reply(context, post),
            onMore: () => actions.showPostMenu(context, post),
            onOpen: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => PostDetailScreen(postId: post.id),
              ),
            ),
            onOpenQuoted: post.quotedPostId == null
                ? null
                : () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (context) =>
                          PostDetailScreen(postId: post.quotedPostId!),
                    ),
                  ),
            onOpenAuthor: () {},
            onOpenHandle: (handle) => actions.openHandle(context, handle),
            onOpenLink: (url) => actions.openLink(context, url),
          );
        },
      ),
      AsyncError() => ListView(
        children: const [
          CommunityEmptyState(
            icon: Icons.cloud_off_rounded,
            title: 'Could not load',
            message: 'Check your connection and try again.',
          ),
        ],
      ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }
}
