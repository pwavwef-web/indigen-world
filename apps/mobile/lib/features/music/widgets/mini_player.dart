import 'package:audio_service/audio_service.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// The corner the bar is drawn with. The dock tweens it up to a full circle on
/// the way into the bubble.
const double kMiniPlayerRadius = 16;

/// How wide each control in the bar is allowed to be.
///
/// Narrower than the 48 a button gets elsewhere in the app, and paid for in
/// height: every one of these is the full height of the bar, so the target is
/// 40×46 rather than a square. Five controls at 48 would leave a 360dp phone
/// about nine characters of song title.
const double kMiniPlayerButtonWidth = 40;

const double _artGap = 10;
const double _groupGap = 6;
const double _tailGap = 2;

/// The least room the title and artist are allowed to be left with.
const double _titleFloor = 96;

/// Whether a bar [width] wide has room for a previous-track button.
///
/// ── Why the smallest phones lose it ───────────────────────────────────────
/// Artwork, two lines of text and five controls do not fit across 360dp.
/// Something has to give, and a title clipped to a syllable is worse than a
/// control that is still one tap away on the now-playing screen, on the
/// notification and on the lock screen — all three of which have a previous
/// button that nothing here can take away. Phones from about 380dp up keep it.
bool miniPlayerShowsPrevious(double width) =>
    width -
        kMiniPlayerHeight -
        _artGap -
        _groupGap -
        _tailGap -
        5 * kMiniPlayerButtonWidth >=
    _titleFloor;

/// The bar that says something is playing, wherever you happen to be.
///
/// ── Why it is drawn above the Navigator ───────────────────────────────────
/// The Collection pushes its detail screens with a plain `MaterialPageRoute`,
/// which is a full-screen opaque route: anything the shell draws is covered by
/// it. Tapping a song is precisely when a member is on one of those screens, so
/// a mini-player that lived in the shell would disappear at the exact moment it
/// became useful. It is mounted in `MaterialApp.builder` instead — see
/// `MusicOverlay` — which is the one place in the app that sits above every
/// route the router can push.
///
/// That position costs it two things it would otherwise inherit, and both are
/// handled by the overlay rather than here: there is no `Material` ancestor,
/// and `GoRouter.of(context)` cannot find the router from above it.
class MiniPlayer extends ConsumerWidget {
  const MiniPlayer({required this.onOpen, required this.brand, super.key});

  /// Opens the full now-playing screen. Passed in because the router cannot be
  /// reached from a widget mounted above it by context.
  final VoidCallback onOpen;

  /// Handed down rather than read from `Theme.of`, because the app resolves its
  /// own palette above `MaterialApp` and the overlay already has it.
  final BrandPalette brand;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final item = ref.watch(musicMediaItemProvider).asData?.value;
    if (item == null) return const SizedBox.shrink();
    final playing = ref.watch(musicIsPlayingProvider);

    final controller = ref.read(musicControllerProvider.notifier);

    return Semantics(
      container: true,
      label: 'Now playing: ${item.title}',
      child: Material(
        color: brand.surface,
        borderRadius: BorderRadius.circular(kMiniPlayerRadius),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Container(
            height: kMiniPlayerHeight,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(kMiniPlayerRadius),
              border: Border.all(color: brand.border),
            ),
            child: Column(
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) => Row(
                      children: [
                        _Artwork(item: item, brand: brand),
                        const SizedBox(width: _artGap),
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: brand.ink,
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              if (item.artist case final artist?
                                  when artist.isNotEmpty)
                                Text(
                                  artist,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: brand.mutedInk,
                                    fontSize: 11.5,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (miniPlayerShowsPrevious(constraints.maxWidth))
                          _BarButton(
                            icon: Icons.skip_previous_rounded,
                            tooltip: 'Previous',
                            color: brand.ink,
                            onPressed: controller.previous,
                          ),
                        _BarButton(
                          icon: playing
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          tooltip: playing ? 'Pause' : 'Play',
                          color: brand.ink,
                          onPressed: () =>
                              playing ? controller.pause() : controller.play(),
                        ),
                        _BarButton(
                          icon: Icons.skip_next_rounded,
                          tooltip: 'Next',
                          color: brand.ink,
                          onPressed: controller.next,
                        ),
                        // The two that are about the bar rather than about the
                        // song, held apart from the transport so that closing
                        // the player is never the button beside the one
                        // somebody meant to press.
                        const SizedBox(width: _groupGap),
                        _BarButton(
                          icon: Icons.keyboard_arrow_down_rounded,
                          size: 23,
                          tooltip: 'Minimize player',
                          color: brand.mutedInk,
                          onPressed: ref
                              .read(musicBarPlacementProvider.notifier)
                              .collapse,
                        ),
                        _BarButton(
                          icon: Icons.close_rounded,
                          size: 19,
                          tooltip: 'Stop and close player',
                          color: brand.mutedInk,
                          onPressed: controller.dismiss,
                        ),
                        const SizedBox(width: _tailGap),
                      ],
                    ),
                  ),
                ),
                _ProgressLine(brand: brand, duration: item.duration),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One control in the bar: narrow, bar-height, and labelled for a screen
/// reader by its tooltip.
class _BarButton extends StatelessWidget {
  const _BarButton({
    required this.icon,
    required this.tooltip,
    required this.color,
    required this.onPressed,
    this.size = 21,
  });

  final IconData icon;
  final String tooltip;
  final Color color;
  final VoidCallback onPressed;
  final double size;

  @override
  Widget build(BuildContext context) => IconButton(
    onPressed: onPressed,
    tooltip: tooltip,
    padding: EdgeInsets.zero,
    constraints: const BoxConstraints.tightFor(
      width: kMiniPlayerButtonWidth,
      height: kMiniPlayerHeight - 10,
    ),
    icon: Icon(icon, size: size, color: color),
  );
}

class _Artwork extends StatelessWidget {
  const _Artwork({required this.item, required this.brand});

  final MediaItem item;
  final BrandPalette brand;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      width: kMiniPlayerHeight,
      height: kMiniPlayerHeight,
      color: brand.surfaceMuted,
      child: Icon(Icons.graphic_eq_rounded, size: 20, color: brand.mutedInk),
    );
    final art = item.artUri?.toString();
    if (art == null || art.isEmpty) return placeholder;
    return CachedNetworkImage(
      imageUrl: art,
      width: kMiniPlayerHeight,
      height: kMiniPlayerHeight,
      fit: BoxFit.cover,
      placeholder: (_, _) => placeholder,
      errorWidget: (_, _, _) => placeholder,
    );
  }
}

/// The two-pixel line of progress along the bottom edge.
///
/// ── Why a StreamBuilder and not `ref.watch` ────────────────────────────────
/// The position stream ticks five times a second. Watching it from a provider
/// would mark this widget's whole subtree dirty at that rate, and the
/// mini-player sits above every route in the app — so the cost would be paid by
/// whatever screen the member was actually using. Subscribing here, inside a
/// `RepaintBoundary`, keeps the ticking to a leaf that paints two pixels.
class _ProgressLine extends ConsumerWidget {
  const _ProgressLine({required this.brand, required this.duration});

  final BrandPalette brand;
  final Duration? duration;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final total = duration;
    if (total == null || total <= Duration.zero) {
      return SizedBox(height: 2, child: ColoredBox(color: brand.divider));
    }
    final handler = ref.watch(musicAudioHandlerProvider);
    return RepaintBoundary(
      child: StreamBuilder<Duration>(
        stream: handler == null ? const Stream.empty() : AudioService.position,
        initialData: Duration.zero,
        builder: (context, snapshot) {
          final elapsed = snapshot.data ?? Duration.zero;
          final fraction = (elapsed.inMilliseconds / total.inMilliseconds)
              .clamp(0.0, 1.0);
          return SizedBox(
            height: 2,
            child: Row(
              children: [
                Expanded(
                  flex: (fraction * 1000).round(),
                  child: ColoredBox(color: brand.accent),
                ),
                Expanded(
                  flex: 1000 - (fraction * 1000).round(),
                  child: ColoredBox(color: brand.divider),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
