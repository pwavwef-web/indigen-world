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

class _LaunchScreen extends StatelessWidget {
  const _LaunchScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    backgroundColor: BrandColors.heritageGreen,
    body: SafeArea(
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _BrandMark(size: 86),
            SizedBox(height: 22),
            Text(
              'INDIGEN WORLD',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w900,
                letterSpacing: 2,
              ),
            ),
            SizedBox(height: 18),
            SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(
                color: BrandColors.kenteGold,
                strokeWidth: 3,
              ),
            ),
          ],
        ),
      ),
    ),
  );
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
