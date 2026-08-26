import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/apps_and_shop.dart';
import 'package:indigen_world_mobile/features/collection/apps_screen.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/collection/shop_screen.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

class CollectionScreen extends ConsumerWidget {
  const CollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dictionary = ref.watch(publishedDictionaryEntriesProvider);
    final music = ref.watch(musicCollectionProvider);
    final literature = ref.watch(literatureCollectionProvider);
    final audiobooks = ref.watch(audiobookCollectionProvider);
    final apps = ref.watch(directoryAppsProvider);
    final shop = ref.watch(shopProductsProvider);
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final useSingleColumn = textScale > 1.1;
    final portals = <Widget>[
      _CollectionPortalCard(
        label: CollectionKind.music.label,
        icon: Icons.graphic_eq_rounded,
        color: BrandColors.terracotta,
        count: _count(music),
        description: 'Songs, instruments, and community sound.',
        onTap: () => _open(context, const MusicCollectionScreen()),
      ),
      _CollectionPortalCard(
        label: CollectionKind.dictionary.label,
        icon: Icons.translate_rounded,
        color: BrandColors.heritageGreen,
        count: _count(dictionary),
        description: 'Kasem words, meanings, and examples.',
        onTap: () => _open(context, const DictionaryCollectionScreen()),
      ),
      _CollectionPortalCard(
        label: CollectionKind.literature.label,
        icon: Icons.auto_stories_rounded,
        color: BrandColors.savannahGreen,
        count: _count(literature),
        description: 'Stories, poetry, and living histories.',
        onTap: () => _open(context, const LiteratureCollectionScreen()),
      ),
      _CollectionPortalCard(
        label: CollectionKind.audiobooks.label,
        icon: Icons.headphones_rounded,
        color: const Color(0xFF735C25),
        count: _count(audiobooks),
        description: 'Narrated works for listening anywhere.',
        onTap: () => _open(context, const AudiobookCollectionScreen()),
      ),
      // Apps and Shop sit alongside the archive rather than inside it: one
      // sends members out to software worth having, the other to things the
      // project makes and sells. Neither is contributed to, which is why
      // neither is a CollectionKind.
      _CollectionPortalCard(
        label: 'Apps',
        icon: Icons.apps_rounded,
        color: const Color(0xFF2F6F8F),
        count: _count(apps),
        description: 'Kasem apps, scripture and other Indigen releases.',
        onTap: () => _open(context, const AppsCollectionScreen()),
      ),
      _CollectionPortalCard(
        label: 'Shop',
        icon: Icons.storefront_rounded,
        color: const Color(0xFF8C3B2E),
        count: _count(shop),
        description: 'Souvenirs, books and shea butter from Kasena makers.',
        onTap: () => _open(context, const ShopCollectionScreen()),
      ),
    ];

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: const Padding(
        padding: EdgeInsets.only(bottom: kFrostedNavBarReservedSpace - 26),
        child: KawuriFab(),
      ),
      body: ScreenContainer(
        child: CustomScrollView(
          key: const PageStorageKey('collection-overview-scroll'),
          slivers: [
            const SliverToBoxAdapter(child: _CollectionHero()),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 2, 18, 12),
              sliver: SliverToBoxAdapter(
                child: _FirebaseStatus(
                  loading:
                      dictionary.isLoading ||
                      music.isLoading ||
                      literature.isLoading ||
                      audiobooks.isLoading ||
                      apps.isLoading ||
                      shop.isLoading,
                  hasError:
                      dictionary.hasError ||
                      music.hasError ||
                      literature.hasError ||
                      audiobooks.hasError ||
                      apps.hasError ||
                      shop.hasError,
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 8, 18, 16),
              sliver: useSingleColumn
                  ? SliverList.separated(
                      itemCount: portals.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, index) => portals[index],
                    )
                  // The tile height is measured, not guessed. A ratio of the
                  // tile width re-decides how much room the caption gets every
                  // time the device width or the text scale moves, and on a
                  // 540-wide screen it decided seven pixels too few. Asking the
                  // sliver how wide it actually is lets the height be stated in
                  // logical pixels with the caption budgeted first.
                  : SliverLayoutBuilder(
                      builder: (context, constraints) => SliverGrid(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          crossAxisSpacing: _portalGridGap,
                          mainAxisSpacing: _portalGridGap,
                          mainAxisExtent: _portalTileExtent(
                            (constraints.crossAxisExtent - _portalGridGap) / 2,
                            textScale,
                          ),
                        ),
                        delegate: SliverChildListDelegate.fixed(portals),
                      ),
                    ),
            ),
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(18, 8, 18, 138),
              sliver: SliverToBoxAdapter(child: _StewardshipNote()),
            ),
          ],
        ),
      ),
    );
  }

  static int? _count<T>(AsyncValue<List<T>> value) =>
      value.asData?.value.length;

  static void _open(BuildContext context, Widget screen) {
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (context) => screen));
  }
}

class _CollectionHero extends StatelessWidget {
  const _CollectionHero();

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 52, 16, 14),
    padding: const EdgeInsets.fromLTRB(22, 20, 22, 22),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(30),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF082F25), BrandColors.heritageGreen],
      ),
      boxShadow: [
        BoxShadow(
          color: BrandColors.heritageGreen.withValues(alpha: 0.25),
          blurRadius: 30,
          offset: const Offset(0, 14),
        ),
      ],
    ),
    child: Stack(
      children: [
        const Positioned(
          right: -22,
          bottom: -38,
          child: Opacity(
            opacity: 0.08,
            child: Icon(Icons.hub_rounded, color: Colors.white, size: 158),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.collections_bookmark_rounded,
                  color: BrandColors.kenteGold,
                  size: 18,
                ),
                SizedBox(width: 8),
                Text(
                  'THE KASENA COLLECTION',
                  style: TextStyle(
                    color: BrandColors.kenteGold,
                    fontWeight: FontWeight.w900,
                    fontSize: 10,
                    letterSpacing: 1.25,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            Text(
              'Knowledge, kept alive.',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: Colors.white,
                height: 1,
                letterSpacing: -0.7,
              ),
            ),
            const SizedBox(height: 9),
            Text(
              'Choose a collection to explore work published by the community.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.white.withValues(alpha: 0.76),
                height: 1.4,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _FirebaseStatus extends StatelessWidget {
  const _FirebaseStatus({required this.loading, required this.hasError});

  final bool loading;
  final bool hasError;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
    decoration: BoxDecoration(
      color: hasError
          ? BrandColors.terracotta.withValues(alpha: 0.08)
          : Colors.white.withValues(alpha: 0.64),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: hasError
            ? BrandColors.terracotta.withValues(alpha: 0.28)
            : BrandColors.heritageGreen.withValues(alpha: 0.12),
      ),
    ),
    child: Row(
      children: [
        if (loading)
          const SizedBox.square(
            dimension: 17,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else
          Icon(
            hasError ? Icons.cloud_off_rounded : Icons.cloud_done_rounded,
            size: 18,
            color: hasError
                ? BrandColors.terracotta
                : BrandColors.savannahGreen,
          ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            loading
                ? 'Refreshing the community library…'
                : hasError
                ? 'Some collections could not refresh. Open one to retry.'
                : 'Live community library · published entries only',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class _CollectionPortalCard extends StatelessWidget {
  const _CollectionPortalCard({
    required this.label,
    required this.icon,
    required this.color,
    required this.count,
    required this.description,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final int? count;
  final String description;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => CollectionCardSurface(
    semanticLabel: '$label collection',
    onTap: onTap,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final artwork = _PortalArtwork(icon: icon, color: color, count: count);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // The grid hands the card a tile of a stated height and the
            // single-column fallback hands it none at all, so the card asks
            // which it is rather than assuming. Given a height, the artwork
            // takes whatever the caption leaves and the caption can never be
            // pushed past the bottom edge; left free, the artwork keeps the
            // 4:3 band the design was drawn around.
            if (constraints.hasBoundedHeight)
              Expanded(child: artwork)
            else
              AspectRatio(aspectRatio: 4 / 3, child: artwork),
            _PortalCaption(
              label: label,
              color: color,
              count: count,
              description: description,
            ),
          ],
        );
      },
    ),
  );
}

class _PortalArtwork extends StatelessWidget {
  const _PortalArtwork({
    required this.icon,
    required this.color,
    required this.count,
  });

  final IconData icon;
  final Color color;
  final int? count;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              color.withValues(alpha: 0.08),
              color.withValues(alpha: 0.2),
            ],
          ),
        ),
        child: Icon(icon, color: color, size: 58),
      ),
      Positioned(
        top: 10,
        right: 10,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: BrandColors.heritageGreen,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            count == null ? '…' : '$count',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: BrandColors.kenteGold,
              fontSize: 11,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    ],
  );
}

/// The words under a portal's artwork. Every line here is capped, because this
/// is the block whose height the tile is sized around: a title that wrapped or
/// a fourth line of description would be height the artwork has already spent.
class _PortalCaption extends StatelessWidget {
  const _PortalCaption({
    required this.label,
    required this.color,
    required this.count,
    required this.description,
  });

  final String label;
  final Color color;
  final int? count;
  final String description;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(13),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          description,
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: BrandColors.mutedInk,
            fontSize: 11,
            height: 1.3,
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: Text(
                count == null
                    ? 'Loading…'
                    : count == 0
                    ? 'Open collection'
                    : '$count published',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const Icon(
              Icons.north_east_rounded,
              color: BrandColors.mutedInk,
              size: 16,
            ),
          ],
        ),
      ],
    ),
  );
}

class _StewardshipNote extends StatelessWidget {
  const _StewardshipNote();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(17),
    decoration: BoxDecoration(
      color: BrandColors.kenteGold.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: BrandColors.kenteGold.withValues(alpha: 0.28)),
    ),
    child: const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.verified_user_outlined, color: BrandColors.heritageGreen),
        SizedBox(width: 12),
        Expanded(
          child: Text(
            'Only work marked for publication appears here. Rights, consent, and cultural review remain part of every contribution.',
            style: TextStyle(fontWeight: FontWeight.w700, height: 1.4),
          ),
        ),
      ],
    ),
  );
}

/// The gap between portal tiles, shared by the grid delegate and the tile
/// height arithmetic so the two can never drift apart.
const _portalGridGap = 12.0;

/// What a portal caption needs at the default text scale: 26 of padding, a
/// 24px title line, 4, three 14.3px description lines, 10, and a footer row the
/// 16px arrow holds open. That comes to 123; the rest is headroom for a font
/// whose metrics run taller than the ones measured here.
const _portalCaptionExtent = 132.0;

/// The height of one portal tile, in logical pixels.
///
/// The caption is budgeted first and the artwork takes the remainder, which is
/// the whole point: a caption sized against a tile whose height came from a
/// width ratio is a caption that overflows the moment the device width or the
/// text scale changes. The artwork asks for a 4:3 band on top of the caption
/// but is never given so little that the glyph and the count badge crowd each
/// other on a narrow phone.
double _portalTileExtent(double tileWidth, double textScale) =>
    _portalCaptionExtent * textScale + math.max(tileWidth * 3 / 4, 104.0);
