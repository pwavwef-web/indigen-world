import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/edit_community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/community/widgets/verified_badge.dart';
import 'package:indigen_world_mobile/features/subscriptions/data/subscription_catalog.dart';
import 'package:indigen_world_mobile/features/subscriptions/widgets/supporter_badge.dart';

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
        AsyncValue(hasValue: true) when profile == null =>
          const _MissingProfile(),
        AsyncValue(hasValue: true) => _ProfileBody(
          profile: profile!,
          tab: _tab,
          onTabChanged: (value) => setState(() => _tab = value),
        ),
        AsyncValue(hasError: true) => Scaffold(
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
          expandedHeight: _kBannerHeight,
          backgroundColor: context.brand.background,
          surfaceTintColor: Colors.transparent,
          title: Text(
            profile.displayName,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
          ),
          // The avatar rides in the app bar rather than in the header sliver
          // below it. Slivers paint in list order with the first on top, so an
          // avatar drawn in the header and merely nudged upwards was painted
          // over by the cover it was supposed to be sitting on. Up here it
          // overhangs the bar's own bottom edge and lands on top of the
          // picture, which is the way round somebody expects.
          flexibleSpace: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: FlexibleSpaceBar(background: _Banner(profile: profile)),
              ),
              Positioned(
                left: _kProfileGutter,
                bottom: -_kAvatarOverhang,
                child: _HeaderAvatar(profile: profile),
              ),
            ],
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

/// The cover's height, and how the avatar sits against its bottom edge.
///
/// [_kAvatarLift] is the part of the avatar that overlaps the cover; the rest
/// hangs below it, into the header. Named because two widgets in two different
/// slivers have to agree on them — the app bar that draws the avatar, and the
/// header that reserves the room it is no longer taking.
const double _kBannerHeight = 116;
const double _kProfileGutter = 18;
const double _kAvatarBox = 80;
const double _kAvatarLift = 22;
const double _kAvatarOverhang = _kAvatarBox - _kAvatarLift;

/// The member's face, overhanging the cover.
///
/// It fades out as the bar collapses. Pinned to the bar's bottom edge, it
/// tracks the header exactly while the bar is still shrinking — but once the
/// bar is down to its toolbar it stops moving, and an avatar left hanging there
/// over somebody's posts is chrome nobody asked for. By then this has already
/// gone.
class _HeaderAvatar extends StatelessWidget {
  const _HeaderAvatar({required this.profile});

  final CommunityProfile profile;

  @override
  Widget build(BuildContext context) {
    final settings = context
        .dependOnInheritedWidgetOfExactType<FlexibleSpaceBarSettings>();
    // How far open the bar is: 1 fully expanded, 0 down to its toolbar. Read
    // from the settings the app bar publishes rather than from a scroll
    // controller, because this is drawn inside the bar being measured.
    var expanded = 1.0;
    if (settings != null) {
      final range = settings.maxExtent - settings.minExtent;
      if (range > 0) {
        expanded = ((settings.currentExtent - settings.minExtent) / range)
            .clamp(0.0, 1.0);
      }
    }
    // Solid for the first stretch of the collapse, then out well before the
    // bar reaches its toolbar.
    final opacity = ((expanded - 0.25) / 0.45).clamp(0.0, 1.0);
    if (opacity == 0) return const SizedBox.shrink();
    return Opacity(
      opacity: opacity,
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: context.brand.background,
        ),
        child: CommunityAvatar(
          initials: profile.initials,
          imageUrl: profile.avatarUrl,
          username: profile.username,
          size: _kAvatarBox - 6,
        ),
      ),
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
              // The avatar itself is drawn by the app bar, one sliver up, so
              // that the cover cannot paint over it. This holds the space it
              // would have taken, which is what keeps the buttons opposite on
              // the line they have always been on.
              const SizedBox(width: _kAvatarBox, height: _kAvatarBox),
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
              else ...[
                // A profile you cannot write to is a wall of numbers. The
                // message button is the one action that turns reading about
                // somebody into talking to them.
                IconButton.outlined(
                  tooltip: 'Message ${profile.displayName}',
                  onPressed: () => openChatWith(context, ref, profile),
                  style: IconButton.styleFrom(
                    minimumSize: const Size(44, 44),
                    foregroundColor: context.brand.accent,
                  ),
                  icon: const Icon(Icons.mail_outline_rounded, size: 19),
                ),
                const SizedBox(width: 8),
                FollowButton(targetUid: profile.uid),
              ],
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
                    if (profile.mark != VerifiedMark.none) ...[
                      const SizedBox(width: 6),
                      VerifiedBadge(mark: profile.mark, size: 18),
                    ],
                    // Its own condition, not nested inside the verification
                    // one: a supporter who has not verified a number still
                    // paid, and hiding their mark behind somebody else's
                    // check would be the wrong way round.
                    if (profile.supporterMark != SupporterMark.none) ...[
                      const SizedBox(width: 4),
                      SupporterBadge(mark: profile.supporterMark, size: 18),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  profile.handle,
                  style: TextStyle(
                    color: context.brand.mutedInk,
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
      color: context.brand.accent.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: context.brand.accent),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: context.brand.accent,
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
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: context.brand.ink,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: context.brand.mutedInk,
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
    decoration: BoxDecoration(
      border: Border(bottom: BorderSide(color: context.brand.divider)),
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
                            ? context.brand.accent
                            : context.brand.mutedInk,
                      ),
                    ),
                    const SizedBox(height: 7),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      height: 3,
                      width: selected == index ? 26 : 0,
                      decoration: BoxDecoration(
                        color: context.brand.gold,
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
      AsyncValue(:final value?) when value.isEmpty => ListView(
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
      AsyncValue(:final value?) => ListView.builder(
        padding: const EdgeInsets.only(bottom: 40),
        itemCount: value.length,
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
      AsyncValue(hasError: true) => ListView(
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
