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
}

/// The reel feed: real published TribeStudio work when there is any, and a
/// clearly labelled curated preview when there is not.
///
/// The feed itself — paging, playback, the action rail, appreciations and
/// replies — lives in [ReelFeedView], because a creator's own page shows the
/// same reels and had no business owning a second copy of the video lifecycle.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key, this.isActive = true});

  /// Whether Explore is the tab the member is actually looking at.
  ///
  /// The shell keeps Explore mounted after a first visit so a return lands on
  /// the same reel, which means the screen cannot tell from its own lifecycle
  /// whether anyone can see it. It has to be told, because video is hardware:
  /// a decoder and the audio session, neither of which may outlive the moment
  /// the member is watching.
  final bool isActive;

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

    final header = _ExploreHeader(tab: _tab, onTabChanged: _changeTab);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: reels.isEmpty
          ? _ExploreEmpty(
              header: header,
              tab: _tab,
              onBrowse: () => _changeTab(ExploreTab.forYou),
            )
          : ReelFeedView(
              key: PageStorageKey(
                'explore-reels-${_tab.name}-${live ? 'live' : 'preview'}',
              ),
              reels: reels,
              isActive: widget.isActive,
              header: header,
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
    required this.tab,
    required this.onBrowse,
  });

  final Widget header;
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
            padding: const EdgeInsets.symmetric(horizontal: 36),
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
      ],
    ),
  );
}

class _ExploreHeader extends ConsumerWidget {
  const _ExploreHeader({required this.tab, required this.onTabChanged});

  final ExploreTab tab;
  final ValueChanged<ExploreTab> onTabChanged;

  /// Explore is the only surface in the app that is nothing but video, and it
  /// had no way to add to it: every clip in here arrived through the Community
  /// composer, which somebody looking at reels has no reason to know about.
  Future<void> _createReel(BuildContext context, WidgetRef ref) async {
    if (ref.read(currentUidProvider) == null) {
      final signedIn = await showSignInSheet(context);
      if (signedIn != true || !context.mounted) return;
    }
    // A reel is a community post, and a community post needs the handle it
    // will be published under. Sending somebody to the recorder first and
    // asking for a name afterwards would lose the clip.
    if (ref.read(myCommunityProfileProvider).asData?.value == null) {
      if (!context.mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => const CommunitySetupScreen(),
        ),
      );
      if (!context.mounted ||
          ref.read(myCommunityProfileProvider).asData?.value == null) {
        return;
      }
    }
    if (!context.mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(builder: (context) => const CreateReelScreen()),
    );
  }

  void _openSearch(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) => const ExploreSearchScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    // The right inset clears the shell's floating profile orb.
    padding: const EdgeInsets.fromLTRB(6, 6, 58, 0),
    child: Row(
      children: [
        _GlassAction(
          icon: Icons.search_rounded,
          tooltip: 'Search Explore',
          onTap: () => _openSearch(context),
        ),
        // The wordmark used to sit here. A feed that is only ever this app's
        // own reels does not need telling whose app it is, and the two words
        // it cost were the two a viewer actually wants: which feed they are
        // watching, and how to get to the other one.
        Expanded(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final value in ExploreTab.values)
                _FeedTab(
                  label: value.label,
                  selected: value == tab,
                  onTap: () => onTabChanged(value),
                ),
            ],
          ),
        ),
        _GlassAction(
          icon: Icons.add_rounded,
          tooltip: 'Post a reel',
          onTap: () => _createReel(context, ref),
        ),
      ],
    ),
  );
}

/// One half of the feed switch, over video.
///
/// A label with a short rule under it rather than a filled pill, matching the
/// Community feed's own switch: which half of a timeline you are reading is
/// somewhere you *are*, not a button you press.
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
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    child: InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                color: selected
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.62),
                fontSize: 15,
                fontWeight: selected ? FontWeight.w900 : FontWeight.w600,
                shadows: const [Shadow(blurRadius: 14, color: Colors.black)],
              ),
            ),
            const SizedBox(height: 4),
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOut,
              height: 3,
              width: selected ? 22 : 0,
              decoration: BoxDecoration(
                color: context.brand.gold,
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ],
        ),
      ),
    ),
  );
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

