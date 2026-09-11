import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/notifications/push_messaging.dart';
import 'package:indigen_world_mobile/features/onboarding/notifications_primer.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// What the gate is showing right now.
///
/// [notificationsPrimer] is reached from two directions: as the closing step of
/// first-run onboarding, and — once — on the first launch of a build that has
/// it for somebody who onboarded before it existed. Both go through the same
/// screen, so there is one place where the one permission prompt an install
/// gets can be spent.
enum _Stage { loading, onboarding, notificationsPrimer, ready }

class StartupGate extends ConsumerStatefulWidget {
  const StartupGate({super.key});

  @override
  ConsumerState<StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends ConsumerState<StartupGate> {
  static const _onboardingKey = 'indigen_world_onboarding_complete_v1';
  var _stage = _Stage.loading;
  var _primerPending = false;
  String _learningPath = 'Home community';

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Whether to ask about alerts at all this launch.
  ///
  /// Not when Firebase failed to come up: no token can be minted and no topic
  /// joined, so the answer could not be acted on — and asking anyway would
  /// spend the one prompt this install gets on a launch unable to honour it.
  /// Left unspent, the primer simply arrives on a launch that can.
  Future<bool> _needsPrimer() async {
    if (!ref.read(firebaseReadyProvider)) return false;
    return pushPrimerNeeded();
  }

  Future<void> _load() async {
    final preferences = await SharedPreferences.getInstance();
    final onboardingComplete = preferences.getBool(_onboardingKey) ?? false;
    final primerPending = await _needsPrimer();
    await Future<void>.delayed(const Duration(milliseconds: 3100));
    if (!mounted) return;
    setState(() {
      _primerPending = primerPending;
      _stage = switch ((onboardingComplete, primerPending)) {
        (false, _) => _Stage.onboarding,
        (true, true) => _Stage.notificationsPrimer,
        (true, false) => _Stage.ready,
      };
    });
  }

  Future<void> _finishOnboarding() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_onboardingKey, true);
    await preferences.setString(
      'indigen_world_learning_path_v1',
      _learningPath,
    );
    if (!mounted) return;
    setState(
      () => _stage = _primerPending ? _Stage.notificationsPrimer : _Stage.ready,
    );
  }

  void _finishPrimer() {
    if (!mounted) return;
    setState(() => _stage = _Stage.ready);
  }

  @override
  Widget build(BuildContext context) => switch (_stage) {
    // The launch screen is the same night whatever the appearance choice —
    // the brand arriving out of the dark is the point of it.
    _Stage.loading => const NightTheme(child: _LaunchScreen()),
    _Stage.onboarding => _OnboardingScreen(
      learningPath: _learningPath,
      onPathChanged: (value) => setState(() => _learningPath = value),
      onContinue: _finishOnboarding,
    ),
    _Stage.notificationsPrimer => NotificationsPrimer(onDone: _finishPrimer),
    _Stage.ready => const AppShell(),
  };
}

class _LaunchScreen extends StatefulWidget {
  const _LaunchScreen();

  @override
  State<_LaunchScreen> createState() => _LaunchScreenState();
}

class _LaunchScreenState extends State<_LaunchScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2850),
    )..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xFF071D17),
    body: AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final landscapeProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0, 0.58, curve: Curves.easeOutCubic),
        ).value;
        final brandProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.22, 0.7, curve: Curves.easeOutBack),
        ).value;
        final promiseProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.6, 0.94, curve: Curves.easeOut),
        ).value;

        return Semantics(
          label: 'Indigen World. Project Kassena, a living home for Kasem language, stories and community.',
          child: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF071D17),
                  Color(0xFF123C2E),
                  Color(0xFF1C4D38),
                ],
                stops: [0, 0.58, 1],
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ExcludeSemantics(
                  child: CustomPaint(
                    painter: _KasenaHorizonPainter(landscapeProgress),
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
                    child: Column(
                      children: [
                        Opacity(
                          opacity: landscapeProgress,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Container(
                                width: 28,
                                height: 1,
                                color: context.brand.gold,
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 10),
                                child: Text(
                                  'PROJECT KASSENA',
                                  style: TextStyle(
                                    color: Colors.white70,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 2.2,
                                  ),
                                ),
                              ),
                              Container(
                                width: 28,
                                height: 1,
                                color: context.brand.gold,
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Transform.translate(
                          offset: Offset(0, 18 * (1 - brandProgress)),
                          child: Opacity(
                            opacity: brandProgress.clamp(0, 1),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _KasemSeal(progress: landscapeProgress),
                                const SizedBox(height: 22),
                                const FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    'INDIGEN WORLD',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 43,
                                      height: 0.95,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: -2.2,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'Kasem lives here.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: context.brand.gold,
                                    fontSize: 21,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 9),
                                ConstrainedBox(
                                  constraints: const BoxConstraints(
                                    maxWidth: 330,
                                  ),
                                  child: const Text(
                                    'Learn the language. Carry the stories. Grow the community.',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      color: Colors.white70,
                                      fontSize: 12,
                                      height: 1.45,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const Spacer(),
                        Opacity(
                          opacity: promiseProgress,
                          child: const _ProjectPillars(),
                        ),
                        const SizedBox(height: 25),
                        Opacity(
                          opacity: promiseProgress,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 360),
                            child: Column(
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      'OPENING THE WORLD OF KASEM',
                                      style: TextStyle(
                                        color: Colors.white.withValues(
                                          alpha: 0.56,
                                        ),
                                        fontSize: 8,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: 1.35,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      '${(_controller.value * 100).round()}%',
                                      style: TextStyle(
                                        color: context.brand.gold,
                                        fontSize: 9,
                                        fontWeight: FontWeight.w800,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(99),
                                  child: LinearProgressIndicator(
                                    value: _controller.value,
                                    minHeight: 3,
                                    color: context.brand.gold,
                                    backgroundColor: Colors.white12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

class _KasemSeal extends StatelessWidget {
  const _KasemSeal({required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: 132,
    child: Stack(
      alignment: Alignment.center,
      children: [
        Transform.rotate(
          angle: progress * math.pi * 0.18,
          child: Container(
            width: 128,
            height: 128,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(38),
              border: Border.all(
                color: context.brand.gold.withValues(alpha: 0.42),
              ),
            ),
          ),
        ),
        Container(
          width: 108,
          height: 108,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFF0B281F).withValues(alpha: 0.82),
            border: Border.all(color: context.brand.gold, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: context.brand.gold.withValues(alpha: 0.18),
                blurRadius: 30,
                spreadRadius: 4,
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.language_rounded, color: context.brand.gold, size: 34),
              const SizedBox(height: 4),
              const Text(
                'K A S E M',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _ProjectPillars extends StatelessWidget {
  const _ProjectPillars();

  @override
  Widget build(BuildContext context) => ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 390),
    child: Row(
      children: [
        const _ProjectPillar(
          icon: Icons.record_voice_over_rounded,
          label: 'LANGUAGE',
        ),
        _PillarDivider(color: context.brand.gold),
        const _ProjectPillar(
          icon: Icons.auto_stories_rounded,
          label: 'STORIES',
        ),
        _PillarDivider(color: context.brand.gold),
        const _ProjectPillar(icon: Icons.groups_rounded, label: 'COMMUNITY'),
      ],
    ),
  );
}

class _ProjectPillar extends StatelessWidget {
  const _ProjectPillar({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: Colors.white70, size: 18),
        const SizedBox(height: 7),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white60,
            fontSize: 8,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.2,
          ),
        ),
      ],
    ),
  );
}

class _PillarDivider extends StatelessWidget {
  const _PillarDivider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 28, color: color.withValues(alpha: 0.28));
}

/// A dawn over Kassena country: the shared horizon and converging paths make
/// the project's purpose visible before a line of interface copy is read.
class _KasenaHorizonPainter extends CustomPainter {
  const _KasenaHorizonPainter(this.progress);

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final gold = Paint()
      ..color = BrandColors.kenteGold.withValues(alpha: 0.1 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final center = Offset(size.width * 0.5, size.height * 0.36);

    for (var ring = 0; ring < 3; ring++) {
      canvas.drawCircle(center, 64 + (ring * 37 * progress), gold);
    }

    canvas.drawCircle(
      center,
      54 * progress,
      Paint()..color = BrandColors.kenteGold.withValues(alpha: 0.12 * progress),
    );

    final hill = Path()
      ..moveTo(0, size.height * 0.68)
      ..quadraticBezierTo(
        size.width * 0.24,
        size.height * 0.59,
        size.width * 0.5,
        size.height * 0.69,
      )
      ..quadraticBezierTo(
        size.width * 0.78,
        size.height * 0.6,
        size.width,
        size.height * 0.67,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      hill,
      Paint()
        ..color = const Color(0xFF071D17).withValues(alpha: 0.38 * progress),
    );

    final pathPaint = Paint()
      ..color = BrandColors.kenteGold.withValues(alpha: 0.13 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (final startX in [0.05, 0.23, 0.77, 0.95]) {
      final path = Path()
        ..moveTo(size.width * startX, size.height)
        ..quadraticBezierTo(
          size.width * (0.5 + ((startX - 0.5) * 0.12)),
          size.height * 0.76,
          size.width * 0.5,
          size.height * 0.64,
        );
      canvas.drawPath(path, pathPaint);
    }

    final motif = Paint()
      ..color = Colors.white.withValues(alpha: 0.035 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    const step = 28.0;
    for (double x = -step; x < size.width + step; x += step) {
      final y = size.height * 0.86;
      canvas.drawPath(
        Path()
          ..moveTo(x, y)
          ..lineTo(x + step / 2, y + step / 2)
          ..lineTo(x + step, y),
        motif,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _KasenaHorizonPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

class _OnboardingScreen extends StatelessWidget {
  const _OnboardingScreen({
    required this.learningPath,
    required this.onPathChanged,
    required this.onContinue,
  });

  final String learningPath;
  final ValueChanged<String> onPathChanged;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 36, 24, 32),
              children: [
                const Align(
                  alignment: Alignment.centerLeft,
                  child: _BrandMark(size: 70),
                ),
                const SizedBox(height: 28),
                Text(
                  l10n.onboardingTitle,
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const SizedBox(height: 14),
                Text(
                  l10n.onboardingBody,
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(color: context.brand.mutedInk),
                ),
                const SizedBox(height: 28),
                Text(
                  l10n.onboardingQuestion,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                // The first element of each record is *stored*, so it stays in
                // English whatever the screen is read in. A preference written in
                // French and later compared against an English constant is a
                // setting that silently forgets itself.
                for (final option in [
                  (
                    'Home community',
                    Icons.home_outlined,
                    l10n.onboardingHome,
                    l10n.onboardingHomeBody,
                  ),
                  (
                    'Diaspora',
                    Icons.flight_outlined,
                    l10n.onboardingDiaspora,
                    l10n.onboardingDiasporaBody,
                  ),
                  (
                    'Visitor or learner',
                    Icons.explore_outlined,
                    l10n.onboardingVisitor,
                    l10n.onboardingVisitorBody,
                  ),
                ]) ...[
                  _PathOption(
                    value: option.$1,
                    icon: option.$2,
                    label: option.$3,
                    description: option.$4,
                    selected: learningPath == option.$1,
                    onTap: () => onPathChanged(option.$1),
                  ),
                  const SizedBox(height: 10),
                ],
                const SizedBox(height: 20),
                FilledButton.icon(
                  onPressed: onContinue,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(l10n.onboardingStart),
                ),
                const SizedBox(height: 12),
                Text(
                  l10n.onboardingGuestNote,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: context.brand.mutedInk, height: 1.4),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: context.brand.gold,
      borderRadius: BorderRadius.circular(size * 0.28),
    ),
    child: Icon(
      Icons.public_rounded,
      color: context.brand.accent,
      size: size * 0.58,
    ),
  );
}

class _PathOption extends StatelessWidget {
  const _PathOption({
    required this.value,
    required this.icon,
    required this.label,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  /// The stored answer, always in English.
  final String value;

  final IconData icon;

  /// What the member reads.
  final String label;

  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    color: selected
        ? context.brand.accent.withValues(alpha: 0.08)
        : Colors.white,
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: context.brand.accent),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: TextStyle(color: context.brand.mutedInk),
                  ),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected
                  ? context.brand.terracotta
                  : context.brand.mutedInk,
            ),
          ],
        ),
      ),
    ),
  );
}
