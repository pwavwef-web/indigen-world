import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/audio_artwork.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

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

/// How far the title has to be dragged before letting go changes the song.
const double _swipeToSkip = 56;

/// Whether a bar [width] wide has room for a previous-track button.
///
/// ── Why the smallest phones lose it ───────────────────────────────────────
/// Artwork, two lines of text and five controls do not fit across 360dp.
/// Something has to give, and a title clipped to a syllable is worse than a
/// control that is still one tap away on the now-playing screen, on the
/// notification and on the lock screen — all three of which have a previous
/// button that nothing here can take away. Phones from about 380dp up keep it.
///
/// A swipe across the title also goes back, on every width.
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
///
/// ── What moves ────────────────────────────────────────────────────────────
/// The bar wears a wash of the song's own colour and draws its progress in it.
/// Play and pause morph into each other. The title can be thrown sideways to
/// change song, and a title too long for the bar walks slowly across it while
/// the song plays — and stands still, at its start, when it does not.
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
    final tint = watchMusicTint(ref, item.artUri?.toString());

    return AnimatedTint(
      color: tint ?? brand.accent,
      builder: (context, color) {
        final wash = brand.isBlack || tint == null
            ? brand.surface
            : Color.alphaBlend(
                color.withValues(alpha: brand.isDark ? 0.32 : 0.1),
                brand.surface,
              );
        // The song's colour is darkened for white type, which is right for
        // the bar's line on a pale ground and too dark to see on a night one.
        final line = tint == null || brand.isDark ? brand.accent : color;

        return Semantics(
          container: true,
          label: 'Now playing: ${item.title}',
          child: Material(
            color: wash,
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
                              child: _SwipeTitle(
                                item: item,
                                brand: brand,
                                playing: playing,
                                onSkip: (direction) => direction > 0
                                    ? controller.next()
                                    : controller.previous(),
                              ),
                            ),
                            if (miniPlayerShowsPrevious(constraints.maxWidth))
                              _BarButton(
                                icon: Icons.skip_previous_rounded,
                                tooltip: 'Previous',
                                color: brand.ink,
                                onPressed: controller.previous,
                              ),
                            _PlayPauseButton(
                              playing: playing,
                              color: brand.ink,
                              onPressed: () => playing
                                  ? controller.pause()
                                  : controller.play(),
                            ),
                            _BarButton(
                              icon: Icons.skip_next_rounded,
                              tooltip: 'Next',
                              color: brand.ink,
                              onPressed: controller.next,
                            ),
                            // The two that are about the bar rather than about
                            // the song, held apart from the transport so that
                            // closing the player is never the button beside
                            // the one somebody meant to press.
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
                    _ProgressLine(
                      brand: brand,
                      color: line,
                      duration: item.duration,
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
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

/// Play and pause, morphing into each other rather than swapping.
class _PlayPauseButton extends StatefulWidget {
  const _PlayPauseButton({
    required this.playing,
    required this.color,
    required this.onPressed,
  });

  final bool playing;
  final Color color;
  final VoidCallback onPressed;

  @override
  State<_PlayPauseButton> createState() => _PlayPauseButtonState();
}

class _PlayPauseButtonState extends State<_PlayPauseButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _morph = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
    value: widget.playing ? 1 : 0,
  );

  @override
  void didUpdateWidget(covariant _PlayPauseButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.playing == widget.playing) return;
    if (motionAllowed(context)) {
      widget.playing ? _morph.forward() : _morph.reverse();
    } else {
      _morph.value = widget.playing ? 1 : 0;
    }
  }

  @override
  void dispose() {
    _morph.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IconButton(
    onPressed: widget.onPressed,
    tooltip: widget.playing ? 'Pause' : 'Play',
    padding: EdgeInsets.zero,
    constraints: const BoxConstraints.tightFor(
      width: kMiniPlayerButtonWidth,
      height: kMiniPlayerHeight - 10,
    ),
    icon: AnimatedIcon(
      icon: AnimatedIcons.play_pause,
      progress: _morph,
      size: 23,
      color: widget.color,
    ),
  );
}

/// The title and artist, which can be thrown sideways to change song.
///
/// A drag here is the only gesture the bar recognises besides the tap, and it
/// only claims *horizontal* movement — a tap still falls through to the bar
/// and opens the song, and the page underneath still scrolls.
class _SwipeTitle extends StatefulWidget {
  const _SwipeTitle({
    required this.item,
    required this.brand,
    required this.playing,
    required this.onSkip,
  });

  final MediaItem item;
  final BrandPalette brand;
  final bool playing;
  final ValueChanged<int> onSkip;

  @override
  State<_SwipeTitle> createState() => _SwipeTitleState();
}

class _SwipeTitleState extends State<_SwipeTitle>
    with SingleTickerProviderStateMixin {
  double _dx = 0;
  int _direction = 1;

  late final AnimationController _return = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
  )..addListener(() => setState(() => _dx = _from * (1 - _return.value)));
  double _from = 0;

  @override
  void dispose() {
    _return.dispose();
    super.dispose();
  }

  void _end(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    if (_dx.abs() > _swipeToSkip || velocity.abs() > 700) {
      final direction = (_dx.abs() > _swipeToSkip ? _dx : velocity) < 0
          ? 1
          : -1;
      HapticFeedback.selectionClick();
      setState(() {
        _direction = direction;
        _dx = 0;
      });
      widget.onSkip(direction);
      return;
    }
    if (!motionAllowed(context)) {
      setState(() => _dx = 0);
      return;
    }
    _from = _dx;
    _return.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final brand = widget.brand;
    final key = ValueKey(widget.item.id);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragStart: (_) => _return.stop(),
      onHorizontalDragUpdate: (details) =>
          setState(() => _dx += details.delta.dx),
      onHorizontalDragEnd: _end,
      child: ClipRect(
        child: Transform.translate(
          offset: Offset(_dx, 0),
          child: Opacity(
            opacity: (1 - _dx.abs() / 160).clamp(0.3, 1.0),
            child: AnimatedSwitcher(
              duration: motionOr(context, AppMotion.standard),
              layoutBuilder: (current, previous) => Stack(
                alignment: Alignment.centerLeft,
                children: [...previous, ?current],
              ),
              transitionBuilder: (child, animation) {
                final incoming = child.key == key;
                return FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: Offset((incoming ? 0.6 : -0.6) * _direction, 0),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                );
              },
              child: Column(
                key: key,
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Marquee(
                    text: widget.item.title,
                    moving: widget.playing,
                    style: TextStyle(
                      color: brand.ink,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (widget.item.artist case final artist?
                      when artist.isNotEmpty)
                    Text(
                      artist,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
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

/// One line of text that, when it is too long for its space and [moving] is
/// true, walks slowly to its end, rests, and walks back.
///
/// Only while the song plays — the loop rule — and never for somebody who
/// asked for less motion; either way it otherwise sits still with an
/// ellipsis, exactly as a plain line would.
class _Marquee extends StatefulWidget {
  const _Marquee({
    required this.text,
    required this.moving,
    required this.style,
  });

  final String text;
  final bool moving;
  final TextStyle style;

  @override
  State<_Marquee> createState() => _MarqueeState();
}

class _MarqueeState extends State<_Marquee>
    with SingleTickerProviderStateMixin {
  late final AnimationController _walk = AnimationController(vsync: this);
  double _overflow = 0;

  @override
  void dispose() {
    _walk.dispose();
    super.dispose();
  }

  void _sync(double overflow) {
    final run = widget.moving && overflow > 4 && motionAllowed(context);
    if (!run) {
      if (_walk.isAnimating || _walk.value != 0) {
        setState(
          () => _walk
            ..stop()
            ..value = 0,
        );
      }
      return;
    }
    if (_overflow == overflow && _walk.isAnimating) return;
    // Thirty pixels a second each way, with a rest at each end.
    final travel = Duration(milliseconds: (overflow / 30 * 1000).round());
    setState(() {
      _overflow = overflow;
      _walk
        ..duration = travel * 2 + const Duration(milliseconds: 3200)
        ..repeat();
    });
  }

  /// The offset at [t] of a loop: rest, walk out, rest, walk back.
  double _offsetAt(double t, Duration travel, Duration total) {
    final rest = 1600 / total.inMilliseconds;
    final out = travel.inMilliseconds / total.inMilliseconds;
    if (t < rest) return 0;
    if (t < rest + out) {
      return -_overflow * Curves.easeInOut.transform((t - rest) / out);
    }
    if (t < rest * 2 + out) return -_overflow;
    return -_overflow *
        (1 - Curves.easeInOut.transform((t - rest * 2 - out) / out));
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      // Measured in the style the line is actually drawn in — the inherited
      // one with this one laid over it — or a font the painter does not know
      // about makes a title that fits look too long, and it walks for no
      // reason.
      final style = DefaultTextStyle.of(context).style.merge(widget.style);
      final painter = TextPainter(
        text: TextSpan(text: widget.text, style: style),
        maxLines: 1,
        textDirection: Directionality.of(context),
        textScaler: MediaQuery.textScalerOf(context),
      )..layout();
      final overflow = painter.width - constraints.maxWidth;
      painter.dispose();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _sync(overflow);
      });

      if (overflow <= 4 || !_walk.isAnimating) {
        return Text(
          widget.text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: widget.style,
        );
      }
      final total = _walk.duration!;
      final travel = (total - const Duration(milliseconds: 3200)) ~/ 2;
      return ClipRect(
        child: AnimatedBuilder(
          animation: _walk,
          builder: (context, child) => Transform.translate(
            offset: Offset(_offsetAt(_walk.value, travel, total), 0),
            child: child,
          ),
          child: Text(
            widget.text,
            maxLines: 1,
            softWrap: false,
            overflow: TextOverflow.visible,
            style: widget.style,
          ),
        ),
      );
    },
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
    return AudioArtwork(
      imageUrl: art,
      width: kMiniPlayerHeight,
      height: kMiniPlayerHeight,
      memCacheWidth:
          (kMiniPlayerHeight * MediaQuery.devicePixelRatioOf(context)).round(),
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
  const _ProgressLine({
    required this.brand,
    required this.color,
    required this.duration,
  });

  final BrandPalette brand;
  final Color color;
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
                  child: ColoredBox(color: color),
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
