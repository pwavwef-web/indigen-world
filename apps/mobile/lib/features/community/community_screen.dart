import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/community_actions.dart';
import 'package:indigen_world_mobile/features/community/community_profile_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/data/community_repository.dart';
import 'package:indigen_world_mobile/features/community/people_screen.dart';
import 'package:indigen_world_mobile/features/community/post_detail_screen.dart';
import 'package:indigen_world_mobile/features/community/saved_posts_screen.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_post_card.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_sidebar.dart';
import 'package:indigen_world_mobile/features/community/widgets/people_widgets.dart';
import 'package:indigen_world_mobile/features/notifications/data/notification_providers.dart';
import 'package:indigen_world_mobile/features/notifications/notifications_screen.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// The community tab: a live Firestore feed of Kasem posts with the pulse rail,
/// composer, For you / Following switch and the full post interactions.
class CommunityScreen extends ConsumerStatefulWidget {
  const CommunityScreen({super.key});

  @override
  ConsumerState<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  var _tab = 0;
  final _viewedPostIds = <String>{};

  /// The community tab has no app bar of its own, so the hamburger sits in the
  /// feed's own header and needs a handle on the Scaffold to open the drawer.
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  Object? _loggedFeedFailure;

  @override
  void dispose() {
    // Flushes and cancels VisibilityDetector's coalescing timer. Besides
    // avoiding a delayed callback after navigation, this makes the final
    // impression deterministic when the feed is removed quickly.
    VisibilityDetectorController.instance.notifyNow();
    super.dispose();
  }

  void _trackVisiblePost(
    CommunityPost post,
    double visibleFraction,
    CommunityActions actions,
  ) {
    // A post stays marked as seen even when its write fails. Impressions are
    // telemetry, and a card that keeps drifting past the threshold must not
    // turn a permanently refused write into an endless retry.
    if (visibleFraction < 0.55 || !_viewedPostIds.add(post.id)) return;
    actions.trackView(post);
  }

  /// The screen keeps its language calm, so the real Firestore code and message
  /// go to the log instead — that is what turns "the feed could not load" into
  /// a diagnosis in seconds. One line per distinct failure is enough.
  void _noteFeedFailure(Object error) {
    if (identical(_loggedFeedFailure, error)) return;
    _loggedFeedFailure = error;
    debugPrint('Community feed unavailable: $error');
  }

  @override
  Widget build(BuildContext context) {
    final actions = CommunityActions(ref);
    final feed = _tab == 0
        ? ref.watch(communityFeedProvider)
        : ref.watch(followingFeedProvider);
    if (feed case AsyncError(:final error)) _noteFeedFailure(error);
    final likes = ref.watch(myLikesProvider).asData?.value ?? const <String>{};
    final saved =
        ref.watch(myBookmarksProvider).asData?.value ?? const <String>{};
    final reposts =
        ref.watch(myRepostsProvider).asData?.value ?? const <String>{};
    final pollVotes =
        ref.watch(myPollVotesProvider).asData?.value ??
        const <String, String>{};
    final currentUid = ref.watch(currentUidProvider);

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: Colors.transparent,
      drawer: const CommunitySidebar(),
      // The shell extends its body behind the floating glass rail, so the FAB
      // is lifted clear of it.
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(
          bottom: kFrostedNavBarReservedSpace - 24,
        ),
        child: FloatingActionButton(
          heroTag: 'community-compose',
          tooltip: 'New Kasem post',
          onPressed: () => actions.compose(context),
          backgroundColor: context.brand.accentFill,
          foregroundColor: context.brand.onAccentFill,
          child: const Icon(Icons.edit_rounded),
        ),
      ),
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(rawCommunityFeedProvider)
              ..invalidate(rawFollowingFeedProvider)
              ..invalidate(followingIdsProvider)
              ..invalidate(suggestedProfilesProvider);
            await ref.read(suggestedProfilesProvider.future);
          },
          child: CustomScrollView(
            key: const PageStorageKey('community-scroll'),
            // An empty or short feed still has to accept the refresh gesture.
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _CommunityHeader(
                  onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
                ),
              ),
              const SliverToBoxAdapter(child: _CommunityPulse()),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: _ComposeBar(onTap: () => actions.compose(context)),
                ),
              ),
              SliverToBoxAdapter(
                child: _FeedTabs(
                  selected: _tab,
                  onChanged: (value) => setState(() => _tab = value),
                ),
              ),
              // Matched on what the state HOLDS rather than on which class it
              // is. Riverpod retries a failed provider, and while a retry is
              // in flight the state is `AsyncLoading` *carrying* the error
              // rather than `AsyncError` — so matching the class alone made
              // the feed flash the skeleton back between attempts, and then
              // the error, and then the skeleton again. A page we already have
              // also outranks a reconnect: Firestore recovers on its own, and
              // a reader would rather see slightly stale posts than a spinner.
              ...switch (feed) {
                AsyncValue(:final value?) when value.isEmpty => [
                  SliverToBoxAdapter(
                    child: _EmptyFeed(tab: _tab, actions: actions),
                  ),
                ],
                AsyncValue(:final value?) => [
                  // Full-bleed rows: the feed is a single column of writing
                  // separated by hairlines, so there is no gutter to inset
                  // and no gap between one post and the next.
                  SliverPadding(
                    padding: const EdgeInsets.only(
                      bottom: kFrostedNavBarReservedSpace + 60,
                    ),
                    sliver: SliverList.builder(
                      itemCount: value.length,
                      itemBuilder: (context, index) => VisibilityDetector(
                        key: Key('community-post-${value[index].id}-$index'),
                        onVisibilityChanged: (info) => _trackVisiblePost(
                          value[index],
                          info.visibleFraction,
                          actions,
                        ),
                        child: _FeedPost(
                          post: value[index],
                          liked: likes.contains(value[index].id),
                          saved: saved.contains(value[index].id),
                          reposted: reposts.contains(value[index].id),
                          votedOptionId: pollVotes[value[index].id],
                          isOwner: currentUid == value[index].authorId,
                          actions: actions,
                        ),
                      ),
                    ),
                  ),
                ],
                AsyncValue(:final error?) => [
                  SliverToBoxAdapter(child: _FeedError(error: error)),
                ],
                _ => [const SliverToBoxAdapter(child: _FeedSkeleton())],
              },
            ],
          ),
        ),
      ),
    );
  }
}

class _FeedPost extends StatelessWidget {
  const _FeedPost({
    required this.post,
    required this.liked,
    required this.saved,
    required this.reposted,
    required this.votedOptionId,
    required this.isOwner,
    required this.actions,
  });

  final CommunityPost post;
  final bool liked;
  final bool saved;
  final bool reposted;
  final String? votedOptionId;
  final bool isOwner;
  final CommunityActions actions;

  @override
  Widget build(BuildContext context) => CommunityPostCard(
    post: post,
    liked: liked,
    saved: saved,
    reposted: reposted,
    votedOptionId: votedOptionId,
    onLike: () => actions.toggleLike(context, post),
    onRepost: () => actions.toggleRepost(context, post),
    onQuote: () => actions.quote(context, post),
    onSave: () => actions.toggleSave(context, post),
    onShare: () => actions.share(context, post),
    onViews: isOwner ? () => actions.openEngagement(context, post) : null,
    onVote: (optionId) => actions.vote(context, post, optionId),
    onPollVotes: isOwner && post.hasPoll
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
    onOpenAuthor: () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => CommunityProfileScreen(uid: post.authorId),
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
    onOpenResharer: post.resharedById == null
        ? null
        : () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              builder: (context) =>
                  CommunityProfileScreen(uid: post.resharedById!),
            ),
          ),
    onOpenHandle: (handle) => actions.openHandle(context, handle),
    onOpenLink: (url) => actions.openLink(context, url),
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

class _CommunityHeader extends ConsumerWidget {
  const _CommunityHeader({required this.onOpenMenu});

  final VoidCallback onOpenMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadNotifications =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;
    final unreadMessages = ref.watch(unreadChatCountProvider);
    // One dot for anything waiting behind the menu, so the member can tell
    // there is something in there without opening it to find out.
    final menuHasWaiting = unreadNotifications + unreadMessages > 0;

    return Padding(
      // Right inset keeps the header clear of the shell's profile orb.
      padding: const EdgeInsets.fromLTRB(8, 14, 58, 4),
      child: Row(
        children: [
          _MenuButton(onTap: onOpenMenu, hasWaiting: menuHasWaiting),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Community',
              style: TextStyle(
                color: context.brand.ink,
                fontSize: 19,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
          ),
          _NotificationBell(unread: unreadNotifications),
          IconButton(
            tooltip: 'Find people',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const PeopleScreen(),
              ),
            ),
            icon: const Icon(Icons.search_rounded),
          ),
          IconButton(
            tooltip: 'Saved posts',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const SavedPostsScreen(),
              ),
            ),
            icon: const Icon(Icons.bookmark_border_rounded),
          ),
        ],
      ),
    );
  }
}

/// The hamburger. Carries a dot rather than a number: the counts themselves
/// belong on the rows inside, and a badge on a menu only has to answer whether
/// it is worth opening.
class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.onTap, required this.hasWaiting});

  final VoidCallback onTap;
  final bool hasWaiting;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: hasWaiting ? 'Community menu, items waiting' : 'Community menu',
    excludeSemantics: true,
    child: Tooltip(
      message: 'Menu',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(Icons.menu_rounded, color: context.brand.ink),
              if (hasWaiting)
                Positioned(
                  right: -2,
                  top: -2,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: context.brand.terracotta,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: context.brand.background,
                        width: 1.5,
                      ),
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

/// The bell, with an unread count that reads as a number up to 99 and then
/// stops counting — past that the exact figure stops meaning anything.
class _NotificationBell extends StatelessWidget {
  const _NotificationBell({required this.unread});

  final int unread;

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
    excludeSemantics: true,
    child: Tooltip(
      message: 'Notifications',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) => const NotificationsScreen(),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(
                unread > 0
                    ? Icons.notifications_rounded
                    : Icons.notifications_none_rounded,
                color: unread > 0
                    ? context.brand.accent
                    : context.brand.mutedInk,
              ),
              if (unread > 0)
                Positioned(
                  right: -5,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 1,
                    ),
                    constraints: const BoxConstraints(minWidth: 16),
                    decoration: BoxDecoration(
                      color: context.brand.terracotta,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: context.brand.background,
                        width: 1.5,
                      ),
                    ),
                    child: Text(
                      unread > 99 ? '99+' : '$unread',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        height: 1.25,
                      ),
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

// ── Pulse rail ──────────────────────────────────────────────────────────────

/// The horizontal avatar rail at the top of the feed. Shows the people you
/// follow first, then new members worth following.
class _CommunityPulse extends ConsumerWidget {
  const _CommunityPulse();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggested =
        ref.watch(suggestedProfilesProvider).asData?.value ??
        const <CommunityProfile>[];
    final myUid = ref.watch(currentUidProvider);
    final people = suggested
        .where((profile) => profile.uid != myUid)
        .toList(growable: false);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 8, 4),
      child: Row(
        children: [
          Row(
            children: [
              const _PulseDot(),
              const SizedBox(width: 7),
              Text(
                'New voices',
                style: TextStyle(
                  color: context.brand.ink,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(width: 14),
          Expanded(
            child: SizedBox(
              height: 58,
              child: people.isEmpty
                  ? Center(
                      child: Text(
                        'Nobody new yet.',
                        style: TextStyle(
                          color: context.brand.faintInk,
                          fontSize: 12.5,
                        ),
                      ),
                    )
                  : ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: people.length,
                      separatorBuilder: (context, index) =>
                          const SizedBox(width: 9),
                      itemBuilder: (context, index) {
                        final profile = people[index];
                        return Tooltip(
                          message: profile.displayName,
                          child: CommunityAvatar(
                            initials: profile.initials,
                            imageUrl: profile.avatarUrl,
                            size: 46,
                            ringed: true,
                            ringColor: context.brand.border,
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (context) =>
                                    CommunityProfileScreen(uid: profile.uid),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 950),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: Tween<double>(begin: 0.35, end: 1).animate(_controller),
    child: Icon(Icons.circle, size: 8, color: context.brand.success),
  );
}

// ── Composer entry ──────────────────────────────────────────────────────────

class _ComposeBar extends ConsumerWidget {
  const _ComposeBar({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(myCommunityProfileProvider).asData?.value;
    final brand = context.brand;
    return Material(
      key: const Key('community-compose-bar'),
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(10, 8, 14, 8),
          decoration: BoxDecoration(
            color: brand.surfaceMuted,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: brand.border),
          ),
          child: Row(
            children: [
              CommunityAvatar(
                initials: profile?.initials ?? '··',
                imageUrl: profile?.avatarUrl,
                size: 32,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  'Make a Kasem post',
                  style: TextStyle(
                    color: brand.faintInk,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Icon(Icons.image_outlined, color: brand.mutedInk, size: 20),
              const SizedBox(width: 14),
              Icon(Icons.videocam_outlined, color: brand.mutedInk, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Feed switch ─────────────────────────────────────────────────────────────

class _FeedTabs extends StatelessWidget {
  const _FeedTabs({required this.selected, required this.onChanged});

  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: context.brand.divider)),
      ),
      child: Row(
        children: [
          _FeedTab(
            label: 'For you',
            selected: selected == 0,
            onTap: () => onChanged(0),
          ),
          _FeedTab(
            label: 'Following',
            selected: selected == 1,
            onTap: () => onChanged(1),
          ),
        ],
      ),
    ),
  );
}

/// One half of the feed switch: a label with a short rule under it when it is
/// the one being read.
///
/// This was a pair of filled pills. A pill is a *button*, and the switch
/// between two halves of the same timeline is not something you press so much
/// as somewhere you are — which is what an underline says and a filled
/// capsule does not.
class _FeedTab extends StatelessWidget {
  const _FeedTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        child: InkWell(
          onTap: onTap,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 13),
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: selected ? brand.ink : brand.mutedInk,
                    fontSize: 14.5,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                height: 3,
                width: selected ? 58 : 0,
                decoration: BoxDecoration(
                  color: brand.accent,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Placeholder states ──────────────────────────────────────────────────────

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed({required this.tab, required this.actions});

  final int tab;
  final CommunityActions actions;

  @override
  Widget build(BuildContext context) => tab == 1
      ? CommunityEmptyState(
          icon: Icons.group_add_outlined,
          title: 'Nothing from the people you follow',
          action: FilledButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const PeopleScreen(),
              ),
            ),
            icon: const Icon(Icons.person_search_rounded),
            label: const Text('Find people'),
          ),
        )
      : CommunityEmptyState(
          icon: Icons.forum_outlined,
          title: 'No posts yet',
          action: FilledButton.icon(
            onPressed: () => actions.compose(context),
            icon: const Icon(Icons.edit_rounded),
            label: const Text('Make the first post'),
          ),
        );
}

/// The feed's failure state, with a way out of it.
///
/// Firestore's own code says whose problem this is. A denied read or a query
/// still waiting on its index means the community service is not fully set up,
/// and telling somebody on full signal to check their connection only sends
/// them looking in the wrong place.
class _FeedError extends ConsumerWidget {
  const _FeedError({required this.error});

  final Object error;

  @override
  Widget build(BuildContext context, WidgetRef ref) => CommunityEmptyState(
    icon: Icons.cloud_off_rounded,
    title: isCommunityBackendPending(error)
        ? 'The community service is still starting up'
        : 'The feed could not load',
    action: FilledButton.icon(
      onPressed: () {
        ref
          ..invalidate(rawCommunityFeedProvider)
          ..invalidate(rawFollowingFeedProvider);
      },
      icon: const Icon(Icons.refresh_rounded),
      label: const Text('Try again'),
    ),
  );
}

class _FeedSkeleton extends StatelessWidget {
  const _FeedSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.fromLTRB(16, 6, 16, 24),
    child: Column(
      children: [
        GlassSkeleton(height: 168),
        SizedBox(height: 12),
        GlassSkeleton(height: 168),
        SizedBox(height: 12),
        GlassSkeleton(height: 168),
      ],
    ),
  );
}
