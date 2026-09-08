import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/explore_search_screen.dart';
import 'package:indigen_world_mobile/features/explore/kept_reels_screen.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

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
/// reel card reserves it under its caption and action rail, and the shell
/// floats the connection banner above it. A bar whose height only the bar
/// knows is a bar that covers the caption on the first phone with a different
/// text scale.
const double kExploreNavBarHeight = 56;

/// The reel feed: real published TribeStudio work when there is any, and a
/// clearly labelled curated preview when there is not.
///
/// The feed itself — paging, playback, the action rail, appreciations and
/// replies — lives in [ReelFeedView], because a creator's own page shows the
/// same reels and had no business owning a second copy of the video lifecycle.
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
  /// ── Why Explore needs a back control of its own ──────────────────────
  /// It is the one destination the shell draws no rail under. That is right —
  /// full-bleed video with a tab bar painted over it is a tab with chrome on
  /// it rather than a place — but it left the way out as a *gesture*: the
  /// system back button, which on a gesture-navigation phone is a swipe from
  /// the edge that this feed's own horizontal drags compete with, and which
  /// nothing on screen mentions. Somebody who opened Explore to look at one
  /// reel had no visible way back to the conversation they were reading.
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

  @override
  void didUpdateWidget(ExploreScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.isActive || widget.isActive) return;
    // Leaving the tab puts the window back. Coming back to a feed that had
    // grown to three hundred reels would re-open every one of those snapshot
    // listeners at once, on a phone, to show a member the first card again.
    //
    // The re-queued passes go back with it, and for the same kind of reason:
    // somebody returning to Explore is starting again, and starting again four
    // passes deep would mean a feed that opens on reels they have already seen
    // and never fetches the ones published since.
    //
    // Deferred to after the frame because `didUpdateWidget` runs *inside* the
    // build that switched tabs, and writing to a provider there is refused —
    // rightly, since the widgets reading it have already been laid out.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !widget.isActive) {
        ref.read(exploreWindowProvider.notifier).reset();
        ref.read(exploreCyclesProvider.notifier).reset();
        _lengthAtLastAsk = -1;
      }
    });
  }

  /// True while a screen this one pushed is covering the feed.
  ///
  /// ── The bug this fixes ───────────────────────────────────────────────
  /// A reel kept playing — sound and all — underneath the search screen, the
  /// recorder and the saved-reels list. The feed decides whether to play from
  /// [ExploreScreen.isActive], which is the *shell's* answer to "is Explore
  /// the selected tab", and pushing a route does not change that: Explore is
  /// still the selected tab, it just has something on top of it. So somebody
  /// who tapped Search got a keyboard, a list of results, and a stranger's
  /// video talking over all of it; somebody who tapped Create got the
  /// recorder's microphone competing with a clip they could no longer see.
  ///
  /// Held here rather than solved with a route observer because this screen
  /// pushes all three routes itself and knows exactly when each returns —
  /// where a `RouteAware` would need a navigator observer registered at the
  /// app level for one screen's benefit.
  var _overlayOpen = false;

  /// Runs [open] with the feed stopped, and starts it again afterwards.
  ///
  /// The guard on `mounted` is the whole reason this is a helper: every one of
  /// these routes can outlive the screen — a member who backs out of the
  /// recorder onto another tab, a deep link that replaces the stack — and a
  /// `setState` after that is a crash on a screen nobody is looking at.
  Future<void> _withFeedPaused(Future<void> Function() open) async {
    setState(() => _overlayOpen = true);
    try {
      await open();
    } finally {
      if (mounted) setState(() => _overlayOpen = false);
    }
  }

  /// Moves between For you and Following.
  ///
  /// The re-queue count goes back to nought on the way. The two feeds hold
  /// different reels and are different lengths, so a count carried across would
  /// open Following already three passes deep — repeating clips at somebody who
  /// had not yet reached the end of it once.
  void _changeTab(ExploreTab tab) {
    if (tab == _tab) return;
    ref.read(exploreCyclesProvider.notifier).reset();
    _lengthAtLastAsk = -1;
    setState(() => _tab = tab);
  }

  Future<void> _openSearch() => _withFeedPaused(
    () => Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const ExploreSearchScreen()),
    ),
  );

  Future<void> _openKept() => _withFeedPaused(
    () => Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (context) => const KeptReelsScreen()),
    ),
  );

  /// Explore is the only surface in the app that is nothing but video, and it
  /// had no way to add to it: every clip in here arrived through the Community
  /// composer, which somebody looking at reels has no reason to know about.
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
  /// guest's null, and taking that as the answer sends somebody who has just
  /// claimed a handle back to the form to claim it again — where the registry
  /// refuses them their own name.
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
  /// already holds again.
  ///
  /// The second of those is a guess, and it is worth being plain about which
  /// way it goes wrong. A slow connection looks exactly like an exhausted
  /// archive, so a member on a bad signal can get a repeat a few seconds before
  /// the real reels land. When those reels do land the feed is longer than it
  /// was at the last ask, the next ask widens again, and the cost of the guess
  /// is one early repeat rather than a feed stuck in one — which is the right
  /// way round, because the other failure is a dead end.
  void _loadMore() {
    final forYou = _tab == ExploreTab.forYou;
    final length = ref
        .read(forYou ? exploreLoopedFeedProvider : exploreFollowingLoopedFeedProvider)
        .length;
    final stalled = length == _lengthAtLastAsk;
    _lengthAtLastAsk = length;
    if (!stalled && ref.read(exploreWindowProvider.notifier).grow()) return;
    // The reels before anything is repeated: what a pass is a reordering of,
    // and what [ExploreCycles.advance] measures against its minimum.
    final content = ref.read(
      forYou ? exploreContentProvider : exploreFollowingContentProvider,
    );
    ref.read(exploreCyclesProvider.notifier).advance(content.length);
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    // Published TribeStudio work and community video, merged — see
    // exploreContentProvider — then queued again in a fresh order for as long
    // as the member keeps scrolling. The curated preview stands in only while
    // there is genuinely nothing else, so the feed is never empty on a first
    // launch.
    final feed = _tab == ExploreTab.forYou
        ? ref.watch(exploreLoopedFeedProvider)
        : ref.watch(exploreFollowingLoopedFeedProvider);
    final live = feed.isNotEmpty;

    // Following is allowed to be empty — that is the honest answer for
    // somebody who follows nobody, and the curated preview would only hide it.
    // ── There is no curated preview any more ─────────────────────────────
    // For You used to fall back to three fixed cards when the archive had not
    // answered: invented creators (@afi.dances, @kassena.collective,
    // @heritage.in.motion) over Unsplash stock photographs, carrying
    // fabricated engagement counts — 12,800 likes, 426 comments — and a
    // comment sheet with two invented community members in it.
    //
    // That is not a placeholder in an app about cultural preservation. It is
    // three fictional Ghanaian creators, with an audience they do not have,
    // shown to every guest on first launch and to everybody whose Firebase
    // init failed. An empty feed is the honest answer, and the empty state
    // below now says which kind of empty it is.
    final reels = feed;

    final header = _ExploreHeader(onSearch: _openSearch);
    final navBar = _ExploreNavBar(
      tab: _tab,
      onTabChanged: _changeTab,
      onBack: widget.onExit,
      onKept: _openKept,
      onCreate: _createReel,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: reels.isEmpty
          ? _ExploreEmpty(
              header: header,
              navBar: navBar,
              tab: _tab,
              onBrowse: () => _changeTab(ExploreTab.forYou),
            )
          : ReelFeedView(
              key: PageStorageKey(
                'explore-reels-${_tab.name}-${live ? 'live' : 'preview'}',
              ),
              reels: reels,
              // Stopped both when Explore is not the selected tab and when
              // something Explore itself pushed is covering it. The two are
              // genuinely different questions and only the first was being
              // asked, which is why search and the recorder used to run over a
              // clip that was still playing.
              isActive: widget.isActive && !_overlayOpen,
              header: header,
              footer: navBar,
              bottomInset: kExploreNavBarHeight,
              // The curated preview is three fixed cards with nothing behind
              // them: nothing to fetch more of, and nothing worth queueing
              // again either. Three illustrative cards on a loop would be the
              // app insisting it has a feed when what it has is a placeholder,
              // and the member would be scrolling past the same stock
              // photograph every third swipe until they gave up on Explore
              // altogether.
              onNearEnd: live ? _loadMore : null,
            ),
    );
  }
}

/// What Following looks like before there is anybody in it.
/// What Explore says when it has nothing to show.
///
/// It has to say two different things, and until the curated preview was
/// removed it only ever said one of them. Following being empty means the
/// member follows nobody — the fix is to follow somebody. For You being empty
/// means nothing has been published yet, or this launch could not reach the
/// archive at all — and telling that member to "follow a creator", under a
/// button that switches to the tab they are already standing on, is advice
/// that cannot help and a control that does nothing.
class _ExploreEmpty extends StatelessWidget {
  const _ExploreEmpty({
    required this.header,
    required this.navBar,
    required this.tab,
    required this.onBrowse,
  });

  final Widget header;

  /// Drawn on the empty state too, and that is the point. An empty Following
  /// feed is exactly where somebody needs the way back to For you and the way
  /// out of Explore — and until the bar existed, the empty state was a screen
  /// with one button on it and no navigation at all.
  final Widget navBar;

  final ExploreTab tab;
  final VoidCallback onBrowse;

  bool get _isFollowing => tab == ExploreTab.following;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFF070A09),
    child: Stack(
      fit: StackFit.expand,
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              36,
              0,
              36,
              kExploreNavBarHeight,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  _isFollowing
                      ? Icons.group_add_outlined
                      : Icons.movie_filter_outlined,
                  color: context.brand.gold,
                  size: 38,
                ),
                const SizedBox(height: 16),
                Text(
                  _isFollowing
                      ? 'Nothing from the people you follow'
                      : 'No reels have been published yet',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _isFollowing
                      ? 'Follow a creator and their reels arrive here.'
                      : 'When somebody publishes from TribeStudio, it appears '
                            'here. If you are offline, reels will arrive when '
                            'you are back.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 13.5,
                    height: 1.4,
                  ),
                ),
                // Offered only where it leads somewhere. On For You it would
                // switch to the tab the member is already on.
                if (_isFollowing) ...[
                  const SizedBox(height: 22),
                  FilledButton.icon(
                    onPressed: onBrowse,
                    icon: const Icon(Icons.explore_rounded),
                    label: const Text('Browse For you'),
                  ),
                ],
              ],
            ),
          ),
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

/// What sits over the top of the feed.
///
/// ── Reduced to one control, and why ──────────────────────────────────────
/// It used to carry the whole of Explore's navigation: search on the left, the
/// For you / Following switch in the middle, a create button on the right. All
/// of that has moved to [_ExploreNavBar] at the bottom, where a thumb holding
/// a phone can reach it and where there is now also a way *out* of Explore.
/// What is left up here is search, because search is not a destination — it is
/// a thing you do to the feed you are already in — and because the top-left is
/// where a magnifying glass has been in this app since it had one.
///
/// The right inset still clears the shell's floating profile orb.
class _ExploreHeader extends StatelessWidget {
  const _ExploreHeader({required this.onSearch});

  final VoidCallback onSearch;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 6, 58, 0),
    child: Row(
      children: [
        _GlassAction(
          icon: Icons.search_rounded,
          tooltip: 'Search Explore',
          onTap: onSearch,
        ),
      ],
    ),
  );
}

/// Explore's own navigation, over the video.
///
/// ── Why Explore has a bar of its own ─────────────────────────────────────
/// The shell deliberately draws no rail here: full-bleed video with a tab bar
/// painted over it is a tab with chrome on it rather than a place. That was the
/// right call for the *shell's* rail and it left Explore with no navigation at
/// all — the way out was the system back gesture, which nothing on screen
/// mentioned and which competes with the feed's own drags, and the way to
/// anything else in Explore was two icons in opposite top corners.
///
/// So this is not the shell's rail brought back. It is Explore's own, with the
/// four places Explore goes and the way home, drawn dark and low-contrast so
/// the clip still owns the screen.
///
/// ── Back is first, and it is not a tab ───────────────────────────────────
/// It leads out rather than within, so it is set apart: an arrow rather than a
/// labelled destination, hard against the left edge where a back control lives
/// on every screen in the app. Grouping it with For you and Following would
/// make leaving Explore look like a fifth thing to browse.
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
  /// back to. A back button that goes nowhere is worse than none.
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
        // A gradient rather than a flat panel: the bar has to be legible over
        // a bright frame without becoming a solid black strip across the
        // bottom of somebody's video.
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: 0.0),
            Colors.black.withValues(alpha: 0.72),
          ],
        ),
      ),
      child: Row(
        children: [
          if (onBack case final back?)
            _NavBarButton(
              icon: Icons.arrow_back_rounded,
              label: 'Back',
              onTap: back,
              compact: true,
            ),
          for (final value in ExploreTab.values)
            Expanded(
              child: _NavBarButton(
                icon: value == tab ? value.selectedIcon : value.icon,
                label: value.label,
                selected: value == tab,
                accent: brand.gold,
                onTap: () => onTabChanged(value),
              ),
            ),
          Expanded(
            child: _NavBarButton(
              icon: Icons.add_box_outlined,
              label: 'Post',
              onTap: onCreate,
            ),
          ),
          Expanded(
            child: _NavBarButton(
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

/// One slot in [_ExploreNavBar].
///
/// Icon over label, both drawn in white with the selected one lit — the same
/// grammar as the shell's own rail, so moving between the two does not feel
/// like moving between two apps. The label is not optional at this size: four
/// unlabelled icons over video is a row of guesses.
class _NavBarButton extends StatelessWidget {
  const _NavBarButton({
    required this.icon,
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

  /// The colour a selected slot lights up in. Null on the ones that lead
  /// somewhere else rather than switching what is under them — Post and Saved
  /// are never "where you are", so they never light.
  final Color? accent;

  /// Back takes only the room it needs, so the four destinations still divide
  /// the rest of the bar evenly between them.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colour = selected
        ? (accent ?? Colors.white)
        : Colors.white.withValues(alpha: 0.72);
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      // ── Its own ink, not the Scaffold's ────────────────────────────────
      // The bar is drawn over full-bleed video and floats above whatever
      // Explore is currently showing — a feed, or the empty state, which is a
      // bare Stack with no Material in it at all. An InkWell that reached for
      // an ancestor would work in the feed and throw on the empty state, which
      // is precisely the screen a member is most likely to be navigating away
      // from. Transparent, so it adds a splash and nothing else.
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
                  size: 21,
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
                    fontSize: 10,
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


/// A round, smoked-glass button for the reel chrome. The header sits over
/// full-bleed video, so its controls need their own ground to stay legible on
/// a bright frame.
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
    child: Semantics(
      button: true,
      label: tooltip,
      child: Material(
        color: Colors.black.withValues(alpha: 0.34),
        shape: const CircleBorder(side: BorderSide(color: Colors.white24)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(7),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
        ),
      ),
    ),
  );
}

