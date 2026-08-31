import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_router.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/music/music_duck.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// Puts the mini-player above every route, and makes room for it.
///
/// ── Why this wraps the Router rather than the shell ───────────────────────
/// `MaterialApp.builder` is the only place in the app above the `Navigator`
/// the router drives. The shell's own `Stack` is inside that Navigator's `/`
/// route, so a pushed `MaterialPageRoute` — which is how every Collection
/// detail screen opens — draws straight over it. Mounting here is what lets
/// somebody start a song, walk into three other screens, and still have the
/// thing they are listening to under their thumb.
///
/// ── How it makes room ─────────────────────────────────────────────────────
/// Two ways, for two audiences. It inflates `MediaQuery.padding.bottom` and
/// deliberately leaves `viewPadding.bottom` alone, which lifts the rail — the
/// rail positions *and* sizes itself from `MediaQuery.paddingOf` — with no edit
/// to it at all. And it publishes the same number through [MusicInsetScope],
/// which is what the seventeen scroll views and the floating buttons read
/// through [musicInset] and [shellBottomReserve].
///
/// The scope is not redundant with the inflation. Screens sit under the shell's
/// `Scaffold`, which sets `extendBody: true`, and Scaffold raises
/// `padding.bottom` for the body to the height of the bottom navigation bar. A
/// screen that tried to recover this widget's contribution by subtracting
/// `viewPadding` from `padding` therefore got the rail's height added to it,
/// and reserved a mini-player nobody was playing.
class MusicOverlay extends ConsumerWidget {
  const MusicOverlay({required this.brand, required this.child, super.key});

  final BrandPalette brand;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Something else owning the sound is also something else owning the
    // screen: a reel, an immersive viewer, a community video. The bar would be
    // floating over content it has nothing to do with, for music that is
    // paused anyway.
    final otherAudio = ref.watch(fullScreenMediaProvider) > 0;
    final showMini = ref.watch(musicHasQueueProvider) && !otherAudio;

    final media = MediaQuery.of(context);
    final lift = showMini ? kMiniPlayerHeight + 10 : 0.0;

    return MediaQuery(
      data: media.copyWith(
        padding: media.padding.copyWith(bottom: media.padding.bottom + lift),
      ),
      child: MusicInsetScope(
        inset: lift,
        child: Stack(
          children: [
            // The arbitration lives here rather than in a screen because the
            // music outlives every screen: whatever is on top, this is above
            // it.
            MusicDuckListener(child: child),
            if (showMini)
              Positioned(
                left: 10,
                right: 10,
                // Sits on the system inset, with the rail lifted above it by
                // the same inflation. `viewPadding` rather than `padding`,
                // because `padding` is the one this widget just moved.
                bottom: media.viewPadding.bottom + 6,
                child: Material(
                  // There is no Material ancestor above the Navigator, and the
                  // bar is full of ink responses that need one.
                  type: MaterialType.transparency,
                  child: MiniPlayer(
                    brand: brand,
                    onOpen: () =>
                        ref.read(appRouterProvider).push('/now-playing'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
