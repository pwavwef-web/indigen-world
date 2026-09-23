import 'dart:ui' show lerpDouble;

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/mini_player.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// How long the bar takes to fold into the bubble, and to come back.
const Duration kMusicMorphDuration = Duration(milliseconds: 340);

/// The player in whichever shape it is in, and the morph between them.
///
/// ── Why one widget draws both ─────────────────────────────────────────────
/// The bar and the bubble are the same rectangle at two sizes: same height,
/// different width and corner. Drawing them as one animated `Positioned`
/// means the transition is a tween rather than a swap — nothing is unmounted
/// and remounted, so the artwork is not re-fetched and, more importantly,
/// nothing on the way through touches the audio handler. The song, the
/// position, the volume and the playing state are simply not part of this
/// widget's vocabulary: minimising is a change of shape, and playback carries
/// on underneath it without being told.
///
/// Mounted by [MusicOverlay] as a `Positioned.fill` above every route, which
/// is where its coordinates come from. Empty space in it passes taps through
/// to the app below.
class MusicPlayerDock extends ConsumerStatefulWidget {
  const MusicPlayerDock({required this.brand, required this.onOpen, super.key});

  /// Handed down rather than read from `Theme.of`, for the same reason as
  /// [MiniPlayer.brand]: this is mounted above `MaterialApp`.
  final BrandPalette brand;

  /// Opens the full now-playing screen — see [MiniPlayer.onOpen].
  final VoidCallback onOpen;

  @override
  ConsumerState<MusicPlayerDock> createState() => _MusicPlayerDockState();
}

class _MusicPlayerDockState extends ConsumerState<MusicPlayerDock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _morph = AnimationController(
    vsync: this,
    duration: kMusicMorphDuration,
    // Whatever shape the player was already in. The dock is unmounted while
    // something else owns the speakers — a reel, an immersive viewer — and
    // must come back in the shape it left in, without playing the animation
    // at somebody who never saw it go.
    value: ref.read(musicBarPlacementProvider).collapsed ? 1 : 0,
  );

  late final CurvedAnimation _shape = CurvedAnimation(
    parent: _morph,
    curve: Curves.easeInOutCubic,
  );

  /// Where a finger currently has the bubble, or null when nothing is dragging
  /// it.
  ///
  /// Kept here rather than in the provider on purpose: a drag is sixty frames
  /// a second of state that nothing else in the app has any use for. Only
  /// where it comes to rest is worth telling anybody about.
  Offset? _dragging;

  @override
  void dispose() {
    _shape.dispose();
    _morph.dispose();
    super.dispose();
  }

  void _expand() => ref.read(musicBarPlacementProvider.notifier).expand();

  @override
  Widget build(BuildContext context) {
    ref.listen<bool>(
      musicBarPlacementProvider.select((placement) => placement.collapsed),
      (_, collapsed) => collapsed ? _morph.forward() : _morph.reverse(),
    );

    final item = ref.watch(musicMediaItemProvider).asData?.value;
    if (item == null) return const SizedBox.shrink();
    final playing = ref.watch(musicIsPlayingProvider);
    final dock = ref.watch(
      musicBarPlacementProvider.select((placement) => placement.dock),
    );
    // `viewPadding`, not `padding`: the overlay inflates padding itself to
    // make room for the bar, and the bar cannot be positioned from the space
    // it is being given.
    final viewPadding = MediaQuery.viewPaddingOf(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        final bounds = MusicBubbleBounds(
          box: constraints.biggest,
          safeTop: viewPadding.top,
          safeBottom: viewPadding.bottom,
        );
        final drag = _dragging;
        final bubbleRect = drag == null
            ? bounds.rectFor(dock)
            : drag & const Size(kMusicBubbleSize, kMusicBubbleSize);

        return TweenAnimationBuilder<Rect?>(
          tween: RectTween(end: bubbleRect),
          // Nothing while a finger has it, so the bubble is exactly where the
          // finger is. A settle once it lets go, so snapping to the edge is a
          // movement rather than a jump.
          duration: drag == null
              ? const Duration(milliseconds: 220)
              : Duration.zero,
          curve: Curves.easeOutCubic,
          builder: (context, settled, _) => AnimatedBuilder(
            animation: _shape,
            builder: (context, _) => Stack(
              children: [
                Positioned.fromRect(
                  rect: Rect.lerp(
                    bounds.barRect,
                    settled ?? bubbleRect,
                    _shape.value,
                  )!,
                  child: Material(
                    // There is no Material ancestor above the Navigator, and
                    // the bar is full of ink responses that need one.
                    type: MaterialType.transparency,
                    child: _morphing(
                      t: _shape.value,
                      barWidth: bounds.barRect.width,
                      bounds: bounds,
                      item: item,
                      playing: playing,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// The two faces, cross-fading inside one shrinking rounded rectangle.
  ///
  /// Each face is laid out at its own natural size through an [OverflowBox]
  /// and clipped, rather than being squeezed: a bar asked to lay itself out at
  /// 56 pixels wide would overflow its own button row, and the debug build
  /// would be striped yellow for the length of the animation.
  Widget _morphing({
    required double t,
    required double barWidth,
    required MusicBubbleBounds bounds,
    required MediaItem item,
    required bool playing,
  }) {
    final brand = widget.brand;
    final radius = BorderRadius.circular(
      lerpDouble(kMiniPlayerRadius, kMusicBubbleSize / 2, t)!,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        // Behind both faces, so the moment in the middle where neither is
        // fully opaque does not show the app through the player.
        color: brand.surface,
        borderRadius: radius,
        boxShadow: t == 0
            ? null
            : [
                // The bubble floats over content the bar never sat on, so it
                // earns a lift the bar does not have. It arrives with the
                // shape rather than being switched on.
                BoxShadow(
                  color: brand.shadow.withValues(
                    alpha: (brand.isDark ? 0.5 : 0.12) * t,
                  ),
                  blurRadius: 20 * t,
                  offset: Offset(0, 6 * t),
                ),
              ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (t < 1)
              Opacity(
                // Gone before the box is too narrow to hold it, which is what
                // keeps the clipped edge of the row from being the thing
                // somebody watches. The two faces overlap in the middle of the
                // move rather than handing over through an empty pill.
                opacity: (1 - t * 1.6).clamp(0.0, 1.0),
                child: OverflowBox(
                  alignment: Alignment.centerLeft,
                  minWidth: barWidth,
                  maxWidth: barWidth,
                  minHeight: kMiniPlayerHeight,
                  maxHeight: kMiniPlayerHeight,
                  child: MiniPlayer(onOpen: widget.onOpen, brand: brand),
                ),
              ),
            // Built only once the shape has started to move, so an expanded
            // player leaves no equalizer ticking behind an invisible bubble.
            if (t > 0)
              Opacity(
                opacity: ((t - 0.25) * 1.8).clamp(0.0, 1.0),
                child: OverflowBox(
                  // Against the leading edge, where the bar keeps its artwork:
                  // the same square is under both faces for the whole of the
                  // cross-fade, so what somebody watches is the artwork
                  // becoming the bubble rather than two things swapping.
                  alignment: Alignment.centerLeft,
                  minWidth: kMusicBubbleSize,
                  maxWidth: kMusicBubbleSize,
                  minHeight: kMusicBubbleSize,
                  maxHeight: kMusicBubbleSize,
                  child: _bubble(bounds: bounds, item: item, playing: playing),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _bubble({
    required MusicBubbleBounds bounds,
    required MediaItem item,
    required bool playing,
  }) => Semantics(
    button: true,
    label: playing
        ? 'Playing: ${item.title}. Open the player.'
        : 'Paused: ${item.title}. Open the player.',
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _expand,
      onPanStart: (_) => setState(
        () => _dragging = bounds
            .rectFor(ref.read(musicBarPlacementProvider).dock)
            .topLeft,
      ),
      onPanUpdate: (details) {
        final from = _dragging;
        if (from == null) return;
        setState(() => _dragging = bounds.clamp(from + details.delta));
      },
      onPanEnd: (_) {
        final dropped = _dragging;
        if (dropped != null) {
          ref
              .read(musicBarPlacementProvider.notifier)
              .dockAt(bounds.dockFor(dropped));
        }
        setState(() => _dragging = null);
      },
      onPanCancel: () => setState(() => _dragging = null),
      child: MusicBubble(item: item, playing: playing, brand: widget.brand),
    ),
  );
}
