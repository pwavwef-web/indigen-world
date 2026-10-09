part of 'leaderboard_screen.dart';

const _pointsGold = Color(0xFFF5CF7D);

class _PointsHero extends StatelessWidget {
  const _PointsHero({required this.score});
  final AsyncValue<ContributorScore?> score;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final mine = score.asData?.value;
    final known = score is AsyncData<ContributorScore?>;
    return ClipRRect(
      borderRadius: BorderRadius.circular(30),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [brand.heroMid, brand.heroDeep, brand.nightGround],
            stops: const [0, 0.65, 1],
          ),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Stack(
          children: [
            const Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 44,
              child: ExcludeSemantics(
                child: CustomPaint(
                  painter: KassenaPatternPainter(
                    tint: _pointsGold,
                    opacity: 0.09,
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 23, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: _pointsGold,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'YOUR CONTRIBUTION POINTS',
                          style: TextStyle(
                            color: Color(0xFFD8E1F0),
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Make your mark.',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 24,
                                height: 1.15,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.8,
                              ),
                            ),
                            const SizedBox(height: 12),
                            if (known)
                              _AnimatedPoints(value: mine?.points ?? 0)
                            else
                              const Text(
                                '—',
                                style: TextStyle(
                                  color: _pointsGold,
                                  fontSize: 58,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (MediaQuery.textScalerOf(context).scale(14) < 22)
                        const _PointsEmblem(),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    score.hasError
                        ? 'Points unavailable right now'
                        : !known
                        ? 'Loading your points…'
                        : 'A little effort. A lasting impact.',
                    style: const TextStyle(
                      color: Color(0xFFD8E1F0),
                      fontSize: 12,
                    ),
                  ),
                  if (mine != null) ...[
                    const SizedBox(height: 20),
                    Container(
                      height: 1,
                      color: Colors.white.withValues(alpha: 0.14),
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 20,
                      runSpacing: 10,
                      children: [
                        _HeroStat(
                          icon: Icons.verified_outlined,
                          text: '${mine.approvedCount} approved',
                        ),
                        _HeroStat(
                          icon: Icons.local_fire_department_outlined,
                          text: '${mine.streakDays} day streak',
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, color: _pointsGold, size: 17),
      const SizedBox(width: 6),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(
            color: Color(0xFFE1E7F2),
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    ],
  );
}

/// Updates start from the current visual value. Semantics always read the
/// actual score, including during the decorative count-up.
class _AnimatedPoints extends StatefulWidget {
  const _AnimatedPoints({required this.value});
  final int value;
  @override
  State<_AnimatedPoints> createState() => _AnimatedPointsState();
}

class _AnimatedPointsState extends State<_AnimatedPoints>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 950),
  );
  late Tween<double> _value = Tween(begin: 0, end: widget.value.toDouble());
  double get _current =>
      _value.transform(Curves.easeOutCubic.transform(_controller.value));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (motionAllowed(context)) {
      _controller.forward();
    } else {
      _controller.value = 1;
    }
  }

  @override
  void didUpdateWidget(_AnimatedPoints oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value == widget.value) return;
    _value = Tween(begin: _current, end: widget.value.toDouble());
    if (motionAllowed(context)) {
      _controller.forward(from: 0);
    } else {
      _controller.value = 1;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: '${widget.value} contribution points',
    excludeSemantics: true,
    child: AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: Text(
          '${_current.round()}',
          key: const ValueKey('personal-points'),
          style: const TextStyle(
            color: _pointsGold,
            fontSize: 64,
            fontWeight: FontWeight.w800,
            height: 1.14,
            letterSpacing: -3,
            fontFeatures: [FontFeature.tabularFigures()],
          ),
        ),
      ),
    ),
  );
}

/// A short orbit and a landing, then still. No repeating ticker.
class _PointsEmblem extends StatelessWidget {
  const _PointsEmblem();
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: TweenAnimationBuilder<double>(
      tween: Tween(begin: motionAllowed(context) ? 0 : 1, end: 1),
      duration: motionOr(context, const Duration(milliseconds: 1150)),
      curve: Curves.easeOutCubic,
      builder: (context, progress, child) => RepaintBoundary(
        child: CustomPaint(
          size: const Size(108, 122),
          painter: _EmblemPainter(progress: progress),
        ),
      ),
    ),
  );
}

class _EmblemPainter extends CustomPainter {
  const _EmblemPainter({required this.progress});
  final double progress;
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final bounds = Rect.fromCircle(center: center, radius: 54);
    canvas.drawCircle(
      center,
      54,
      Paint()
        ..shader = RadialGradient(
          colors: [
            _pointsGold.withValues(alpha: 0.2),
            _pointsGold.withValues(alpha: 0),
          ],
        ).createShader(bounds),
    );
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8
      ..color = _pointsGold.withValues(alpha: 0.25);
    canvas.save();
    canvas.translate(center.dx, center.dy);
    canvas.rotate((1 - progress) * -0.8 - 0.4);
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: 106, height: 74),
      line,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: 84, height: 112),
      line,
    );
    for (var i = 0; i < 3; i++) {
      final angle = i * math.pi * 2 / 3 + progress * 0.6;
      canvas.drawCircle(
        Offset(math.cos(angle) * 50, math.sin(angle) * 43),
        i == 0 ? 3 : 2,
        Paint()..color = _pointsGold.withValues(alpha: 0.85),
      );
    }
    canvas.restore();
    canvas.save();
    canvas.translate(center.dx, center.dy + (1 - progress) * 14);
    canvas.rotate((1 - progress) * 0.35);
    canvas.scale(0.78 + progress * 0.22);
    final medal = Path();
    for (var i = 0; i < 8; i++) {
      final angle = -math.pi / 8 + i * math.pi / 4;
      final x = math.cos(angle) * 36;
      final y = math.sin(angle) * 36;
      if (i == 0) {
        medal.moveTo(x, y);
      } else {
        medal.lineTo(x, y);
      }
    }
    medal.close();
    canvas.drawShadow(medal, const Color(0xFF040817), 10, true);
    canvas.drawPath(
      medal,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFE9B0), Color(0xFFD8A745), Color(0xFFF5CF7D)],
        ).createShader(const Rect.fromLTWH(-36, -36, 72, 72)),
    );
    canvas.drawCircle(
      Offset.zero,
      27,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = const Color(0xFF85602D).withValues(alpha: 0.6),
    );
    final star = Path()
      ..moveTo(0, -19)
      ..lineTo(5, -5)
      ..lineTo(19, 0)
      ..lineTo(5, 5)
      ..lineTo(0, 19)
      ..lineTo(-5, 5)
      ..lineTo(-19, 0)
      ..lineTo(-5, -5)
      ..close();
    canvas.drawPath(star, Paint()..color = const Color(0xFF57421F));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_EmblemPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
