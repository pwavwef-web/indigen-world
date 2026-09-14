import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_analytics.dart';
import 'package:indigen_world_mobile/features/explore/explore_chrome.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_ranking.dart';
import 'package:indigen_world_mobile/features/explore/explore_search_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_topics.dart';
import 'package:indigen_world_mobile/features/explore/kept_reels_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

/// Which half of Explore the member is watching.
enum ExploreTab {
  forYou,
  following;

  String get label => switch (this) {
    ExploreTab.forYou => 'For you',
    ExploreTab.following => 'Following',
  };

  IconData get icon => switch (this) {
    ExploreTab.forYou => Icons.explore_outlined,
    ExploreTab.following => Icons.people_alt_outlined,
  };

  IconData get selectedIcon => switch (this) {
    ExploreTab.forYou => Icons.explore_rounded,
    ExploreTab.following => Icons.people_alt_rounded,
  };
}

/// How much room [_ExploreNavBar] takes, before the device's own bottom inset.
///
/// Published as a constant because two other things have to know it: every
/// reel card reserves it under its words and action rail, and the shell floats
/// the connection banner above it. A bar whose height only the bar knows is a
/// bar that covers the caption on the first phone with a different text scale.
const double kExploreNavBarHeight = 56;

/// Explore: an immersive, vertically paged feed of cultural media — published
/// archive work and community posts, ranked for the member, narrowed by topic,
/// and carrying its provenance, community and context with it.
///
/// The feed itself — paging, playback, the action rail, the words, the Context
/// sheet — lives in [ReelFeedView], because a creator's own page and search
/// results show the same reels and had no business owning a second copy of the
/// video lifecycle. This screen owns what is Explore's alone: the topic row,
/// the For you / Following switch, the nav bar, and when the chrome goes.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key, this.isActive = true, this.onExit});

  /// Whether Explore is the tab the member is actually looking at.
  ///
  /// The shell keeps Explore mounted after a first visit so a return lands on
  /// the same reel, which means the screen cannot tell from its own lifecycle
  /// whether anyone can see it. It has to be told, because video is hardware:
  /// a decoder and the audio session, neither of which may outlive the moment
  /// the member is watching.
  final bool isActive;

  /// Takes the member back to the tab they came from.
  ///
  /// The shell owns the answer because only the shell knows which tab that
  /// was. Null in a test or anywhere Explore is shown outside the shell, where
  /// the control simply is not drawn — a back button that goes nowhere is
  /// worse than none.
  final VoidCallback? onExit;

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  var _tab = ExploreTab.forYou;

  /// How long the feed was when more was last asked for.
  ///
  /// Widening the window is asynchronous — two live queries re-subscribe and
  /// Firestore answers when it answers — so "did that bring anything back?"
  /// cannot be answered at the moment of asking. It is answered at the next
  /// ask, by whether the feed is any longer than it was left.
  var _lengthAtLastAsk = -1;

  /// When Explore's furniture is on screen. The shell's profile orb follows it,
  /// so the avatar leaves and returns with the search button beside it.
  late final ExploreChromeController _chrome = ExploreChromeController()
    ..addListener(_onChromeChanged);

  /// True while a screen this one pushed is covering the feed.
  ///
  /// A reel kept playing — sound and all — underneath the search screen, the
  /// recorder and the saved list, because the feed decided whether to play
  /// from the shell's answer to "is Explore the selected tab", and pushing a
  /// route does not change that.
  var _overlayOpen = false;

  /// False between deactivation and disposal, when a chrome timer firing must
  /// not reach for providers.
  var _attached = true;

  @override
  void activate() {
    super.activate();
    _attached = true;
  }

  @override
  void deactivate() {
    _attached = false;
    super.deactivate();
  }

  @override
  void dispose() {
    _chrome
      ..removeListener(_onChromeChanged)
      ..dispose();
    super.dispose();
  }

  void _onChromeChanged() {
    if (!mounted || !_attached || !widget.isActive) return;
    ref.read(shellChromeVisibilityProvider.notifier).set(_chrome.value);
  }

  @override
  void didUpdateWidget(ExploreScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isActive == widget.isActive) return;
    // Deferred to after the frame because `didUpdateWidget` runs *inside* the
    // build that switched tabs, and writing to a provider there is refused.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (!widget.isActive) {
        // Leaving the tab puts the window back — coming back to a feed that
        // had grown to three hundred reels would re-open every one of those
        // snapshot listeners at once — and the re-queued passes and the topic
        // go back with it: somebody returning to Explore is starting again.
        ref.read(exploreWindowProvider.notifier).reset();
        ref.read(exploreCyclesProvider.notifier).reset();
        ref.read(exploreTopicProvider.notifier).reset();
        _lengthAtLastAsk = -1;
        _chrome.interacted();
      } else {
        ref.read(exploreSignalsProvider.notifier).refresh();
        _chrome.interacted();
      }
    });
  }

  /// Runs [open] with the feed stopped, and starts it again afterwards.
  Future<void> _withFeedPaused(Future<void> Function() open) async {
    setState(() => _overlayOpen = true);
    try {
      await open();
    } finally {
      if (mounted) {
        setState(() => _overlayOpen = false);
        _chrome.interacted();
      }
    }
  }

  /// Moves between For you and Following.
  ///
  /// The re-queue count goes back to nought on the way. The two feeds hold
  /// different reels and are different lengths, so a count carried across
  /// would open Following already three passes deep.
  void _changeTab(ExploreTab tab) {
    if (tab == _tab) return;
    ref.read(exploreCyclesProvider.notifier).reset();
    ref.read(exploreSignalsProvider.notifier).refresh();
    _lengthAtLastAsk = -1;
    setState(() => _tab = tab);
    _chrome.interacted();
  }

  /// Narrows the current feed to [topic] without leaving it.
  void _selectTopic(ExploreTopic topic) {
    final current = ref.read(exploreTopicProvider);
    if (topic == current) return;
    HapticFeedback.selectionClick();
    ref.read(exploreCyclesProvider.notifier).reset();
    ref.read(exploreSignalsProvider.notifier).refresh();
    ref.read(exploreTopicProvider.notifier).select(topic);
    ref
        .read(exploreAnalyticsProvider)
        .log(
          ExploreEvent.topicFilter,
          parameters: {'topic': topic.key, 'feed': _tab.name},
        );
    _lengthAtLastAsk = -1;
    _chrome.interacted();
  }

  Future<void> _openSearch() => _withFeedPaused(
    () => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const ExploreSearchScreen(),
      ),
    ),
  );

  Future<void> _openKept() => _withFeedPaused(
    () => Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const KeptReelsScreen()),
    ),
  );

  /// Explore is where cultural media is watched, so it is also somewhere to
  /// add to it: a reel is a community post, published through the recorder.
  Future<void> _createReel() => _withFeedPaused(() async {
    if (ref.read(currentUidProvider) == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !mounted) return;
    }
    // A reel is a community post, and a community post needs the handle it
    // will be published under. Sending somebody to the recorder first and
    // asking for a name afterwards would lose the clip.
    if (await _hasProfile()) {
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<bool>(builder: (context) => const CreateReelScreen()),
      );
      return;
    }
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const CommunitySetupScreen(),
      ),
    );
    if (!mounted || !await _hasProfile()) return;
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(builder: (context) => const CreateReelScreen()),
    );
  });

  /// Whether this member already has a community profile.
  ///
  /// Read through the repository rather than off `myCommunityProfileProvider`:
  /// for a second or two after a sign-in that stream is still carrying the
  /// guest's null.
  Future<bool> _hasProfile() async {
    if (ref.read(myCommunityProfileProvider).asData?.value != null) return true;
    final repository = ref.read(communityRepositoryProvider);
    final uid = ref.read(currentUidProvider);
    if (repository == null || uid == null) return false;
    try {
      return await repository.getProfile(uid) != null;
    } on Object {
      // A profile that cannot be read is not a profile that does not exist.
      return false;
    }
  }

  /// What happens when the member reaches the end of the feed.
  ///
  /// Fetching comes first, always: a reel somebody has not seen beats one they
  /// have. Only when the window refuses to widen — it is at its ceiling — or
  /// when the last widening brought nothing back does the feed queue what it
  /// already holds again. A slow connection looks exactly like an exhausted
  /// archive, so the cost of guessing wrong is one early repeat rather than a
  /// feed stuck at a wall.
  void _loadMore() {
    final forYou = _tab == ExploreTab.forYou;
    final length = ref
        .read(
          forYou
              ? exploreLoopedFeedProvider
              : exploreFollowingLoopedFeedProvider,
        )
        .length;
    final stalled = length == _lengthAtLastAsk;
    _lengthAtLastAsk = length;
    if (!stalled && ref.read(exploreWindowProvider.notifier).grow()) return;
    final content = ref.read(
      forYou ? exploreContentProvider : exploreFollowingContentProvider,
    );
    ref.read(exploreCyclesProvider.notifier).advance(content.length);
  }

  void _retry() {
    ref
      ..invalidate(publishedReelsProvider)
      ..invalidate(rawCommunityFeedProvider);
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    // Published archive work and community media, merged, ranked and narrowed
    // to the topic — see exploreContentProvider — then queued again in a fresh
    // order for as long as the member keeps scrolling.
    final reels = _tab == ExploreTab.forYou
        ? ref.watch(exploreLoopedFeedProvider)
        : ref.watch(exploreFollowingLoopedFeedProvider);
    final topic = ref.watch(exploreTopicProvider);

    final header = _ExploreHeader(
      topic: topic,
      onTopic: _selectTopic,
      onSearch: _openSearch,
    );
    final navBar = _ExploreNavBar(
      tab: _tab,
      onTabChanged: _changeTab,
      onBack: widget.onExit,
      onKept: _openKept,
      onCreate: _createReel,
    );

    if (reels.isEmpty) {
      // Nothing is playing, so nothing may be hidden — including the shell's
      // avatar, which a feed that just emptied could have left away.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !widget.isActive) return;
        _chrome.interacted();
        ref.read(shellChromeVisibilityProvider.notifier).reveal();
      });
    }

    final Widget body;
    if (reels.isNotEmpty) {
      body = ReelFeedView(
        key: PageStorageKey('explore-reels-${_tab.name}-${topic.name}'),
        reels: reels,
        // Stopped both when Explore is not the selected tab and when something
        // Explore itself pushed is covering it.
        isActive: widget.isActive && !_overlayOpen,
        header: header,
        footer: navBar,
        bottomInset: kExploreNavBarHeight,
        onNearEnd: _loadMore,
        chrome: _chrome,
        isLoadingMore: ref.watch(exploreLoadingMoreProvider),
        onActiveIndexChanged: (index) {
          // The ranking stops following the member's live likes and follows
          // once they are past the first reel, so the reels ahead of them
          // are not reshuffled by their own taps.
          if (index > 0) ref.read(exploreSignalsProvider.notifier).lock();
        },
      );
    } else if (ref.watch(exploreFeedLoadingProvider)) {
      body = _ExploreState(
        header: header,
        navBar: navBar,
        child: const _ExploreLoading(),
      );
    } else if (ref.watch(exploreFeedFailedProvider)) {
      body = _ExploreState(
        header: header,
        navBar: navBar,
        child: _ExploreMessage(
          icon: Icons.cloud_off_rounded,
          title: 'Explore could not load',
          message:
              'Check your connection. Anything you have already watched will '
              'come back from the cache once the feed can be reached.',
          actionLabel: 'Try again',
          onAction: _retry,
        ),
      );
    } else if (topic != ExploreTopic.forYou) {
      body = _ExploreState(
        header: header,
        navBar: navBar,
        child: _ExploreMessage(
          icon: Icons.filter_alt_off_outlined,
          title: _tab == ExploreTab.following
              ? 'No ${topic.label.toLowerCase()} from people you follow yet'
              : 'No ${topic.label.toLowerCase()} here yet',
          message:
              'Nothing in this feed has been shared under '
              '${topic.label}. Try everything instead.',
          actionLabel: 'Show everything',
          onAction: () => _selectTopic(ExploreTopic.forYou),
        ),
      );
    } else if (_tab == ExploreTab.following) {
      // Following being empty means the member follows nobody and joined no
      // community — a different thing from the archive being empty, and it
      // gets a different sentence and a way back to For you.
      body = _ExploreState(
        header: header,
        navBar: navBar,
        child: _ExploreMessage(
          icon: Icons.group_add_outlined,
          title: 'Nothing from the people you follow',
          message:
              'Follow a creator or join a community, and what they share '
              'arrives here, newest first.',
          actionLabel: 'Browse For you',
          onAction: () => _changeTab(ExploreTab.forYou),
        ),
      );
    } else {
      body = _ExploreState(
        header: header,
        navBar: navBar,
        child: const _ExploreMessage(
          icon: Icons.movie_filter_outlined,
          title: 'No reels have been published yet',
          message:
              'When somebody publishes from TribeStudio or shares cultural '
              'media in Community, it appears here.',
        ),
      );
    }

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      // The empty and loading states draw text and buttons over a bare Stack;
      // this gives them the night theme's text style and a surface for ink.
      child: Material(type: MaterialType.transparency, child: body),
    );
  }
}

/// The frame every non-feed state is drawn in: the same header and nav bar,
/// always visible, because an empty or failed feed is exactly where somebody
/// needs the way to another topic, to For you, and out of Explore.
class _ExploreState extends StatelessWidget {
  const _ExploreState({
    required this.header,
    required this.navBar,
    required this.child,
  });

  final Widget header;
  final Widget navBar;
  final Widget child;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFF070A09),
    child: Stack(
      fit: StackFit.expand,
      children: [
        Padding(
          padding: EdgeInsets.only(
            top: MediaQuery.paddingOf(context).top + 60,
            bottom: MediaQuery.paddingOf(context).bottom + kExploreNavBarHeight,
          ),
          child: child,
        ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SafeArea(bottom: false, child: header),
        ),
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: SafeArea(top: false, child: navBar),
        ),
      ],
    ),
  );
}

class _ExploreMessage extends StatelessWidget {
  const _ExploreMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: context.brand.gold, size: 38),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 13.5,
              height: 1.4,
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 22),
            FilledButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    ),
  );
}

/// The first moments of Explore, while the feed's queries are in flight.
///
/// The outline of a reel — where the words and the rail will be — rather than
/// a bare spinner, so the screen that arrives is the shape the member was
/// already looking at.
class _ExploreLoading extends StatelessWidget {
  const _ExploreLoading();

  @override
  Widget build(BuildContext context) {
    Widget bar(double width, double height) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
    );
    return Semantics(
      label: 'Loading Explore',
      liveRegion: true,
      child: Stack(
        children: [
          Center(
            child: SizedBox.square(
              dimension: 30,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: context.brand.gold,
                backgroundColor: Colors.white12,
              ),
            ),
          ),
          Positioned(
            left: 16,
            bottom: 18,
            right: 96,
            child: ExcludeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  bar(120, 22),
                  const SizedBox(height: 12),
                  bar(90, 10),
                  const SizedBox(height: 10),
                  bar(180, 14),
                  const SizedBox(height: 8),
                  bar(double.infinity, 12),
                  const SizedBox(height: 6),
                  bar(160, 12),
                ],
              ),
            ),
          ),
          Positioned(
            right: 12,
            bottom: 18,
            child: ExcludeSemantics(
              child: Column(
                children: [
                  for (var index = 0; index < 5; index++) ...[
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white.withValues(alpha: 0.08),
                      ),
                    ),
                    const SizedBox(height: 22),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// What sits over the top of the feed: search on the left, the topics in the
/// middle, and room on the right for the shell's profile avatar, which the
/// shell draws and which leaves and returns with this row.
class _ExploreHeader extends StatelessWidget {
  const _ExploreHeader({
    required this.topic,
    required this.onTopic,
    required this.onSearch,
  });

  final ExploreTopic topic;
  final ValueChanged<ExploreTopic> onTopic;
  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      4,
      2,
      kProfileOrbInset + kProfileOrbSize + 4,
      0,
    ),
    child: SizedBox(
      height: 48,
      child: Row(
        children: [
          _GlassAction(
            icon: Icons.search_rounded,
            tooltip: 'Search Explore',
            onTap: onSearch,
          ),
          const SizedBox(width: 2),
          Expanded(
            child: _TopicRow(selected: topic, onSelected: onTopic),
          ),
        ],
      ),
    ),
  );
}

/// For you, Music, Stories, Traditions — on one line, scrolling sideways on a
/// phone too narrow for all four, and never wrapping onto a second line over
/// the picture.
class _TopicRow extends StatelessWidget {
  const _TopicRow({required this.selected, required this.onSelected});

  final ExploreTopic selected;
  final ValueChanged<ExploreTopic> onSelected;

  @override
  Widget build(BuildContext context) => ShaderMask(
    // Soft edges say "there is more this way" without an arrow.
    shaderCallback: (bounds) => const LinearGradient(
      colors: [
        Color(0x00FFFFFF),
        Color(0xFFFFFFFF),
        Color(0xFFFFFFFF),
        Color(0x00FFFFFF),
      ],
      stops: [0, 0.03, 0.94, 1],
    ).createShader(bounds),
    blendMode: BlendMode.dstIn,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      itemCount: ExploreTopic.values.length,
      separatorBuilder: (context, index) => const SizedBox(width: 6),
      itemBuilder: (context, index) {
        final topic = ExploreTopic.values[index];
        return Center(
          child: _TopicChip(
            topic: topic,
            selected: topic == selected,
            onTap: () => onSelected(topic),
          ),
        );
      },
    ),
  );
}

class _TopicChip extends StatelessWidget {
  const _TopicChip({
    required this.topic,
    required this.selected,
    required this.onTap,
  });

  final ExploreTopic topic;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final gold = context.brand.gold;
    return Semantics(
      button: true,
      selected: selected,
      label: '${topic.label} topic',
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: ValueKey('explore-topic-${topic.name}'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          // The chip is drawn 32 high; the ink well reaches the full row so
          // the target is 48 high.
          child: SizedBox(
            height: 48,
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? gold : Colors.black.withValues(alpha: 0.32),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: selected ? gold : Colors.white24),
                ),
                child: Text(
                  topic.label,
                  maxLines: 1,
                  softWrap: false,
                  style: TextStyle(
                    color: selected ? const Color(0xFF1A1206) : Colors.white,
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    shadows: selected
                        ? null
                        : const [Shadow(blurRadius: 8, color: Colors.black)],
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

/// Explore's own navigation, over the video.
///
/// The shell deliberately draws no rail here: full-bleed video with a tab bar
/// painted over it is a tab with chrome on it rather than a place. So Explore
/// has its own — a shallow, translucent strip with the way home and the four
/// places Explore goes — and it leaves with the rest of the chrome while a
/// reel plays.
///
/// Back is first, and it is not a tab: it leads out rather than within, so it
/// is set apart as an arrow hard against the left edge.
class _ExploreNavBar extends StatelessWidget {
  const _ExploreNavBar({
    required this.tab,
    required this.onTabChanged,
    required this.onBack,
    required this.onKept,
    required this.onCreate,
  });

  final ExploreTab tab;
  final ValueChanged<ExploreTab> onTabChanged;

  /// Null where Explore is shown outside the shell and there is nothing to go
  /// back to.
  final VoidCallback? onBack;

  final VoidCallback onKept;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      height: kExploreNavBarHeight,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        // A gradient rather than a flat panel: legible over a bright frame
        // without becoming a solid black strip across somebody's video.
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.62),
          ],
        ),
      ),
      child: Row(
        children: [
          if (onBack case final back?)
            _NavBarButton(
              key: const ValueKey('explore-nav-back'),
              icon: Icons.arrow_back_rounded,
              label: 'Back',
              onTap: back,
              compact: true,
            ),
          for (final value in ExploreTab.values)
            Expanded(
              child: _NavBarButton(
                key: ValueKey('explore-nav-${value.name}'),
                icon: value == tab ? value.selectedIcon : value.icon,
                label: value.label,
                selected: value == tab,
                accent: brand.gold,
                onTap: () => onTabChanged(value),
              ),
            ),
          Expanded(
            child: _NavBarButton(
              key: const ValueKey('explore-nav-post'),
              icon: Icons.add_box_outlined,
              label: 'Post',
              onTap: onCreate,
            ),
          ),
          Expanded(
            child: _NavBarButton(
              key: const ValueKey('explore-nav-saved'),
              icon: Icons.bookmark_border_rounded,
              label: 'Saved',
              onTap: onKept,
            ),
          ),
        ],
      ),
    );
  }
}

/// One slot in [_ExploreNavBar]: icon over label, the selected one lit in the
/// heritage gold.
class _NavBarButton extends StatelessWidget {
  const _NavBarButton({
    required this.icon,
    super.key,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.accent,
    this.compact = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool selected;

  /// The colour a selected slot lights up in. Post and Saved lead somewhere
  /// else rather than switching what is under them, so they never light.
  final Color? accent;

  /// Back takes only the room it needs.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colour = selected
        ? (accent ?? Colors.white)
        : Colors.white.withValues(alpha: 0.78);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      // Its own ink, not the Scaffold's: the bar floats over a bare Stack on
      // the empty states, where an InkWell reaching for an ancestor Material
      // would throw.
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 12 : 4,
              vertical: 6,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  icon,
                  size: 22,
                  color: colour,
                  shadows: const [Shadow(blurRadius: 12, color: Colors.black)],
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: colour,
                    fontSize: 10.5,
                    fontWeight: selected ? FontWeight.w900 : FontWeight.w600,
                    shadows: const [
                      Shadow(blurRadius: 12, color: Colors.black),
                    ],
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

/// A round, smoked-glass button for the header, with a 48-pixel target around
/// its 38-pixel disc.
class _GlassAction extends StatelessWidget {
  const _GlassAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    excludeFromSemantics: true,
    child: Semantics(
      button: true,
      label: tooltip,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkResponse(
          onTap: onTap,
          radius: 26,
          child: SizedBox.square(
            dimension: 48,
            child: Center(
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.34),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white24),
                ),
                child: Icon(icon, color: Colors.white, size: 21),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
