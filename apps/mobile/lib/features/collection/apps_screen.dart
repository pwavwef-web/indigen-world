import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/collection/apps_and_shop.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:url_launcher/url_launcher.dart';

/// Collection → Apps: the other software worth having on a Kassena phone.
///
/// Every card is a link out to a store, not something installed from here.
/// The directory is admin-curated, so an empty list means nobody has listed
/// anything yet rather than that something is broken — and it says so.
class AppsCollectionScreen extends ConsumerWidget {
  const AppsCollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final apps = ref.watch(directoryAppsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Apps')),
      body: ScreenContainer(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(directoryAppsProvider);
            await ref.read(directoryAppsProvider.future);
          },
          child: CustomScrollView(
            key: const PageStorageKey('collection-apps-scroll'),
            slivers: [
              const SliverToBoxAdapter(
                child: BrandHeader(
                  eyebrow: 'Collection · Apps',
                  title: 'Kasem on every screen.',
                ),
              ),
              ...switch (apps) {
                AsyncData(value: final list) when list.isEmpty => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _CataloguePlaceholder(
                      icon: Icons.apps_rounded,
                      title: 'No apps listed yet',
                      body:
                          'The project adds apps here as they are released. '
                          'Check back soon.',
                    ),
                  ),
                ],
                AsyncData(value: final list) => [
                  _AppRows(apps: list, ads: ref.watch(collectionAdsProvider)),
                ],
                AsyncError() => const [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _CataloguePlaceholder(
                      icon: Icons.cloud_off_rounded,
                      title: 'Could not load the directory',
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

/// The directory, with adverts dealt between the listings.
///
/// The one channel where the boundary has to be unmistakable: every card here
/// is already a link out to a store, so an advert that did not wear the word
/// "Sponsored" would be indistinguishable from a listing the project chose.
/// [SponsoredCard] wears it before it says anything else.
class _AppRows extends StatelessWidget {
  const _AppRows({required this.apps, required this.ads});

  final List<DirectoryApp> apps;
  final List<ServedAd> ads;

  @override
  Widget build(BuildContext context) {
    final rows = collectionRowsWithAds(items: apps, ads: ads);
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
              slot: 'apps-$index',
              margin: EdgeInsets.zero,
            );
          }
          return _AppCard(app: row as DirectoryApp);
        },
      ),
    );
  }
}

class _AppCard extends StatelessWidget {
  const _AppCard({required this.app});

  final DirectoryApp app;

  @override
  Widget build(BuildContext context) {
    final link = app.primaryLink;
    return CollectionCardSurface(
      padding: const EdgeInsets.all(15),
      semanticLabel: '${app.name}. ${app.description}',
      onTap: link == null ? null : () => _open(context, link),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _AppIcon(url: app.iconUrl, name: app.name),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(app.name, style: Theme.of(context).textTheme.titleMedium),
                if (app.developer.isNotEmpty)
                  Text(
                    app.developer,
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontSize: 12,
                    ),
                  ),
                if (app.description.isNotEmpty) ...[
                  const SizedBox(height: 7),
                  Text(
                    app.description,
                    style: const TextStyle(fontSize: 13, height: 1.4),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (app.category.isNotEmpty) ...[
                      _Tag(label: app.category),
                      const SizedBox(width: 7),
                    ],
                    if (link != null)
                      Text(
                        _storeLabel(app),
                        style: TextStyle(
                          color: context.brand.accent,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          Icon(
            Icons.open_in_new_rounded,
            size: 18,
            color: context.brand.mutedInk,
          ),
        ],
      ),
    );
  }

  /// Names the destination rather than saying "open": somebody on a metered
  /// connection deserves to know they are about to be handed to Play.
  static String _storeLabel(DirectoryApp app) {
    if (app.links['android']?.isNotEmpty ?? false) return 'GOOGLE PLAY';
    if (app.links['ios']?.isNotEmpty ?? false) return 'APP STORE';
    return 'OPEN WEBSITE';
  }

  static Future<void> _open(BuildContext context, String link) async {
    final uri = Uri.tryParse(link);
    final opened =
        uri != null &&
        await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open that link.')),
      );
    }
  }
}

class _AppIcon extends StatelessWidget {
  const _AppIcon({required this.url, required this.name});

  final String url;
  final String name;

  @override
  Widget build(BuildContext context) {
    final fallback = DecoratedBox(
      decoration: BoxDecoration(
        color: context.brand.accent.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Center(
        child: Text(
          name.isEmpty ? '·' : name.characters.first.toUpperCase(),
          style: TextStyle(
            color: context.brand.accent,
            fontWeight: FontWeight.w900,
            fontSize: 22,
          ),
        ),
      ),
    );
    return SizedBox.square(
      dimension: 54,
      child: url.isEmpty
          ? fallback
          : ClipRRect(
              borderRadius: BorderRadius.circular(15),
              child: CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                placeholder: (context, _) => fallback,
                errorWidget: (context, _, _) => fallback,
              ),
            ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
    decoration: BoxDecoration(
      color: context.brand.gold.withValues(alpha: 0.16),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label.toUpperCase(),
      style: const TextStyle(
        fontSize: 9.5,
        fontWeight: FontWeight.w900,
        letterSpacing: 0.6,
        color: Color(0xFF6B5518),
      ),
    ),
  );
}

/// Shared empty / error state for both catalogues.
class _CataloguePlaceholder extends StatelessWidget {
  const _CataloguePlaceholder({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(32, 40, 32, 60),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 44, color: context.brand.mutedInk),
        const SizedBox(height: 14),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 7),
        Text(
          body,
          textAlign: TextAlign.center,
          style: TextStyle(color: context.brand.mutedInk, height: 1.5),
        ),
      ],
    ),
  );
}

/// Reused by the shop so both catalogues fail and empty the same way.
class CataloguePlaceholder extends StatelessWidget {
  const CataloguePlaceholder({
    required this.icon,
    required this.title,
    required this.body,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) =>
      _CataloguePlaceholder(icon: icon, title: title, body: body);
}

/// Reused by the shop for category chips.
class CatalogueTag extends StatelessWidget {
  const CatalogueTag({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) => _Tag(label: label);
}
