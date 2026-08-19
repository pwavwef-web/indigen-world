import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StartupGate extends StatefulWidget {
  const StartupGate({super.key});

  @override
  State<StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends State<StartupGate> {
  static const _onboardingKey = 'indigen_world_onboarding_complete_v1';
  bool? _onboardingComplete;
  String _learningPath = 'Home community';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final preferences = await SharedPreferences.getInstance();
    await Future<void>.delayed(const Duration(milliseconds: 3100));
    if (!mounted) return;
    setState(
      () => _onboardingComplete = preferences.getBool(_onboardingKey) ?? false,
    );
  }

  Future<void> _finish() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_onboardingKey, true);
    await preferences.setString(
      'indigen_world_learning_path_v1',
      _learningPath,
    );
    if (!mounted) return;
    setState(() => _onboardingComplete = true);
  }

  @override
  Widget build(BuildContext context) {
    if (_onboardingComplete == null) {
      return const _LaunchScreen();
    }
    if (_onboardingComplete!) {
      return const AppShell();
    }
    return _OnboardingScreen(
      learningPath: _learningPath,
      onPathChanged: (value) => setState(() => _learningPath = value),
      onContinue: _finish,
    );
  }
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
        final artifactProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0, 0.56, curve: Curves.easeInOutCubic),
        ).value;
        final brandProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.34, 0.78, curve: Curves.easeOutCubic),
        ).value;
        final taglineProgress = CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.68, 0.95, curve: Curves.easeOut),
        ).value;

        return DecoratedBox(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              radius: 1.2,
              center: Alignment(0, -0.12),
              colors: [Color(0xFF174B39), Color(0xFF071D17), Color(0xFF050807)],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              const _LaunchPattern(),
              for (final artifact in _launchArtifacts)
                _ArtifactFlight(artifact: artifact, progress: artifactProgress),
              SafeArea(
                child: Center(
                  child: Transform.translate(
                    offset: Offset(0, 16 * (1 - brandProgress)),
                    child: Opacity(
                      opacity: brandProgress,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            'LANGUAGE  ·  STORY  ·  RHYTHM  ·  IDENTITY',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: BrandColors.kenteGold.withValues(
                                alpha: 0.9,
                              ),
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.5,
                            ),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            'INDIGEN',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 52,
                              height: 0.82,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -3 + (3 * (1 - brandProgress)),
                            ),
                          ),
                          const SizedBox(height: 11),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 13,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              border: Border.all(color: Colors.white54),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'W O R L D',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 6,
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),
                          Opacity(
                            opacity: taglineProgress,
                            child: const Text(
                              'Our culture is not behind us. It is becoming.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: 26,
                child: Opacity(
                  opacity: taglineProgress,
                  child: const LinearProgressIndicator(
                    minHeight: 2,
                    color: BrandColors.kenteGold,
                    backgroundColor: Colors.white12,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _LaunchPattern extends StatelessWidget {
  const _LaunchPattern();

  @override
  Widget build(BuildContext context) => const Opacity(
    opacity: 0.055,
    child: GridPaper(
      color: BrandColors.kenteGold,
      interval: 42,
      divisions: 2,
      subdivisions: 1,
      child: SizedBox.expand(),
    ),
  );
}

class _ArtifactFlight extends StatelessWidget {
  const _ArtifactFlight({required this.artifact, required this.progress});

  final _LaunchArtifact artifact;
  final double progress;

  @override
  Widget build(BuildContext context) {
    final alignment = Alignment.lerp(artifact.start, artifact.end, progress)!;
    final opacity = (progress < 0.78 ? progress : (1 - progress) * 4.5)
        .clamp(0.0, 1.0)
        .toDouble();
    return Align(
      alignment: alignment,
      child: Transform.rotate(
        angle: (1 - progress) * artifact.rotation,
        child: Opacity(
          opacity: opacity,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: artifact.size,
                height: artifact.size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: artifact.color.withValues(alpha: 0.14),
                  border: Border.all(
                    color: artifact.color.withValues(alpha: 0.7),
                  ),
                ),
                child: Center(
                  child: Text(
                    artifact.glyph,
                    style: TextStyle(
                      color: artifact.color,
                      fontSize: artifact.size * 0.5,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 5),
              Text(
                artifact.label,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 7,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LaunchArtifact {
  const _LaunchArtifact({
    required this.glyph,
    required this.label,
    required this.start,
    required this.end,
    required this.color,
    required this.size,
    required this.rotation,
  });

  final String glyph;
  final String label;
  final Alignment start;
  final Alignment end;
  final Color color;
  final double size;
  final double rotation;
}

const _launchArtifacts = [
  _LaunchArtifact(
    glyph: '◒',
    label: 'CALABASH',
    start: Alignment(-0.9, -0.84),
    end: Alignment(-0.3, -0.12),
    color: BrandColors.kenteGold,
    size: 54,
    rotation: -0.8,
  ),
  _LaunchArtifact(
    glyph: '▥',
    label: 'DRUM',
    start: Alignment(0.92, -0.72),
    end: Alignment(0.28, -0.12),
    color: BrandColors.terracotta,
    size: 60,
    rotation: 0.7,
  ),
  _LaunchArtifact(
    glyph: '◉',
    label: 'COWRIE',
    start: Alignment(-0.94, 0.62),
    end: Alignment(-0.18, 0.08),
    color: BrandColors.surface,
    size: 46,
    rotation: 1.1,
  ),
  _LaunchArtifact(
    glyph: '✣',
    label: 'SYMBOL',
    start: Alignment(0.9, 0.7),
    end: Alignment(0.2, 0.08),
    color: BrandColors.kenteGold,
    size: 58,
    rotation: -1,
  ),
  _LaunchArtifact(
    glyph: '●',
    label: 'BEAD',
    start: Alignment(-0.72, 0.02),
    end: Alignment(-0.08, -0.02),
    color: BrandColors.terracotta,
    size: 34,
    rotation: 0.4,
  ),
  _LaunchArtifact(
    glyph: '◆',
    label: 'WEAVE',
    start: Alignment(0.74, 0.06),
    end: Alignment(0.08, -0.02),
    color: BrandColors.surface,
    size: 38,
    rotation: -0.5,
  ),
];

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
  Widget build(BuildContext context) => Scaffold(
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
                'Language lives\nwith people.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 14),
              Text(
                'Learn, search, and contribute through Project Kasena—the first language cell in Indigen World.',
                style: Theme.of(context).textTheme.bodyLarge
                    ?.copyWith(color: BrandColors.mutedInk),
              ),
              const SizedBox(height: 28),
              Text(
                'What brings you here?',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              for (final option in const [
                (
                  'Home community',
                  Icons.home_outlined,
                  'Stay close to language used around you.',
                ),
                (
                  'Diaspora',
                  Icons.flight_outlined,
                  'Reconnect and practise from wherever you are.',
                ),
                (
                  'Visitor or learner',
                  Icons.explore_outlined,
                  'Learn respectfully with context and attribution.',
                ),
              ]) ...[
                _PathOption(
                  value: option.$1,
                  icon: option.$2,
                  description: option.$3,
                  selected: learningPath == option.$1,
                  onTap: () => onPathChanged(option.$1),
                ),
                const SizedBox(height: 10),
              ],
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: onContinue,
                icon: const Icon(Icons.arrow_forward_rounded),
                label: const Text('Start with Kasem'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Public dictionary and learning content work without sign-in. You can choose an account later.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.mutedInk, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: BrandColors.kenteGold,
      borderRadius: BorderRadius.circular(size * 0.28),
    ),
    child: Icon(
      Icons.public_rounded,
      color: BrandColors.heritageGreen,
      size: size * 0.58,
    ),
  );
}

class _PathOption extends StatelessWidget {
  const _PathOption({
    required this.value,
    required this.icon,
    required this.description,
    required this.selected,
    required this.onTap,
  });

  final String value;
  final IconData icon;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    color: selected
        ? BrandColors.heritageGreen.withValues(alpha: 0.08)
        : Colors.white,
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: BrandColors.heritageGreen),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: const TextStyle(color: BrandColors.mutedInk),
                  ),
                ],
              ),
            ),
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? BrandColors.terracotta : BrandColors.mutedInk,
            ),
          ],
        ),
      ),
    ),
  );
}
