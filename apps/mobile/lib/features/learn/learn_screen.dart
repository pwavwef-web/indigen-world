import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class LearnScreen extends StatelessWidget {
  const LearnScreen({super.key});

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: ListView(
      key: const PageStorageKey('learn-scroll'),
      padding: const EdgeInsets.only(bottom: 110),
      children: [
        const BrandHeader(
          eyebrow: 'Learn',
          title: 'Build a steady rhythm.',
          subtitle: 'Kasem learning paths unlock after approved lesson packs are ready.',
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: BrandColors.heritageGreen,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const StatusPill(
                      icon: Icons.download_done_rounded,
                      label: 'OFFLINE READY SHELL',
                      color: BrandColors.kenteGold,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Your Kasem path',
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(color: Colors.white),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Choose a community-approved pack when content publishing is connected.',
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: Colors.white.withValues(alpha: 0.82),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const LinearProgressIndicator(value: 0, minHeight: 8),
                    const SizedBox(height: 8),
                    const Text(
                      '0 lessons completed',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const SectionTitle(title: 'Learning modules'),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.record_voice_over_outlined,
                title: 'Everyday foundations',
                description: 'Greetings, family, places, numbers, and practical phrases.',
                gate: 'R3',
              ),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.quiz_outlined,
                title: 'Quick practice',
                description:
                    'Local quizzes with server-verified rewards when enabled.',
                gate: 'R3',
              ),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.workspace_premium_outlined,
                title: 'Progress and certificates',
                description: 'Private progress first; certificates follow a later learning gate.',
                gate: 'LATER',
              ),
              const SizedBox(height: 24),
              const _PackManifestCard(),
            ],
          ),
        ),
      ],
    ),
  );
}

class _PackManifestCard extends StatelessWidget {
  const _PackManifestCard();

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.inventory_2_outlined,
                color: BrandColors.heritageGreen,
              ),
              const SizedBox(width: 10),
              Text(
                'Pack safety',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Downloads will show language, version, size, licence, checksum, and minimum app version before installation.',
          ),
        ],
      ),
    ),
  );
}
