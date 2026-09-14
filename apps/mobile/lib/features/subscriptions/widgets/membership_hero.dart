import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';

/// The top of the membership screen: an open book that is also a recording —
/// a sound wave rising out of its spine — under a sparkle, inside slow
/// ripples, with a few motes of light drifting round it.
///
/// ── Why it is painted rather than an image or a Lottie file ───────────────
/// Three reasons. It follows the theme: the book is the palette's own accent,
/// so it is green on charcoal and indigo on plaster without shipping two
/// assets. It costs nothing to download on a phone that is paying for data by
/// the megabyte. And everything in it moves off one controller through one
/// painter, so a frame is a single `paint` call — no widget rebuilds at all.
///
/// ── And why it can stand still ────────────────────────────────────────────
/// A loop that never ends is exactly what "reduce motion" exists to turn off,
/// and a screen reader moving through the page gains nothing from a waveform.
/// In both cases it settles on a resting frame and stays there.
class MembershipHero extends StatefulWidget {
  const MembershipHero({
    required this.title,
    required this.subtitle,
    this.leading,
    this.trailing,
    super.key,
  });

  final String title;
  final String subtitle;

  /// Top-left: the close button, when the screen was pushed.
  final Widget? leading;

  /// Top-right: Restore.
  final Widget? trailing;

  @override
  State<MembershipHero> createState() => _MembershipHeroState();
}

class _MembershipHeroState extends State<MembershipHero>
    with TickerProviderStateMixin {
  /// One long loop. Every motion in the painter is a whole number of cycles of
  /// it, so the end of the loop is the same frame as its start and it never
  /// visibly jumps.
  late final AnimationController _loop = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 12),
  );

  /// The first arrival: the book rises in, the wave grows, then the words.
  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  late final Animation<double> _words = CurvedAnimation(
    parent: _entrance,
    curve: const Interval(0.35, 1, curve: Curves.easeOutCubic),
  );

  bool? _still;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still =
        MediaQuery.disableAnimationsOf(context) ||
        MediaQuery.accessibleNavigationOf(context);
    if (still == _still) return;
    _still = still;
    if (still) {
      _loop
        ..stop()
        ..value = _HeroPainter.restingFrame;
      _entrance.value = 1;
    } else {
      _loop.repeat();
      if (!_entrance.isCompleted) _entrance.forward();
    }
  }

  @override
  void dispose() {
    _loop.dispose();
    _entrance.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final theme = Theme.of(context);
    return Stack(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
          child: Column(
            children: [
              SizedBox(
                height: 150,
                width: double.infinity,
                child: RepaintBoundary(
                  child: CustomPaint(
                    painter: _HeroPainter(
                      loop: _loop,
                      entrance: _entrance,
                      brand: brand,
                    ),
                  ),
                ),
              ),
              FadeTransition(
                opacity: _words,
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0, 0.35),
                    end: Offset.zero,
                  ).animate(_words),
                  child: Column(
                    children: [
                      Semantics(
                        header: true,
                        child: Text(
                          widget.title,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            color: brand.ink,
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                            letterSpacing: -0.4,
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        widget.subtitle,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: brand.mutedInk,
                          fontSize: 15,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (widget.leading case final leading?)
          Positioned(left: 6, top: 6, child: leading),
        if (widget.trailing case final trailing?)
          Positioned(right: 6, top: 6, child: trailing),
      ],
    );
  }
}

class _HeroPainter extends CustomPainter {
  _HeroPainter({
    required this.loop,
    required this.entrance,
    required this.brand,
  }) : super(repaint: Listenable.merge([loop, entrance]));

  final Animation<double> loop;
  final Animation<double> entrance;
  final BrandPalette brand;

  /// Where the loop rests when motion is off: a frame with the wave at a
  /// pleasing, uneven height rather than flat.
  static const restingFrame = 0.19;

  /// The emblem is drawn in a 180 × 160 box and scaled into whatever the
  /// canvas gives it.
  static const _box = Size(180, 160);

  /// (x, y) as fractions of the canvas, radius, phase, cycles per loop.
  static const _motes = <(double, double, double, double, int)>[
    (0.07, 0.22, 1.6, 0.00, 2),
    (0.14, 0.60, 2.4, 0.40, 3),
    (0.21, 0.34, 1.3, 0.75, 2),
    (0.27, 0.88, 1.8, 0.20, 3),
    (0.33, 0.08, 1.4, 0.60, 4),
    (0.67, 0.10, 1.6, 0.10, 3),
    (0.73, 0.44, 2.2, 0.50, 2),
    (0.79, 0.80, 1.5, 0.85, 4),
    (0.86, 0.26, 2.0, 0.30, 3),
    (0.93, 0.62, 1.4, 0.65, 2),
    (0.03, 0.86, 1.2, 0.45, 3),
    (0.97, 0.92, 1.6, 0.05, 2),
  ];

  /// Resting heights of the seven bars, tallest in the middle.
  static const _bars = <double>[12, 22, 34, 46, 34, 22, 12];
  static const _barCycles = <int>[11, 14, 9, 12, 10, 13, 15];
  static const _barPhases = <double>[0, 0.3, 0.6, 0.15, 0.45, 0.75, 0.9];

  static double _wave(double t, int cycles, double phase) =>
      0.5 + 0.5 * math.sin(2 * math.pi * (cycles * t + phase));

  @override
  void paint(Canvas canvas, Size size) {
    final t = loop.value;
    final arrive = Curves.easeOutCubic.transform(
      (entrance.value / 0.7).clamp(0.0, 1.0),
    );
    final accent = brand.accent;
    final lit = Color.lerp(accent, Colors.white, brand.isDark ? 0.22 : 0.28)!;
    final deep = Color.lerp(accent, Colors.black, brand.isDark ? 0.3 : 0.18)!;

    // The glow the whole thing sits in.
    final glowCentre = Offset(size.width / 2, size.height * 0.6);
    final glowRadius = size.height * 0.75;
    canvas.drawCircle(
      glowCentre,
      glowRadius,
      Paint()
        ..shader = RadialGradient(
          colors: [
            accent.withValues(alpha: (brand.isDark ? 0.2 : 0.1) * arrive),
            accent.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromCircle(center: glowCentre, radius: glowRadius)),
    );

    // Motes, across the full width.
    for (final (x, y, radius, phase, cycles) in _motes) {
      final twinkle = _wave(t, cycles, phase);
      final drift = 3 * math.sin(2 * math.pi * (t * 2 + phase));
      canvas.drawCircle(
        Offset(x * size.width, y * size.height - drift),
        radius,
        Paint()
          ..color = accent.withValues(alpha: (0.18 + 0.62 * twinkle) * arrive),
      );
    }

    // Everything else in the emblem's own coordinates.
    // The box plus room for the ripples, which reach past it on both sides.
    final scale = math.min(1.0, size.height / (_box.height + 40));
    canvas
      ..save()
      ..translate(size.width / 2, (size.height - _box.height * scale) / 2 + 4)
      ..scale(scale * (0.9 + 0.1 * arrive))
      ..translate(-_box.width / 2, 0);

    _paintRipples(canvas, t, arrive, accent);
    _paintBook(canvas, arrive, lit, accent, deep);
    _paintWave(canvas, t, arrive, lit, accent);
    _paintSparkle(canvas, t, arrive, lit);

    canvas.restore();
  }

  void _paintRipples(Canvas canvas, double t, double arrive, Color accent) {
    const centre = Offset(90, 112);
    const start = math.pi + 0.32;
    const sweep = math.pi - 0.64;
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;

    for (final radius in const [92.0, 122.0]) {
      canvas.drawArc(
        Rect.fromCircle(center: centre, radius: radius),
        start,
        sweep,
        false,
        ring..color = accent.withValues(alpha: 0.12 * arrive),
      );
    }
    // Two ripples, half a cycle apart, spreading out and fading as they go.
    for (final offset in const [0.0, 0.5]) {
      final p = (t * 2 + offset) % 1;
      canvas.drawArc(
        Rect.fromCircle(center: centre, radius: 70 + 84 * p),
        start,
        sweep,
        false,
        ring
          ..color = accent.withValues(alpha: 0.3 * (1 - p) * (1 - p) * arrive),
      );
    }
  }

  void _paintBook(
    Canvas canvas,
    double arrive,
    Color lit,
    Color accent,
    Color deep,
  ) {
    final cover = Path()
      ..moveTo(90, 152)
      ..quadraticBezierTo(52, 138, 8, 144)
      ..lineTo(8, 98)
      ..quadraticBezierTo(50, 90, 90, 106)
      ..close();
    final page = Path()
      ..moveTo(90, 144)
      ..quadraticBezierTo(56, 128, 17, 134)
      ..lineTo(17, 86)
      ..quadraticBezierTo(54, 76, 90, 96)
      ..close();

    final coverPaint = Paint()..color = deep.withValues(alpha: arrive);
    final pagePaint = Paint()
      ..shader = LinearGradient(
        colors: [
          lit.withValues(alpha: arrive),
          accent.withValues(alpha: arrive),
          deep.withValues(alpha: arrive),
        ],
        stops: const [0, 0.55, 1],
      ).createShader(const Rect.fromLTRB(17, 76, 90, 144));
    final lines = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.3
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: 0.16 * arrive);

    // The left half, then the same half mirrored across the spine.
    for (final mirrored in const [false, true]) {
      canvas.save();
      if (mirrored) {
        canvas
          ..translate(_box.width, 0)
          ..scale(-1, 1);
      }
      canvas
        ..drawPath(cover, coverPaint)
        ..drawPath(page, pagePaint);
      for (var i = 1; i <= 3; i++) {
        final dy = i * 11.0;
        canvas.drawPath(
          Path()
            ..moveTo(28, 86 + dy)
            ..quadraticBezierTo(56, 78 + dy, 82, 96 + dy),
          lines,
        );
      }
      canvas.restore();
    }

    // The spine, a shade darker than either page.
    canvas.drawLine(
      const Offset(90, 97),
      const Offset(90, 144),
      Paint()
        ..strokeWidth = 1.6
        ..color = deep.withValues(alpha: 0.9 * arrive),
    );
  }

  void _paintWave(
    Canvas canvas,
    double t,
    double arrive,
    Color lit,
    Color accent,
  ) {
    const centreY = 52.0;
    const width = 5.0;
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [lit, accent],
      ).createShader(const Rect.fromLTRB(55, 26, 125, 78));

    for (var i = 0; i < _bars.length; i++) {
      final level = 0.42 + 0.58 * _wave(t, _barCycles[i], _barPhases[i]);
      final height = math.max(4.0, _bars[i] * level * arrive);
      final x = 90 + (i - 3) * 10.0;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(x, centreY),
            width: width,
            height: height,
          ),
          const Radius.circular(width / 2),
        ),
        paint,
      );
    }
  }

  void _paintSparkle(Canvas canvas, double t, double arrive, Color lit) {
    const centre = Offset(90, 12);
    final radius = 11 * (0.82 + 0.22 * _wave(t, 3, 0.25)) * arrive;
    if (radius <= 0) return;

    // Four points pulled in towards the middle: a quadratic through the centre
    // between each pair of tips.
    final star = Path()
      ..moveTo(centre.dx, centre.dy - radius)
      ..quadraticBezierTo(centre.dx, centre.dy, centre.dx + radius, centre.dy)
      ..quadraticBezierTo(centre.dx, centre.dy, centre.dx, centre.dy + radius)
      ..quadraticBezierTo(centre.dx, centre.dy, centre.dx - radius, centre.dy)
      ..quadraticBezierTo(centre.dx, centre.dy, centre.dx, centre.dy - radius)
      ..close();

    canvas
      ..drawPath(
        star,
        Paint()
          ..color = lit.withValues(alpha: 0.55)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      )
      ..drawPath(star, Paint()..color = lit);
  }

  @override
  bool shouldRepaint(_HeroPainter oldDelegate) =>
      oldDelegate.brand != brand ||
      oldDelegate.loop != loop ||
      oldDelegate.entrance != entrance;
}
