import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Behind the now-playing screen: the song's own artwork, blurred into a
/// wash of its colour, with a slow glow that breathes while it plays.
///
/// ── What it costs, and why that is fine ───────────────────────────────────
/// A blur over a full screen is the most expensive thing a phone's GPU is
/// commonly asked to draw. So the picture is decoded at 64 pixels — a blur
/// throws the detail away anyway — and sits in its own [RepaintBoundary],
/// where it is drawn once and then only composited. The glow is a separate
/// layer above it, so its breathing never asks for the blur again. And the
/// glow only breathes while the song plays: paused, the screen is still.
class NowPlayingBackdrop extends StatelessWidget {
  const NowPlayingBackdrop({
    required this.artworkUrl,
    required this.tint,
    required this.playing,
    this.glowCenter = const Alignment(0, -0.35),
    super.key,
  });

  final String? artworkUrl;
  final Color tint;
  final bool playing;

  /// Where the glow sits — behind the artwork.
  final Alignment glowCenter;

  @override
  Widget build(BuildContext context) {
    final url = artworkUrl;
    final deep = Color.lerp(tint, Colors.black, 0.55)!;
    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(color: tint),
        if (url != null && url.isNotEmpty)
          RepaintBoundary(
            child: AnimatedSwitcher(
              duration: motionOr(context, const Duration(milliseconds: 700)),
              // Filling the screen, both the picture arriving and the one
              // leaving. The switcher's own stack is loose, and a loose
              // picture shrinks to its 64-pixel self: a small blurred box in
              // the middle of the screen instead of a wash across it.
              layoutBuilder: (current, previous) => Stack(
                fit: StackFit.expand,
                children: [...previous, ?current],
              ),
              child: Opacity(
                key: ValueKey(url),
                opacity: 0.55,
                child: ImageFiltered(
                  imageFilter: ImageFilter.blur(
                    sigmaX: 34,
                    sigmaY: 34,
                    tileMode: TileMode.mirror,
                  ),
                  child: CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    memCacheWidth: 64,
                    fadeInDuration: const Duration(milliseconds: 400),
                    errorWidget: (_, _, _) => const SizedBox.shrink(),
                  ),
                ),
              ),
            ),
          ),
        if (playing && motionAllowed(context))
          _BreathingGlow(
            color: Color.lerp(tint, Colors.white, 0.3)!,
            center: glowCenter,
          ),
        // Darker towards the foot, where the controls are, so white type and
        // white buttons read over whatever the artwork happens to be.
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.18),
                deep.withValues(alpha: 0.35),
                deep.withValues(alpha: 0.9),
              ],
              stops: const [0, 0.45, 1],
            ),
          ),
        ),
      ],
    );
  }
}

class _BreathingGlow extends StatefulWidget {
  const _BreathingGlow({required this.color, required this.center});

  final Color color;
  final Alignment center;

  @override
  State<_BreathingGlow> createState() => _BreathingGlowState();
}

class _BreathingGlowState extends State<_BreathingGlow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _breath = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3400),
  )..repeat(reverse: true);

  late final CurvedAnimation _ease = CurvedAnimation(
    parent: _breath,
    curve: Curves.easeInOut,
  );

  @override
  void dispose() {
    _ease.dispose();
    _breath.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: RepaintBoundary(
      child: AnimatedBuilder(
        animation: _ease,
        builder: (context, _) {
          final t = _ease.value;
          return DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: widget.center,
                radius: 0.75 + 0.18 * t,
                colors: [
                  widget.color.withValues(alpha: 0.32 + 0.22 * t),
                  widget.color.withValues(alpha: 0),
                ],
              ),
            ),
          );
        },
      ),
    ),
  );
}
