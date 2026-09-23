import 'dart:math' as math;

import 'package:audio_service/audio_service.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The player, minimised: a round button with the artwork in it and the music
/// moving over the top.
///
/// It says two things and no more — what is playing, and whether it is
/// playing — because at this size anything else is a smaller, harder target
/// for the same tap. The tap itself belongs to the dock above it, which also
/// owns dragging; this widget is the face.
class MusicBubble extends StatelessWidget {
  const MusicBubble({
    required this.item,
    required this.playing,
    required this.brand,
    super.key,
  });

  final MediaItem item;
  final bool playing;
  final BrandPalette brand;

  @override
  Widget build(BuildContext context) {
    final art = item.artUri?.toString();
    final hasArt = art != null && art.isNotEmpty;
    // White over a scrimmed photograph; the accent over the bar's own surface
    // when there is no artwork. Deliberately not the accent *fill* that a
    // floating action button uses: six screens keep one of those in this
    // corner, and two solid discs of the same colour a finger apart is a
    // question nobody should have to answer before pressing either.
    final glyph = hasArt ? Colors.white : brand.accent;

    return Container(
      decoration: BoxDecoration(
        color: hasArt ? brand.surfaceMuted : brand.surface,
        shape: BoxShape.circle,
        border: Border.all(color: brand.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (hasArt) ...[
            CachedNetworkImage(
              imageUrl: art,
              fit: BoxFit.cover,
              placeholder: (_, _) => ColoredBox(color: brand.surfaceMuted),
              errorWidget: (_, _, _) => ColoredBox(color: brand.surfaceMuted),
            ),
            ColoredBox(color: brand.scrim.withValues(alpha: 0.46)),
          ],
          Center(
            child: playing
                ? MusicEqualizer(color: glyph)
                // Paused is drawn, not implied. Bars that had simply stopped
                // moving would look the same as bars somebody wasn't looking
                // at.
                : Icon(Icons.pause_rounded, size: 20, color: glyph),
          ),
        ],
      ),
    );
  }
}

/// Four bars rising and falling while something is playing.
///
/// ── Why a painter, and why it is only ever mounted while playing ──────────
/// The bubble floats above every screen in the app. Anything that rebuilds
/// here at animation rate would be rebuilding on top of whatever somebody is
/// actually using, so the movement is confined to a [CustomPainter] behind a
/// [RepaintBoundary]: the painter repaints, the tree does not. The dock builds
/// this widget only while the bubble is on screen and [MusicBubble] only while
/// the music is playing, so a paused or minimised-away player leaves no ticker
/// running at all.
class MusicEqualizer extends StatefulWidget {
  const MusicEqualizer({required this.color, super.key});

  final Color color;

  @override
  State<MusicEqualizer> createState() => _MusicEqualizerState();
}

class _MusicEqualizerState extends State<MusicEqualizer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _wave = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _wave.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      size: const Size(20, 16),
      painter: _WavePainter(wave: _wave, color: widget.color),
    ),
  );
}

class _WavePainter extends CustomPainter {
  _WavePainter({required this.wave, required this.color})
    : super(repaint: wave);

  final Animation<double> wave;
  final Color color;

  /// Offsets into the same cycle. Deliberately not evenly spaced: four bars a
  /// quarter-turn apart read as a wave travelling in one direction, which is a
  /// loading spinner, not a level meter.
  static const _phases = <double>[0, 0.34, 0.68, 0.15];

  static const _barWidth = 2.6;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = _barWidth
      ..strokeCap = StrokeCap.round;

    final gap =
        (size.width - _phases.length * _barWidth) / (_phases.length - 1);
    final middle = size.height / 2;
    for (var i = 0; i < _phases.length; i++) {
      final swing =
          0.5 + 0.5 * math.sin(2 * math.pi * (wave.value + _phases[i]));
      // Never all the way down: a bar that reached zero would flicker out of
      // existence rather than bounce.
      final height = size.height * (0.3 + 0.7 * swing);
      final x = _barWidth / 2 + i * (_barWidth + gap);
      canvas.drawLine(
        Offset(x, middle - height / 2),
        Offset(x, middle + height / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_WavePainter oldDelegate) => oldDelegate.color != color;
}
