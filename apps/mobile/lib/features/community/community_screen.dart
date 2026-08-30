import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
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
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
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

/// How tall the pinned header is when the whole of it is showing: the title
/// row, and the For you / Following switch under it.
const double _headerRowHeight = 54;
const double _feedTabsHeight = 48;
const double kCommunityHeaderHeight = _headerRowHeight + _feedTabsHeight;

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  var _tab = 0;
  final _viewedPostIds = <String>{};

  /// The feed's own scroll, so the header and the rail can be brought back and
  /// the top of the timeline can be returned to.
  final _scroll = ScrollController();

  /// Posts the reader has already been shown.
  ///
  /// Everything newer than [_anchor] that is not in here is *held*: it exists,
  /// it is counted on the pill at the top of the screen, and it is not spliced
  /// into the list under the reader's thumb. A feed that inserts rows above the
  /// viewport moves the paragraph somebody is halfway through, which is the one
  /// thing a live timeline must never do.
  final _knownIds = <String>{};

  /// When the top of the feed was last taken as read.
  DateTime? _anchor;

  /// The last list the provider handed over, so the pill has something to adopt
  /// when it is tapped.
  List<CommunityPost> _latestFeed = const [];

  /// How many posts are being held above the line right now.
  var _pending = 0;

  /// Where the feed was when the current drag direction started.
  ///
  /// The gate is a distance rather than a direction change alone, so the
  /// chrome does not flicker on the pixel of overscroll a thumb leaves behind
  /// at the end of a fling.
  double _lastScrollOffset = 0;

  /// How far the feed has to travel in one direction before the composer and
  /// the rail react to it.
  static const _chromeScrollThreshold = 12.0;

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
    _scroll.dispose();
    super.dispose();
  }

  /// Separates what the reader is being shown from what has arrived behind
  /// their back.
  ///
  /// Anything older than the anchor flows straight through, which is what keeps
  /// a widening page of older posts working; only rows that would land *above*
  /// where they are reading are held for the pill.
  ///
  /// Runs during build and sets [_pending] as it goes; nothing here needs a
  /// rebuild, because the list it returns is the one being built from.
  List<CommunityPost> _split(List<CommunityPost> incoming) {
    _latestFeed = incoming;
    final anchor = _anchor;
    if (anchor == null) {
      // The first page anybody sees is never held back.
      _adopt(incoming);
      _pending = 0;
      return incoming;
    }
    final held = <String>{};
    for (final post in incoming) {
      final createdAt = post.createdAt;
      if (createdAt == null || _knownIds.contains(post.id)) continue;
      if (createdAt.isAfter(anchor)) held.add(post.id);
    }
    _pending = held.length;
    if (held.isEmpty) {
      // Nothing new above the line, so anything that arrived below it — an
      // older page, a reply count that moved — is simply taken as read.
      _knownIds.addAll(incoming.map((post) => post.id));
      return incoming;
    }
    return incoming
        .where((post) => !held.contains(post.id))
        .toList(growable: false);
  }

  /// Marks everything in [posts] as shown and moves the line to the top of it.
  void _adopt(List<CommunityPost> posts) {
    _knownIds
      ..clear()
      ..addAll(posts.map((post) => post.id));
    if (posts.isNotEmpty) {
      _anchor = posts.first.createdAt ?? DateTime.now();
    }
  }

  /// Folds in whatever is being held, on a frame where saying so is legal.
  ///
  /// Most scroll notifications arrive between frames, where this is an ordinary
  /// state change. A few — a position corrected while the viewport is being
  /// laid out — arrive during the frame itself, and rebuilding then is an error
  /// rather than a late repaint. Those wait for the end of the same frame.
  void _adoptPending() {
    if (_pending == 0) return;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted && _pending > 0) setState(() => _adopt(_latestFeed));
      });
      return;
    }
    setState(() => _adopt(_latestFeed));
  }

  /// Back to the top, with anything that arrived while the reader was away
  /// folded in on the way.
  Future<void> _flyHome() async {
    setState(() => _adopt(_latestFeed));
    ref.read(shellChromeVisibilityProvider.notifier).reveal();
    if (!_scroll.hasClients) return;
    // A fling from three screens down takes long enough to feel like a
    // malfunction, so a very long journey starts most of the way home.
    if (_scroll.offset > 2600) _scroll.jumpTo(1200);
    _lastScrollOffset = 0;
    await _scroll.animateTo(
      0,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
  }

  void _switchTab(int tab) {
    if (tab == _tab) return;
    setState(() {
      _tab = tab;
      // The other half of the timeline has its own line to draw.
      _anchor = null;
      _knownIds.clear();
    });
    ref.read(shellChromeVisibilityProvider.notifier).reveal();
    if (_scroll.hasClients) _scroll.jumpTo(0);
    _lastScrollOffset = 0;
  }

  /// Hides the composer and the rail while the member reads on, and brings both
  /// back when they turn around.
  ///
  /// The rail goes too, and not only the button. Half the reason to move the
  /// composer out of the way is the strip of feed underneath it, and leaving a
  /// glass bar sitting on that strip gives back the smaller half. They travel
  /// together on one flag so neither can be caught halfway.
  ///
  /// Driven by raw offsets rather than [ScrollDirection] because a paged feed
  /// reports a direction for every settling animation too; what matters is
  /// whether the reader has actually moved, and which way.
  bool _handleFeedScroll(ScrollNotification notification) {
    if (notification.metrics.axis != Axis.vertical) return false;
    final offset = notification.metrics.pixels;
    final chrome = ref.read(shellChromeVisibilityProvider.notifier);

    // The top of the feed always shows both: there is nothing to read past yet,
    // and arriving at a feed with no way to post to it is a dead end.
    if (offset <= 0) {
      _lastScrollOffset = offset;
      chrome.set(true);
      // Somebody who has scrolled all the way back up has asked for the new
      // posts as plainly as tapping the pill would have.
      _adoptPending();
      return false;
    }

    final travelled = offset - _lastScrollOffset;
    if (travelled.abs() < _chromeScrollThreshold) return false;
    _lastScrollOffset = offset;

    // Reading on hides them; turning back brings them out again.
    chrome.set(travelled < 0);
    return false;
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
    final l10n = AppLocalizations.of(context);
    // Tapping Community while already on Community means the same thing here
    // as it does in every other feed anybody has used.
    ref.listen<TabReselect>(tabReselectProvider, (previous, next) {
      if (next.index != kCommunityTabIndex) return;
      if (previous?.tick == next.tick) return;
      unawaited(_flyHome());
    });
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
    final chromeVisible = ref.watch(shellChromeVisibilityProvider);
    // Held back or shown, decided once — including for an empty feed, which
    // still has to clear a pill left over from the page before it.
    final shown = feed.value == null ? null : _split(feed.value!);

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
        // Slides down out of the frame rather than fading in place, so a
        // half-hidden button is never left sitting there to be half-tapped.
        child: AnimatedSlide(
          offset: chromeVisible ? Offset.zero : const Offset(0, 1.4),
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          child: AnimatedOpacity(
            opacity: chromeVisible ? 1 : 0,
            duration: const Duration(milliseconds: 180),
            child: IgnorePointer(
              ignoring: !chromeVisible,
              child: FloatingActionButton(
                heroTag: 'community-compose',
                tooltip: l10n.communityNewPost,
                onPressed: () => actions.compose(context),
                backgroundColor: context.brand.accentFill,
                foregroundColor: context.brand.onAccentFill,
                child: const Icon(Icons.edit_rounded),
              ),
            ),
          ),
        ),
      ),
      body: ScreenContainer(
        child: NotificationListener<ScrollNotification>(
          onNotification: _handleFeedScroll,
          child: Stack(
            children: [
              RefreshIndicator(
                // The spinner belongs under the header rather than behind it.
                edgeOffset: kCommunityHeaderHeight,
                onRefresh: () async {
                  ref
                    ..invalidate(rawCommunityFeedProvider)
                    ..invalidate(rawFollowingFeedProvider)
                    ..invalidate(followingIdsProvider)
                    ..invalidate(suggestedProfilesProvider);
                  await ref.read(suggestedProfilesProvider.future);
                  // A pull to refresh is a request for everything, including
                  // whatever was being held back.
                  if (mounted) setState(() => _adopt(_latestFeed));
                },
                child: CustomScrollView(
                  key: const PageStorageKey('community-scroll'),
                  controller: _scroll,
                  // An empty or short feed still has to accept the refresh
                  // gesture.
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    // The header floats over the feed rather than travelling
                    // with it, so this is the room it needs to sit in.
                    const SliverToBoxAdapter(
                      child: SizedBox(height: kCommunityHeaderHeight),
                    ),
                    const SliverToBoxAdapter(child: _CommunityPulse()),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                        child: _ComposeBar(
                          onTap: () => actions.compose(context),
                        ),
                      ),
                    ),
                    // Matched on what the state HOLDS rather than on which
                    // class it is. Riverpod retries a failed provider, and
                    // while a retry is in flight the state is `AsyncLoading`
                    // *carrying* the error rather than `AsyncError` — so
                    // matching the class alone made the feed flash the skeleton
                    // back between attempts, and then the error, and then the
                    // skeleton again. A page we already have also outranks a
                    // reconnect: Firestore recovers on its own, and a reader
                    // would rather see slightly stale posts than a spinner.
                    ...switch ((feed, shown)) {
                      (_, final posts?) when posts.isEmpty => [
                        SliverToBoxAdapter(
                          child: _EmptyFeed(tab: _tab, actions: actions),
                        ),
                      ],
                      (_, final posts?) => [
                        // Full-bleed rows: the feed is a single column of
                        // writing separated by hairlines, so there is no gutter
                        // to inset and no gap between one post and the next.
                        SliverPadding(
                          padding: const EdgeInsets.only(
                            bottom: kFrostedNavBarReservedSpace + 60,
                          ),
                          sliver: _FeedList(
                            posts: posts,
                            likes: likes,
                            saved: saved,
                            reposts: reposts,
                            pollVotes: pollVotes,
                            currentUid: currentUid,
                            actions: actions,
                            onSeen: _trackVisiblePost,
                          ),
                        ),
                      ],
                      (AsyncValue(:final error?), _) => [
                        SliverToBoxAdapter(child: _FeedError(error: error)),
                      ],
                      _ => [const SliverToBoxAdapter(child: _FeedSkeleton())],
                    },
                  ],
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: _PinnedCommunityHeader(
                  tab: _tab,
                  onChangeTab: _switchTab,
                  onOpenMenu: () => _scaffoldKey.currentState?.openDrawer(),
                ),
              ),
              // The pill rides just under the header, wherever the header
              // happens to have got to.
              Positioned(
                top: chromeVisible
                    ? kCommunityHeaderHeight + 10
                    : _feedTabsHeight + 10,
                left: 0,
                right: 0,
                child: Center(
                  child: _NewPostsPill(count: _pending, onTap: _flyHome),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The timeline itself.
///
/// Pulled out of [CommunityScreen.build] so the list of posts is one widget
/// with one job, rather than forty lines of builder nested six levels inside a
/// switch inside a sliver list.
class _FeedList extends StatelessWidget {
  const _FeedList({
    required this.posts,
    required this.likes,
    required this.saved,
    required this.reposts,
    required this.pollVotes,
    required this.currentUid,
    required this.actions,
    required this.onSeen,
  });

  final List<CommunityPost> posts;
  final Set<String> likes;
  final Set<String> saved;
  final Set<String> reposts;
  final Map<String, String> pollVotes;
  final String? currentUid;
  final CommunityActions actions;
  final void Function(CommunityPost, double, CommunityActions) onSeen;

  @override
  Widget build(BuildContext context) => SliverList.builder(
    itemCount: posts.length,
    itemBuilder: (context, index) {
      final post = posts[index];
      return VisibilityDetector(
        key: Key('community-post-${post.id}-$index'),
        onVisibilityChanged: (info) =>
            onSeen(post, info.visibleFraction, actions),
        child: _FeedPost(
          post: post,
          liked: likes.contains(post.id),
          saved: saved.contains(post.id),
          reposted: reposts.contains(post.id),
          votedOptionId: pollVotes[post.id],
          isOwner: currentUid == post.authorId,
          actions: actions,
        ),
      );
    },
  );
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

/// The community tab's header, pinned to the top of the screen.
///
/// It used to be the first row of the feed, which meant the way back to the
/// menu, the bell, member search and the saved posts was three screens of
/// scrolling away the moment somebody started reading. The rail and the
/// composer had already solved this — they leave when a reader moves on and
/// come back the instant they turn around — and the header now answers to the
/// same flag, so the whole of the app's furniture behaves as one thing.
///
/// The For you / Following switch is the exception, and deliberately so: it is
/// not chrome, it is *where you are*, and a timeline that can be scrolled far
/// enough to forget which half of it you are reading is a timeline with a hole
/// in it. So the title row slides up out of the frame and the switch stays,
/// which is exactly the arrangement every timeline of this shape has landed on.
class _PinnedCommunityHeader extends ConsumerWidget {
  const _PinnedCommunityHeader({
    required this.tab,
    required this.onChangeTab,
    required this.onOpenMenu,
  });

  final int tab;
  final ValueChanged<int> onChangeTab;
  final VoidCallback onOpenMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visible = ref.watch(shellChromeVisibilityProvider);
    final brand = context.brand;

    return ClipRect(
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOutCubic,
        height: visible ? kCommunityHeaderHeight : _feedTabsHeight,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: DecoratedBox(
            decoration: BoxDecoration(
              // Translucent rather than solid: the point of pinning it is that
              // the feed keeps running underneath, and a reader should be able
              // to see that it does.
              color: brand.background.withValues(alpha: 0.86),
              border: Border(bottom: BorderSide(color: brand.divider)),
            ),
            // The column keeps its full height whatever the box around it is
            // doing, so shrinking the box takes the title row up under the
            // status bar instead of squashing it.
            child: OverflowBox(
              alignment: Alignment.bottomCenter,
              minHeight: kCommunityHeaderHeight,
              maxHeight: kCommunityHeaderHeight,
              child: Column(
                children: [
                  SizedBox(
                    height: _headerRowHeight,
                    child: _CommunityHeader(onOpenMenu: onOpenMenu),
                  ),
                  SizedBox(
                    height: _feedTabsHeight,
                    child: _FeedTabs(selected: tab, onChanged: onChangeTab),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The count of posts that arrived while somebody was reading.
///
/// A live timeline has two bad options and one good one. It can splice new
/// posts in above the viewport, which moves the sentence being read; it can
/// drop them silently, which makes the feed feel dead; or it can hold them and
/// say so. This is the third.
class _NewPostsPill extends StatelessWidget {
  const _NewPostsPill({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final l10n = AppLocalizations.of(context);
    return AnimatedSlide(
      offset: count > 0 ? Offset.zero : const Offset(0, -1.8),
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutBack,
      child: AnimatedOpacity(
        opacity: count > 0 ? 1 : 0,
        duration: const Duration(milliseconds: 180),
        child: IgnorePointer(
          ignoring: count == 0,
          child: Semantics(
            button: true,
            label: l10n.communityNewPostsSemantics(count),
            excludeSemantics: true,
            child: Material(
              color: brand.accentFill,
              borderRadius: BorderRadius.circular(999),
              elevation: 3,
              shadowColor: brand.shadow.withValues(alpha: 0.4),
              child: InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 8, 16, 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.arrow_upward_rounded,
                        size: 15,
                        color: brand.onAccentFill,
                      ),
                      const SizedBox(width: 7),
                      Text(
                        l10n.communityNewPostsPill(count),
                        style: TextStyle(
                          color: brand.onAccentFill,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CommunityHeader extends ConsumerWidget {
  const _CommunityHeader({required this.onOpenMenu});

  final VoidCallback onOpenMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadNotifications =
        ref.watch(unreadNotificationCountProvider).asData?.value ?? 0;
    final unreadMessages = ref.watch(unreadChatCountProvider);
    final l10n = AppLocalizations.of(context);
    // One dot for anything waiting behind the menu, so the member can tell
    // there is something in there without opening it to find out.
    final menuHasWaiting = unreadNotifications + unreadMessages > 0;

    return Padding(
      // Right inset keeps the header clear of the shell's profile orb.
      padding: const EdgeInsets.fromLTRB(8, 4, 54, 4),
      child: Row(
        children: [
          _MenuButton(onTap: onOpenMenu, hasWaiting: menuHasWaiting),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              l10n.communityTitle,
              // The row has a fixed height now, so a title that wrapped at a
              // large text scale would push its own baseline out of it.
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: context.brand.ink,
                fontSize: 19,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
              ),
            ),
          ),
          _NotificationBell(unread: unreadNotifications),
          _HeaderIcon(
            icon: Icons.search_rounded,
            tooltip: l10n.communityFindPeople,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const PeopleScreen(),
              ),
            ),
          ),
          _HeaderIcon(
            icon: Icons.bookmark_border_rounded,
            tooltip: l10n.communitySavedPosts,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => const SavedPostsScreen(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A header action.
///
/// A plain [IconButton] insists on a 48px box, and four of them stacked into a
/// row that now has a fixed height pushed the title off its own baseline. This
/// keeps the 44px target the guidelines actually ask for and no more.
class _HeaderIcon extends StatelessWidget {
  const _HeaderIcon({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    onPressed: onTap,
    padding: EdgeInsets.zero,
    constraints: const BoxConstraints.tightFor(width: 44, height: 44),
    iconSize: 21,
    icon: Icon(icon),
  );
}

/// The hamburger. Carries a dot rather than a number: the counts themselves
/// belong on the rows inside, and a badge on a menu only has to answer whether
/// it is worth opening.
class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.onTap, required this.hasWaiting});

  final VoidCallback onTap;
  final bool hasWaiting;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: hasWaiting ? l10n.communityMenuWaiting : l10n.communityMenu,
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
}

/// The bell, with an unread count that reads as a number up to 99 and then
/// stops counting — past that the exact figure stops meaning anything.
class _NotificationBell extends StatelessWidget {
  const _NotificationBell({required this.unread});

  final int unread;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: unread > 0
          ? l10n.communityNotificationsUnread(unread)
          : l10n.communityNotifications,
      excludeSemantics: true,
      child: Tooltip(
        message: l10n.communityNotifications,
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
    final l10n = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 2, 8, 4),
      child: Row(
        children: [
          Row(
            children: [
              const _PulseDot(),
              const SizedBox(width: 7),
              Text(
                l10n.communityNewVoices,
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
                        l10n.communityNobodyNew,
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
                            username: profile.username,
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
    final l10n = AppLocalizations.of(context);
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
                username: profile?.username,
                size: 32,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  l10n.communityCompose,
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
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Row(
      children: [
        _FeedTab(
          label: l10n.communityForYou,
          selected: selected == 0,
          onTap: () => onChanged(0),
        ),
        _FeedTab(
          label: l10n.communityFollowing,
          selected: selected == 1,
          onTap: () => onChanged(1),
        ),
      ],
    );
  }
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
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Expanded(
                child: Center(
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
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return tab == 1
        ? CommunityEmptyState(
            icon: Icons.group_add_outlined,
            title: l10n.communityEmptyFollowing,
            action: FilledButton.icon(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (context) => const PeopleScreen(),
                ),
              ),
              icon: const Icon(Icons.person_search_rounded),
              label: Text(l10n.communityFindPeople),
            ),
          )
        : CommunityEmptyState(
            icon: Icons.forum_outlined,
            title: l10n.communityEmptyFeed,
            action: FilledButton.icon(
              onPressed: () => actions.compose(context),
              icon: const Icon(Icons.edit_rounded),
              label: Text(l10n.communityFirstPost),
            ),
          );
  }
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
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    return CommunityEmptyState(
      icon: Icons.cloud_off_rounded,
      title: isCommunityBackendPending(error)
          ? l10n.communityBackendPending
          : l10n.communityFeedFailed,
      action: FilledButton.icon(
        onPressed: () {
          ref
            ..invalidate(rawCommunityFeedProvider)
            ..invalidate(rawFollowingFeedProvider);
        },
        icon: const Icon(Icons.refresh_rounded),
        label: Text(l10n.communityTryAgain),
      ),
    );
  }
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
