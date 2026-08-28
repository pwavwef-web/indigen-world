import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/auth/sign_in_sheet.dart';
import 'package:indigen_world_mobile/features/community/community_setup_screen.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/explore/create_reel_screen.dart';
import 'package:indigen_world_mobile/features/explore/explore_feed.dart';
import 'package:indigen_world_mobile/features/explore/reel_view.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';

/// The reel feed: real published TribeStudio work when there is any, and a
/// clearly labelled curated preview when there is not.
///
/// The feed itself — paging, playback, the action rail, appreciations and
/// replies — lives in [ReelFeedView], because a creator's own page shows the
/// same reels and had no business owning a second copy of the video lifecycle.
class ExploreScreen extends ConsumerWidget {
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
  Widget build(BuildContext context, WidgetRef ref) =>
      NightTheme(child: Builder(builder: (context) => _build(context, ref)));

  Widget _build(BuildContext context, WidgetRef ref) {
    // Published TribeStudio work and community video, merged — see
    // exploreFeedProvider. The curated preview stands in only while there is
    // genuinely nothing else, so the feed is never empty on a first launch.
    final feed = ref.watch(exploreFeedProvider);
    final live = feed.isNotEmpty;
    final reels = live ? feed : _previewReels;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: ReelFeedView(
        key: PageStorageKey('explore-reels-${live ? 'live' : 'preview'}'),
        reels: reels,
        isActive: isActive,
        header: _ExploreHeader(live: live),
      ),
    );
  }
}

class _ExploreHeader extends ConsumerWidget {
  const _ExploreHeader({required this.live});

  /// True when the feed is showing real work — published pieces and community
  /// video — rather than the curated preview. Saying which one a viewer is
  /// looking at is the honest thing to do: the preview is illustrative, not
  /// community content.
  final bool live;

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

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 10, 58, 0),
    child: Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white24),
          ),
          child: Icon(
            Icons.public_rounded,
            color: context.brand.gold,
            size: 20,
          ),
        ),
        const SizedBox(width: 9),
        const Text(
          'INDIGEN WORLD',
          style: TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.5,
            shadows: [Shadow(blurRadius: 14, color: Colors.black)],
          ),
        ),
        const Spacer(),
        _GlassAction(
          icon: Icons.add_rounded,
          tooltip: 'Post a reel',
          onTap: () => _createReel(context, ref),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.fromLTRB(10, 5, 12, 5),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.34),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white24),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: live ? context.brand.gold : Colors.white54,
                  shape: BoxShape.circle,
                ),
                child: const SizedBox(width: 6, height: 6),
              ),
              const SizedBox(width: 7),
              Text(
                live ? 'LIVE' : 'PREVIEW',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                ),
              ),
            ],
          ),
        ),
      ],
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
    sound: 'Original sound · Kasena rhythms',
    credit: 'Photo: Emmanuel Yeboah Okine · Unsplash',
    likes: 12800,
    comments: 426,
  ),
  Reel(
    id: 'preview-circle',
    imageUrl: 'https://images.unsplash.com/photo-1515921560173-3633830cb11a?auto=format&fit=crop&q=82&w=1200',
    label: 'PHOTO REEL · COMMUNITY',
    title: 'The circle makes room for everyone.',
    creator: '@kasena.collective',
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
