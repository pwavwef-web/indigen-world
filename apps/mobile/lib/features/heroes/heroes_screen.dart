import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/features/heroes/hero_detail_screen.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

/// Collection → Heroes: the people the Kassena remember.
class HeroesCollectionScreen extends ConsumerWidget {
  const HeroesCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final heroes = ref.watch(kasemHeroesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Heroes')),
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(kasemHeroesProvider);
            await ref.read(kasemHeroesProvider.future);
          },
          child: CustomScrollView(
            key: const PageStorageKey('collection-heroes-scroll'),
            slivers: [
              const SliverToBoxAdapter(
                child: BrandHeader(
                  eyebrow: 'Collection · Heroes',
                  title: 'The names we keep.',
                  subtitle:
                      'Chiefs, linguists, musicians and elders — the people '
                      'Kassena history is carried by.',
                ),
              ),
              ...switch (heroes) {
                AsyncValue(:final value?) when value.isEmpty => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _HeroesPlaceholder(
                      icon: Icons.stars_rounded,
                      title: 'Nobody has been added yet',
                      body:
                          'The project writes these one at a time, with the '
                          'families and elders who remember them. Check back.',
                    ),
                  ),
                ],
                AsyncValue(:final value?) => [
                  _HeroRows(
                    heroes: value,
                    ads: ref.watch(collectionAdsProvider),
                  ),
                ],
                AsyncValue(hasError: true) => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _HeroesPlaceholder(
                      icon: Icons.cloud_off_rounded,
                      title: 'Could not load the names',
                      body: 'Check your connection and pull down to try again.',
                    ),
                  ),
                ],
                _ => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
              },
            ],
          ),
        ),
      ),
    );
  }
}

/// The names, with adverts dealt between them.
class _HeroRows extends StatelessWidget {
  const _HeroRows({required this.heroes, required this.ads});

  final List<KasemHero> heroes;
  final List<ServedAd> ads;

  @override
  Widget build(BuildContext context) {
    final rows = collectionRowsWithAds(items: heroes, ads: ads);
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 40),
      sliver: SliverList.separated(
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final row = rows[index];
          if (row is ServedAd) {
            return SponsoredCard(
              ad: row,
              slot: 'heroes-$index',
              margin: EdgeInsets.zero,
            );
          }
          return HeroCard(hero: row as KasemHero);
        },
      ),
    );
  }
}

/// One hero, as a row.
class HeroCard extends StatelessWidget {
  const HeroCard({required this.hero, super.key});

  final KasemHero hero;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return CollectionCardSurface(
      accent: brand.gold,
      padding: const EdgeInsets.all(14),
      semanticLabel: '${hero.name}. ${hero.subtitle}',
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (context) => HeroDetailScreen(hero: hero),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          HeroPortrait(hero: hero, size: 62),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hero.name,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (hero.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    hero.subtitle,
                    style: TextStyle(
                      color: brand.gold,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
                if (hero.summary.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    hero.summary,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: brand.mutedInk,
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A portrait, or the initials of somebody who lived before cameras reached
/// Paga — which is most of them, and is not a missing image.
class HeroPortrait extends StatelessWidget {
  const HeroPortrait({required this.hero, this.size = 62, super.key});

  final KasemHero hero;
  final double size;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: brand.accentFill,
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: brand.gold.withValues(alpha: 0.5), width: 2),
      ),
      child: hero.portraitUrl.isEmpty
          ? Center(
              child: Text(
                hero.initials,
                style: TextStyle(
                  color: brand.gold,
                  fontSize: size * 0.32,
                  fontWeight: FontWeight.w900,
                ),
              ),
            )
          : CachedNetworkImage(
              imageUrl: hero.portraitUrl,
              fit: BoxFit.cover,
              errorWidget: (context, url, error) => Center(
                child: Text(
                  hero.initials,
                  style: TextStyle(
                    color: brand.gold,
                    fontSize: size * 0.32,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
    );
  }
}

class _HeroesPlaceholder extends StatelessWidget {
  const _HeroesPlaceholder({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(32, 20, 32, 60),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: context.brand.mutedInk),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(color: context.brand.mutedInk, height: 1.45),
          ),
        ],
      ),
    ),
  );
}
