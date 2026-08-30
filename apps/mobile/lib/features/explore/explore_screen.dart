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

  @override
  void didUpdateWidget(ExploreScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!oldWidget.isActive || widget.isActive) return;
    // Leaving the tab puts the window back. Coming back to a feed that had
    // grown to three hundred reels would re-open every one of those snapshot
    // listeners at once, on a phone, to show a member the first card again.
    //
    // Deferred to after the frame because `didUpdateWidget` runs *inside* the
    // build that switched tabs, and writing to a provider there is refused —
    // rightly, since the widgets reading it have already been laid out.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !widget.isActive) {
        ref.read(exploreWindowProvider.notifier).reset();
      }
    });
  }

  @override
  Widget build(BuildContext context) =>
      NightTheme(child: Builder(builder: _build));

  Widget _build(BuildContext context) {
    // Published TribeStudio work and community video, merged — see
    // exploreFeedProvider. The curated preview stands in only while there is
    // genuinely nothing else, so the feed is never empty on a first launch.
    final feed = _tab == ExploreTab.forYou
        ? ref.watch(exploreFeedProvider)
        : ref.watch(exploreFollowingFeedProvider);
    final live = feed.isNotEmpty;

    // Following is allowed to be empty — that is the honest answer for
    // somebody who follows nobody, and the curated preview would only hide it.
    final reels = live
        ? feed
        : (_tab == ExploreTab.forYou ? _previewReels : const <Reel>[]);

    final header = _ExploreHeader(
      tab: _tab,
      onTabChanged: (tab) => setState(() => _tab = tab),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: reels.isEmpty
          ? _EmptyFollowing(header: header, onBrowse: () => setState(
              () => _tab = ExploreTab.forYou,
            ))
          : ReelFeedView(
              key: PageStorageKey(
                'explore-reels-${_tab.name}-${live ? 'live' : 'preview'}',
              ),
              reels: reels,
              isActive: widget.isActive,
              header: header,
              // The curated preview is three fixed cards with nothing behind
              // them, so there is nothing to fetch more of.
              onNearEnd: live
                  ? () => ref.read(exploreWindowProvider.notifier).grow()
                  : null,
            ),
    );
  }
}

/// What Following looks like before there is anybody in it.
class _EmptyFollowing extends StatelessWidget {
  const _EmptyFollowing({required this.header, required this.onBrowse});

  final Widget header;
  final VoidCallback onBrowse;

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
                  Icons.group_add_outlined,
                  color: context.brand.gold,
                  size: 38,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Nothing from the people you follow',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Follow a creator and their reels arrive here.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white60,
                    fontSize: 13.5,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: onBrowse,
                  icon: const Icon(Icons.explore_rounded),
                  label: const Text('Browse For you'),
                ),
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

const _previewReels = [
  Reel(
    id: 'preview-rhythm',
    imageUrl: 'https://images.unsplash.com/photo-1660675133223-c293889b9fb8?auto=format&fit=crop&q=82&w=1200',
    label: 'REEL PREVIEW · NORTHERN GHANA',
    title: 'Every rhythm remembers.',
    creator: '@afi.dances',
    initials: 'AD',
    caption: 'The feet carry the story. The drum calls everyone home.',
    sound: 'Original sound · Kassena rhythms',
    credit: 'Photo: Emmanuel Yeboah Okine · Unsplash',
    likes: 12800,
    comments: 426,
  ),
  Reel(
    id: 'preview-circle',
    imageUrl: 'https://images.unsplash.com/photo-1515921560173-3633830cb11a?auto=format&fit=crop&q=82&w=1200',
    label: 'PHOTO REEL · COMMUNITY',
    title: 'The circle makes room for everyone.',
    creator: '@kassena.collective',
    initials: 'KC',
    caption: 'De zaanem. Welcome is a place beside us.',
    sound: 'Field notes · community gathering',
    credit: 'Photo: Kwasi Ansong Bamfo · Unsplash',
    likes: 7400,
    comments: 218,
  ),
  Reel(
    id: 'preview-cloth',
    imageUrl: 'https://images.unsplash.com/photo-1757169917348-b4f790e4dc85?auto=format&fit=crop&q=82&w=1200',
    label: 'STORY REEL · CAPE COAST',
    title: 'What we wear can speak.',
    creator: '@heritage.in.motion',
    initials: 'HM',
    caption: 'Colour, memory and pride—carried into the next generation.',
    sound: 'Festival voices · story reel',
    credit: 'Photo: Oswald Elsaboath · Unsplash',
    likes: 9300,
    comments: 301,
    alignment: Alignment.centerLeft,
  ),
];
