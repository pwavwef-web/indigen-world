import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

// ── The pattern ─────────────────────────────────────────────────────────────

/// Bands of triangles and lozenges in the manner of Kassena wall painting —
/// the geometric work women paint on compound walls in Tiébélé and across the
/// Kassena homeland. Drawn, not photographed: a texture in the house palette,
/// never a claim about any particular wall. Painted in the theme's own colour,
/// handed in by the widget because a painter has no context.
///
/// Shared by Learn, where it first appeared, and the Music stage, where it is
/// the frieze along the foot of the header.
class KassenaPatternPainter extends CustomPainter {
  const KassenaPatternPainter({required this.tint, this.opacity = 0.1});

  final Color tint;
  final double opacity;

  /// The pattern's width and height of repeat. A drift of exactly this far is
  /// indistinguishable from standing still, which is what lets it loop.
  static const double period = 22;

  @override
  void paint(Canvas canvas, Size size) {
    final ochre = Paint()..color = tint.withValues(alpha: opacity);
    final cream = Paint()
      ..color = Colors.white.withValues(alpha: opacity * 0.8);
    final ink = Paint()
      ..color = const Color(0xFF000000).withValues(alpha: opacity * 0.9)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    const band = period;
    var row = 0;
    for (var top = 0.0; top < size.height; top += band, row++) {
      final step = band;
      for (var left = -step; left < size.width + step; left += step) {
        final offset = row.isOdd ? step / 2 : 0;
        final x = left + offset;
        if (row % 3 == 2) {
          final lozenge = Path()
            ..moveTo(x + step / 2, top + 3)
            ..lineTo(x + step - 3, top + band / 2)
            ..lineTo(x + step / 2, top + band - 3)
            ..lineTo(x + 3, top + band / 2)
            ..close();
          canvas
            ..drawPath(lozenge, cream)
            ..drawPath(lozenge, ink);
        } else {
          final triangle = Path()
            ..moveTo(x, top + band)
            ..lineTo(x + step / 2, top + 2)
            ..lineTo(x + step, top + band)
            ..close();
          canvas.drawPath(triangle, row.isEven ? ochre : cream);
        }
      }
      canvas.drawLine(Offset(0, top), Offset(size.width, top), ink);
    }
  }

  @override
  bool shouldRepaint(KassenaPatternPainter old) =>
      old.opacity != opacity || old.tint != tint;
}

/// A frieze of the pattern that walks slowly sideways while [moving].
///
/// ── Why it only moves with the music ──────────────────────────────────────
/// A header that crawls forever is a header somebody learns to ignore, and a
/// ticker that nobody asked for. Tied to playback, the movement *means*
/// something: the wall is dancing because the song is. Paused, it is a still
/// painted band — and for somebody who asked for less motion it always is.
class KassenaBand extends StatefulWidget {
  const KassenaBand({
    required this.tint,
    required this.moving,
    this.opacity = 0.12,
    super.key,
  });

  final Color tint;
  final bool moving;
  final double opacity;

  @override
  State<KassenaBand> createState() => _KassenaBandState();
}

class _KassenaBandState extends State<KassenaBand>
    with SingleTickerProviderStateMixin {
  // Six seconds a period: slow enough to read as a wall, not a conveyor.
  late final AnimationController _drift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 6),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant KassenaBand oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.moving != widget.moving) _sync();
  }

  void _sync() {
    if (widget.moving && motionAllowed(context)) {
      if (!_drift.isAnimating) _drift.repeat();
    } else {
      // Stops where it is. Snapping back to zero would be a small jolt every
      // time somebody paused, which is exactly the moment they are looking.
      _drift.stop();
    }
  }

  @override
  void dispose() {
    _drift.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: ClipRect(
      child: CustomPaint(
        painter: _DriftingPattern(
          drift: _drift,
          tint: widget.tint,
          opacity: widget.opacity,
        ),
        child: const SizedBox.expand(),
      ),
    ),
  );
}

class _DriftingPattern extends CustomPainter {
  _DriftingPattern({
    required this.drift,
    required this.tint,
    required this.opacity,
  }) : super(repaint: drift);

  final Animation<double> drift;
  final Color tint;
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..save()
      ..translate(-drift.value * KassenaPatternPainter.period, 0);
    KassenaPatternPainter(tint: tint, opacity: opacity).paint(
      canvas,
      Size(size.width + KassenaPatternPainter.period * 2, size.height),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_DriftingPattern old) =>
      old.tint != tint || old.opacity != opacity;
}
