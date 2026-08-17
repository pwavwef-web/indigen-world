import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: CustomScrollView(
      key: const PageStorageKey('explore-scroll'),
      slivers: [
        const SliverToBoxAdapter(
          child: BrandHeader(
            eyebrow: 'Explore',
            title: 'Culture, with context.',
            subtitle: 'Only approved, attributed, mobile-licensed items appear publicly.',
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 110),
          sliver: SliverList.list(
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: BrandColors.kenteGold.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.shield_outlined,
                      color: BrandColors.heritageGreen,
                    ),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Restricted or sacred material is never published by default. Missing permission means not permitted.',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const SectionTitle(title: 'Curated collections'),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.auto_stories_outlined,
                title: 'Stories and oral culture',
                description: 'Stories, proverbs, riddles, and poems with source, rights, and sensitivity context.',
                gate: 'R3',
              ),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.place_outlined,
                title: 'Places and events',
                description: 'Approved heritage places, community events, people, and crafts.',
                gate: 'R4',
              ),
              const SizedBox(height: 12),
              const FeatureLockedCard(
                icon: Icons.storefront_outlined,
                title: 'Artisan showcase',
                description: 'Verified makers and enquiry links; no checkout or wallet in this build.',
                gate: 'R4',
              ),
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Why this area is quiet',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'The app does not use decorative heritage content as filler. Collections appear only when their custodians, attribution, licence, and allowed channels are recorded.',
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
