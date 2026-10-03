import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/ads/admob_native.dart';
import 'package:indigen_world_mobile/features/ads/data/ad_campaign.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/collection/apps_and_shop.dart';
import 'package:indigen_world_mobile/features/collection/apps_screen.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/collection/shop_screen.dart';
import 'package:indigen_world_mobile/features/collection/widgets/collection_card_surface.dart';
import 'package:indigen_world_mobile/features/collection/widgets/place_story_carousel.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_data.dart';
import 'package:indigen_world_mobile/features/heroes/heroes_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_fab.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_screen.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';
import 'package:indigen_world_mobile/shared/reveal_route.dart';

class CollectionScreen extends ConsumerStatefulWidget {
  const CollectionScreen({super.key});

  @override
  ConsumerState<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends ConsumerState<CollectionScreen>
    with AutomaticKeepAliveClientMixin {
  final _searchController = TextEditingController();
  Timer? _searchDebounce;
  var _query = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 260), () {
      if (!mounted) return;
      final next = value.trim();
      if (next == _query) return;
      setState(() => _query = next);
    });
  }

  void _clearSearch() {
    _searchDebounce?.cancel();
    _searchController.clear();
    if (_query.isNotEmpty) setState(() => _query = '');
  }

  void _resetFilters() {
    _searchDebounce?.cancel();
    _searchController.clear();
    setState(() {
      _query = '';
    });
  }

  void _retryAll() {
    ref.invalidate(musicCollectionProvider);
    ref.invalidate(publishedDictionaryEntriesProvider);
    ref.invalidate(literatureCollectionProvider);
    ref.invalidate(audiobookCollectionProvider);
    ref.invalidate(kasemHeroesProvider);
    ref.invalidate(directoryAppsProvider);
    ref.invalidate(shopProductsProvider);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    final l10n = AppLocalizations.of(context);
    final portals = <_CollectionPortal>[
      _portal<PublishedReel>(
        title: l10n.collectionMusic,
        icon: Icons.graphic_eq_rounded,
        // Music, Dictionary and Literature each need a hue of their own now
        // that the palette's accents are all one blue family.
        color: musicChannelColor(context.brand, CollectionKind.music),
        value: ref.watch(musicCollectionProvider),
        aliases: const ['songs', 'audio', 'recordings'],
        itemMatches: _publishedReelMatches,
        onRetry: () => ref.invalidate(musicCollectionProvider),
        liveKind: CollectionKind.music,
        onOpen: (tile) => _open(tile, const MusicScreen()),
      ),
      _portal<DictionaryEntry>(
        title: l10n.collectionDictionary,
        icon: Icons.translate_rounded,
        color: context.brand.accent,
        value: ref.watch(publishedDictionaryEntriesProvider),
        aliases: const ['words', 'kasem', 'english', 'translation'],
        itemMatches: (entry, query) => entry.matches(query),
        onRetry: () => ref.invalidate(publishedDictionaryEntriesProvider),
        onOpen: (tile) => _open(tile, const DictionaryCollectionScreen()),
      ),
      _portal<PublishedReel>(
        title: l10n.collectionLiterature,
        icon: Icons.auto_stories_rounded,
        color: context.brand.pick(
          const Color(0xFF5B45C4),
          const Color(0xFFB9A3E3),
        ),
        value: ref.watch(literatureCollectionProvider),
        aliases: const [
          'stories',
          'folktales',
          'short stories',
          'drama',
          'poetry',
          'poems',
          'food',
          'cooking',
          'recipes',
          'writing',
          'books',
        ],
        itemMatches: _publishedReelMatches,
        onRetry: () => ref.invalidate(literatureCollectionProvider),
        onOpen: (tile) => _open(tile, const LiteratureCollectionScreen()),
      ),
      _portal<PublishedReel>(
        title: l10n.collectionAudiobooks,
        icon: Icons.headphones_rounded,
        color: context.brand.gold,
        value: ref.watch(audiobookCollectionProvider),
        aliases: const ['audio books', 'readings', 'spoken'],
        itemMatches: _publishedReelMatches,
        onRetry: () => ref.invalidate(audiobookCollectionProvider),
        liveKind: CollectionKind.audiobooks,
        onOpen: (tile) =>
            _open(tile, const MusicScreen(kind: CollectionKind.audiobooks)),
      ),
      _portal<KasemHero>(
        title: l10n.collectionHeroes,
        icon: Icons.stars_rounded,
        color: context.brand.gold,
        value: ref.watch(kasemHeroesProvider),
        aliases: const ['people', 'elders', 'chiefs', 'history'],
        itemMatches: _heroMatches,
        onRetry: () => ref.invalidate(kasemHeroesProvider),
        onOpen: (tile) => _open(tile, const HeroesCollectionScreen()),
        hideWhenEmpty: true,
      ),
      _portal<DirectoryApp>(
        title: l10n.collectionApps,
        icon: Icons.apps_rounded,
        color: const Color(0xFF4EA5CE),
        value: ref.watch(directoryAppsProvider),
        aliases: const ['software', 'directory'],
        itemMatches: _directoryAppMatches,
        onRetry: () => ref.invalidate(directoryAppsProvider),
        onOpen: (tile) => _open(tile, const AppsCollectionScreen()),
        hideWhenEmpty: true,
      ),
      _portal<ShopProduct>(
        title: l10n.collectionShop,
        icon: Icons.storefront_rounded,
        color: const Color(0xFFC76F54),
        value: ref.watch(shopProductsProvider),
        aliases: const ['store', 'products', 'craft', 'souvenirs'],
        itemMatches: _shopProductMatches,
        onRetry: () => ref.invalidate(shopProductsProvider),
        onOpen: (tile) => _open(tile, const ShopCollectionScreen()),
        hideWhenEmpty: true,
      ),
    ];

    final query = _normalise(_query);
    final visiblePortals = portals
        .where((portal) => !portal.hiddenWhileEmpty)
        .where((portal) => portal.matchesSearch(query))
        .toList(growable: false);
    final hasLoading = portals.any((portal) => portal.loading);
    final hasErrors = portals.any((portal) => portal.failed);
    final adInventory = ref.watch(
      placementInventoryProvider(AdPlacement.collection),
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: shellBottomReserve(context) - 26),
        child: const KawuriFab(),
      ),
      body: ScreenContainer(
        child: CustomScrollView(
          key: const PageStorageKey('collection-overview-scroll'),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            const SliverToBoxAdapter(child: _CollectionHeader()),
            SliverToBoxAdapter(
              child: _CollectionSearchField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                onClear: _clearSearch,
              ),
            ),
            if (query.isEmpty)
              const SliverToBoxAdapter(child: PlaceStoryCarousel()),
            if (visiblePortals.isNotEmpty) ...[
              _CollectionGrid(portals: visiblePortals),
              if (query.isEmpty && _hasOverviewAd(adInventory))
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  sliver: SliverToBoxAdapter(
                    child: UnifiedAdSlot(
                      slot: adInventory.slot(0),
                      firstPartyBuilder: (context, ad) =>
                          SizedBox(height: 230, child: SponsoredTile(ad: ad)),
                    ),
                  ),
                ),
            ] else if (hasLoading)
              const _CollectionGridSkeleton()
            else if (hasErrors)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _CollectionErrorState(onRetry: _retryAll),
              )
            else
              SliverFillRemaining(
                hasScrollBody: false,
                child: _CollectionEmptySearchState(
                  query: _query,
                  onReset: _resetFilters,
                ),
              ),
            SliverToBoxAdapter(
              child: SizedBox(height: shellBottomReserve(context) + 28),
            ),
          ],
        ),
      ),
    );
  }

  _CollectionPortal _portal<T>({
    required String title,
    required IconData icon,
    required Color color,
    required AsyncValue<List<T>> value,
    required List<String> aliases,
    required bool Function(T item, String query) itemMatches,
    required VoidCallback onRetry,
    required ValueChanged<BuildContext> onOpen,
    CollectionKind? liveKind,
    bool available = true,
    bool hideWhenEmpty = false,
  }) {
    final data = value.asData?.value;
    final failed = data == null && value.hasError;
    return _CollectionPortal(
      title: title,
      icon: icon,
      color: color,
      aliases: aliases,
      count: data?.length,
      loading: data == null && !value.hasError,
      failed: failed,
      available: available,
      onRetry: failed ? onRetry : null,
      onOpen: available ? onOpen : null,
      liveKind: liveKind,
      hideWhenEmpty: hideWhenEmpty,
      contentMatches: data == null
          ? null
          : (query) => data.any((item) => itemMatches(item, query)),
    );
  }

  /// Whether the overview's one advert position has anything to show.
  ///
  /// ── Why it sits under the grid and not in the story carousel ─────────────
  /// It used to be the carousel's last page. That carousel advances by itself
  /// every three seconds, so the advert slid into the place a thumb was already
  /// reaching for a story card — the accidental click Google's guidance warns
  /// about — and when Google had nothing to fill it, or consent did not allow a
  /// request, the carousel still stopped on an empty page every cycle. Here it
  /// stands still, below the channels, after the last thing anybody came to
  /// tap, and it takes no room at all when there is nothing to show.
  static bool _hasOverviewAd(AdPlacementInventory inventory) =>
      inventory.allowed &&
      inventory.resolved &&
      (inventory.firstParty.isNotEmpty || inventory.adMobEligible);

  /// Opens [screen] out of the tile that was tapped: the card becomes the page.
  static void _open(BuildContext tile, Widget screen) {
    Navigator.of(tile).push(
      RevealPageRoute<void>(
        origin: globalRectOf(tile),
        originRadius: 22,
        originColor: tile.brand.surface,
        builder: (context) => screen,
      ),
    );
  }
}

class _CollectionPortal {
  const _CollectionPortal({
    required this.title,
    required this.icon,
    required this.color,
    required this.aliases,
    required this.count,
    required this.loading,
    required this.failed,
    required this.available,
    required this.onRetry,
    required this.onOpen,
    required this.contentMatches,
    this.liveKind,
    this.hideWhenEmpty = false,
  });

  final String title;
  final IconData icon;
  final Color color;
  final List<String> aliases;
  final int? count;
  final bool loading;
  final bool failed;
  final bool available;
  final VoidCallback? onRetry;

  /// Opens the channel, given the tile's own context so the page can grow
  /// out of the tile.
  final ValueChanged<BuildContext>? onOpen;
  final bool Function(String query)? contentMatches;

  /// The player collection this channel is, when it is one — so the tile can
  /// say it is playing.
  final CollectionKind? liveKind;

  /// Whether the tile stays off the grid while its catalogue is empty.
  ///
  /// For the three the console curates by hand — heroes, the app directory
  /// and the shop. Each used to sit on the grid saying "0 published" and open
  /// an empty screen, a door into a room with nothing in it. They come back on
  /// their own the moment something is published. The archive's own channels
  /// always show, empty or not: an empty Music shelf is an invitation to add
  /// the first song, and its screen says so.
  final bool hideWhenEmpty;

  /// Loaded, empty, and one of the tiles that hides when it is.
  bool get hiddenWhileEmpty =>
      hideWhenEmpty && !loading && !failed && (count ?? 0) == 0;

  bool get isOpen => available && onOpen != null;
  bool get hasPublished => count != null && count! > 0;

  bool matchesSearch(String query) {
    if (query.isEmpty) return true;
    if (_normalise(title).contains(query)) return true;
    for (final alias in aliases) {
      if (_normalise(alias).contains(query)) return true;
    }
    return contentMatches?.call(query) ?? false;
  }
}

/// The tab's name, at the size the Community tab wears its own.
///
/// It was a headline and a slogan, which is a masthead rather than a heading:
/// two of the five tabs in the shell shouted their own name at different volumes
/// and this was the loud one. Set to the same 19/800 the Community header uses
/// so the shell reads as one app, and the slogan is gone — a tab that has to
/// explain itself under its own title is a tab that has been named badly.
class _CollectionHeader extends StatelessWidget {
  const _CollectionHeader();

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      22,
      shellTopRightReserve(withAction: true),
      10,
    ),
    child: Text(
      'Kasem Collections',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: context.brand.ink,
        fontSize: 19,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.4,
      ),
    ),
  );
}

class _CollectionSearchField extends StatelessWidget {
  const _CollectionSearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
      child: Semantics(
        label: 'Search the collection',
        textField: true,
        child: TextField(
          key: const Key('collection-search-field'),
          controller: controller,
          onChanged: onChanged,
          textInputAction: TextInputAction.search,
          style: TextStyle(color: brand.ink, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            hintText: 'Search the collection',
            prefixIcon: Icon(Icons.search_rounded, color: brand.mutedInk),
            suffixIcon: ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) => value.text.isEmpty
                  ? const SizedBox.shrink()
                  : IconButton(
                      tooltip: 'Clear search',
                      onPressed: onClear,
                      icon: const Icon(Icons.close_rounded),
                    ),
            ),
            filled: true,
            fillColor: Color.alphaBlend(
              brand.accent.withValues(alpha: brand.isDark ? 0.06 : 0.035),
              brand.surfaceMuted,
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 18,
              vertical: 18,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide(color: brand.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide(color: brand.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide(color: brand.accent, width: 1.4),
            ),
          ),
        ),
      ),
    );
  }
}

class _CollectionGrid extends StatelessWidget {
  const _CollectionGrid({required this.portals});

  final List<_CollectionPortal> portals;

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      for (final portal in portals)
        portal.loading
            ? const _CollectionPortalSkeleton()
            : _CollectionPortalCard(portal: portal),
    ];
    return _CollectionGridLayout(children: children);
  }
}

class _CollectionGridSkeleton extends StatelessWidget {
  const _CollectionGridSkeleton();

  @override
  Widget build(BuildContext context) => const _CollectionGridLayout(
    children: [
      _CollectionPortalSkeleton(),
      _CollectionPortalSkeleton(),
      _CollectionPortalSkeleton(),
      _CollectionPortalSkeleton(),
    ],
  );
}

class _CollectionGridLayout extends StatelessWidget {
  const _CollectionGridLayout({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
      sliver: SliverLayoutBuilder(
        builder: (context, constraints) {
          final singleColumn =
              constraints.crossAxisExtent < 300 || textScale > 1.35;
          if (singleColumn) {
            return SliverList.separated(
              itemCount: children.length,
              separatorBuilder: (_, _) => const SizedBox(height: _gridGap),
              itemBuilder: (context, index) => children[index],
            );
          }
          final tileWidth = (constraints.crossAxisExtent - _gridGap) / 2;
          return SliverGrid(
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: _gridGap,
              mainAxisSpacing: _gridGap,
              mainAxisExtent: _portalTileExtent(tileWidth, textScale),
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) => children[index],
              childCount: children.length,
            ),
          );
        },
      ),
    );
  }
}

/// One channel, as a tile.
///
/// ── Why this is quieter than it was ──────────────────────────────────────
/// It used to be a coloured radial wash behind a 56px icon under a 22/900
/// title, seven times over in a two-column grid. Seven of those on one screen
/// is not seven doors, it is a fairground: nothing on the page was allowed to
/// be the loudest thing because every tile was already shouting, and the colour
/// that was meant to tell the channels apart stopped carrying any information
/// at all.
///
/// So the pane is a plain one now. The colour survives at the one size where it
/// still distinguishes — a small plate behind the icon — and the type steps down
/// to the same weights the rest of the app reads at. The card is still a door;
/// it has simply stopped announcing it.
class _CollectionPortalCard extends StatelessWidget {
  const _CollectionPortalCard({required this.portal});

  final _CollectionPortal portal;

  @override
  Widget build(BuildContext context) {
    final open = portal.onOpen;
    final action = portal.failed
        ? portal.onRetry
        : open == null
        ? null
        : () => open(context);
    final semanticState = portal.failed
        ? 'Could not load. Tap to retry.'
        : portal.isOpen
        ? '${portal.count ?? 0} published. Opens collection.'
        : 'Coming soon.';

    return CollectionCardSurface(
      onTap: action,
      semanticLabel: '${portal.title}. $semanticState',
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 128),
        child: LayoutBuilder(
          // The grid states a tile height and the single-column fallback states
          // none, so the gap under the icon cannot be a [Spacer] unconditionally
          // — a flexible child under an unbounded height is a layout assertion,
          // and the fallback is exactly that case.
          builder: (context, constraints) {
            final bounded = constraints.hasBoundedHeight;
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
              child: Column(
                mainAxisSize: bounded ? MainAxisSize.max : MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _PortalIcon(portal: portal),
                  if (bounded) const Spacer() else const SizedBox(height: 16),
                  Text(
                    portal.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      height: 1.15,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: 5),
                  _CollectionPortalStatus(portal: portal),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// The channel's colour, at the one size it is still telling somebody apart.
class _PortalIcon extends StatelessWidget {
  const _PortalIcon({required this.portal});

  final _CollectionPortal portal;

  @override
  Widget build(BuildContext context) {
    final side = MediaQuery.textScalerOf(context).scale(38).clamp(34, 48);
    return Container(
      width: side.toDouble(),
      height: side.toDouble(),
      decoration: BoxDecoration(
        color: portal.color.withValues(
          alpha: context.brand.isDark ? 0.16 : 0.1,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Icon(portal.icon, color: portal.color, size: side * 0.5),
    );
  }
}

class _CollectionPortalStatus extends ConsumerWidget {
  const _CollectionPortalStatus({required this.portal});

  final _CollectionPortal portal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    // A player channel that is the one sounding says so, and says what: the
    // tile is the way back to the rest of it.
    final liveKind = portal.liveKind;
    if (liveKind != null && !portal.failed) {
      final playing = ref.watch(musicIsPlayingProvider);
      final fromHere =
          ref.watch(
            musicControllerProvider.select((state) => state.queueKind),
          ) ==
          liveKind;
      final title = ref.watch(
        musicMediaItemProvider.select((state) => state.asData?.value?.title),
      );
      if (playing && fromHere && title != null) {
        return Row(
          children: [
            MusicEqualizer(color: portal.color, size: const Size(14, 11)),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: portal.color,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                ),
              ),
            ),
          ],
        );
      }
    }
    final failed = portal.failed;
    final comingSoon = !portal.isOpen && !failed;
    // Only the failure keeps a colour of its own. A count is supporting text
    // and reads as supporting text; it was set in the channel's own colour at
    // 800 weight, which made "2 published" compete with the channel's name.
    final color = failed ? brand.terracotta : brand.mutedInk;
    final icon = failed
        ? Icons.refresh_rounded
        : comingSoon
        ? Icons.schedule_rounded
        : null;
    final label = failed
        ? 'Could not load · retry'
        : comingSoon
        ? 'Coming soon'
        : '${portal.count ?? 0} published';

    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, color: color, size: 14),
          const SizedBox(width: 5),
        ],
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              height: 1.2,
              letterSpacing: 0,
            ),
          ),
        ),
        if (!failed && portal.isOpen) ...[
          const SizedBox(width: 8),
          Icon(Icons.arrow_forward_rounded, color: brand.mutedInk, size: 16),
        ],
      ],
    );
  }
}

class _CollectionPortalSkeleton extends StatelessWidget {
  const _CollectionPortalSkeleton();

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) => GlassSkeleton(
      height: constraints.hasBoundedHeight ? constraints.maxHeight : 138,
      radius: 22,
    ),
  );
}

class _CollectionEmptySearchState extends StatelessWidget {
  const _CollectionEmptySearchState({
    required this.query,
    required this.onReset,
  });

  final String query;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final title = query.trim().isEmpty
        ? 'No collections found'
        : 'No results for "${query.trim()}"';
    return _CollectionStatePanel(
      icon: Icons.search_off_rounded,
      title: title,
      action: OutlinedButton.icon(
        key: const Key('collection-reset-filters'),
        onPressed: onReset,
        icon: const Icon(Icons.restart_alt_rounded),
        label: const Text('Clear search'),
      ),
    );
  }
}

class _CollectionErrorState extends StatelessWidget {
  const _CollectionErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => _CollectionStatePanel(
    icon: Icons.cloud_off_rounded,
    title: 'The collection could not be refreshed.',
    color: context.brand.terracotta,
    action: OutlinedButton.icon(
      onPressed: onRetry,
      icon: const Icon(Icons.refresh_rounded),
      label: const Text('Try again'),
    ),
  );
}

class _CollectionStatePanel extends StatelessWidget {
  const _CollectionStatePanel({
    required this.icon,
    required this.title,
    this.action,
    this.color,
  });

  final IconData icon;
  final String title;
  final Widget? action;
  final Color? color;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 92),
      child: GlassSurface(
        radius: 22,
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            GlassIconPlate(icon: icon, color: color ?? context.brand.accent),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 0),
            ),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    ),
  );
}

const _gridGap = 14.0;

/// Shorter than the tile is wide now. The card no longer holds a square of
/// artwork, so a square of space under a small icon was a square of nothing.
double _portalTileExtent(double tileWidth, double textScale) =>
    math.max(tileWidth * 0.82, 138 + (textScale - 1) * 48);

String _normalise(String value) =>
    value.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

bool _contains(String haystack, String query) =>
    _normalise(haystack).contains(query);

/// The same question the channel itself asks, asked once.
///
/// Two spellings of "does this song match" is how the grid surfaces a channel
/// for a word the channel then finds nothing for.
bool _publishedReelMatches(PublishedReel item, String query) =>
    publishedReelMatches(item, query);

bool _heroMatches(KasemHero hero, String query) {
  for (final value in [
    hero.name,
    hero.alsoKnownAs,
    hero.era,
    hero.field,
    hero.summary,
    hero.story,
    hero.birthplace,
  ]) {
    if (_contains(value, query)) return true;
  }
  return false;
}

bool _directoryAppMatches(DirectoryApp app, String query) {
  for (final value in [
    app.name,
    app.developer,
    app.description,
    app.category,
  ]) {
    if (_contains(value, query)) return true;
  }
  return false;
}

bool _shopProductMatches(ShopProduct product, String query) {
  for (final value in [
    product.name,
    product.summary,
    product.description,
    product.category,
    product.maker,
    product.priceLabel,
  ]) {
    if (_contains(value, query)) return true;
  }
  return false;
}
