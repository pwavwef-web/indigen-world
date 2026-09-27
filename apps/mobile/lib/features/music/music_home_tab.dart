import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/ads/admob_native.dart';
import 'package:indigen_world_mobile/features/ads/collection_ads.dart';
import 'package:indigen_world_mobile/features/ads/data/served_ad.dart';
import 'package:indigen_world_mobile/features/ads/widgets/sponsored_card.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_list_screen.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_recent.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/glass_surface.dart';
import 'package:indigen_world_mobile/shared/kassena_pattern.dart';
import 'package:indigen_world_mobile/shared/motion.dart';
import 'package:indigen_world_mobile/shared/reveal_route.dart';

/// The channel's front page: a stage at the top, then the shelves.
///
/// ── The stage ─────────────────────────────────────────────────────────────
/// The header is painted in the colour of what is playing — or, before
/// anything has played, of the newest piece in the archive — over the theme's
/// hero band, with a frieze of Kassena wall-painting along its foot. The frieze
/// walks while the music plays and stands still when it stops. It collapses
/// into a coloured bar as the page scrolls, so the channel's name and the way
/// back are always one tap away.
///
/// ── The shelves ───────────────────────────────────────────────────────────
/// Each one appears only when it has something to say. An empty shelf
/// labelled "Jump back in" is a promise the app has not kept yet, and a
/// "New" shelf holding exactly what "Every song" holds is the same list
/// twice.
class MusicHomeTab extends ConsumerWidget {
  const MusicHomeTab({
    required this.kind,
    required this.items,
    required this.accent,
    required this.onRetry,
    required this.onBrowseArtists,
    this.scrollController,
    super.key,
  });

  final CollectionKind kind;
  final AsyncValue<List<PublishedReel>> items;
  final Color accent;
  final VoidCallback onRetry;

  /// Switches the channel to its Artists tab — the whole of the shelf.
  final VoidCallback onBrowseArtists;

  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playable = items.asData?.value;
    final loading = playable == null && !items.hasError;

    return CustomScrollView(
      controller: scrollController,
      slivers: [
        SliverPersistentHeader(
          pinned: true,
          delegate: MusicStageDelegate(
            kind: kind,
            items: playable ?? const <PublishedReel>[],
            accent: accent,
            topPadding: MediaQuery.paddingOf(context).top,
            textScale: MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.4),
          ),
        ),
        if (loading)
          const SliverToBoxAdapter(child: _ShelvesSkeleton())
        else if (playable == null)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _Unavailable(onRetry: onRetry),
          )
        else if (playable.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _Empty(kind: kind, accent: accent),
          )
        else
          ..._shelves(context, ref, playable),
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }

  List<Widget> _shelves(
    BuildContext context,
    WidgetRef ref,
    List<PublishedReel> items,
  ) {
    final controller = ref.read(musicControllerProvider.notifier);
    final artists = ref.watch(musicArtistsProvider(kind));
    final recent = resolveRecent(ref.watch(recentlyPlayedProvider), items);
    final newest = newestFirst(items);
    final categories = musicCategories(items);

    Future<void> play(List<PublishedReel> queue, int index) =>
        controller.playCollection(queue, startIndex: index, kind: kind);

    void openArtist(MusicArtist artist) => Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (context) =>
            MusicArtistScreen(artistId: artist.id, kind: kind),
      ),
    );

    return [
      // What they came back for, first.
      if (recent.isNotEmpty) ...[
        const SliverToBoxAdapter(
          child: MusicSectionHeader(title: 'Jump back in'),
        ),
        SliverToBoxAdapter(
          child: _Shelf(
            height: 206,
            children: [
              for (final (index, item) in recent.indexed)
                Entrance(
                  index: index,
                  child: MusicShelfCard(
                    item: item,
                    // The shelf plays *the shelf*: somebody tapping what they
                    // had on yesterday is asking for that sitting back, not
                    // for the archive in publication order.
                    onPlay: () => play(recent, index),
                  ),
                ),
            ],
          ),
        ),
      ],

      // The people, above the songs, deliberately: in a tradition carried by
      // singers the singer is not metadata.
      if (artists.length > 1) ...[
        SliverToBoxAdapter(
          child: MusicSectionHeader(
            title: kind == CollectionKind.audiobooks ? 'Readers' : 'Artists',
            onSeeAll: onBrowseArtists,
            seeAllLabel: 'Browse',
          ),
        ),
        SliverToBoxAdapter(
          child: _Shelf(
            height: 166,
            children: [
              for (final (index, artist) in artists.take(12).indexed)
                Entrance(
                  index: index,
                  child: MusicArtistCircle(
                    artist: artist,
                    kind: kind,
                    ringColor: accent,
                    onOpen: () => openArtist(artist),
                  ),
                ),
            ],
          ),
        ),
      ],

      // Only once the archive is big enough that "the newest ten" is a
      // different list from "all of it".
      if (items.length >= 12) ...[
        const SliverToBoxAdapter(
          child: MusicSectionHeader(
            title: 'New in the archive',
            eyebrow: 'Just published',
          ),
        ),
        SliverToBoxAdapter(
          child: _Shelf(
            height: 206,
            children: [
              for (final (index, item) in newest.take(10).indexed)
                MusicShelfCard(item: item, onPlay: () => play(newest, index)),
            ],
          ),
        ),
      ],

      if (categories.isNotEmpty) ...[
        const SliverToBoxAdapter(
          child: MusicSectionHeader(title: 'Browse by kind'),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 260,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.7,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, index) => Entrance(
                index: index,
                child: MusicCategoryTile(
                  category: categories[index],
                  color: musicCategoryColor(index),
                  kind: kind,
                ),
              ),
              childCount: categories.length,
            ),
          ),
        ),
      ],

      SliverToBoxAdapter(
        child: MusicSectionHeader(
          title: kind == CollectionKind.audiobooks
              ? 'Every reading'
              : 'Every song',
          eyebrow: '${items.length} in the archive',
        ),
      ),
      _TrackRows(
        items: items,
        accent: accent,
        inventory: ref.watch(collectionInventoryProvider),
        onPlay: (index) => play(items, index),
      ),
    ];
  }
}

/// The header: a stage that collapses into a bar.
class MusicStageDelegate extends SliverPersistentHeaderDelegate {
  MusicStageDelegate({
    required this.kind,
    required this.items,
    required this.accent,
    required this.topPadding,
    required this.textScale,
  });

  final CollectionKind kind;
  final List<PublishedReel> items;
  final Color accent;
  final double topPadding;
  final double textScale;

  static const double _toolbar = 56;
  static const double _frieze = 44;

  double get _stage => items.isEmpty ? 150 : 292;

  @override
  double get minExtent => topPadding + _toolbar;

  @override
  double get maxExtent => topPadding + _toolbar + _stage * textScale;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final range = maxExtent - minExtent;
    final collapse = range <= 0 ? 1.0 : (shrinkOffset / range).clamp(0.0, 1.0);
    return _Stage(
      kind: kind,
      items: items,
      accent: accent,
      topPadding: topPadding,
      collapse: collapse,
      shrinkOffset: shrinkOffset,
    );
  }

  @override
  bool shouldRebuild(MusicStageDelegate oldDelegate) =>
      oldDelegate.kind != kind ||
      !identical(oldDelegate.items, items) ||
      oldDelegate.accent != accent ||
      oldDelegate.topPadding != topPadding ||
      oldDelegate.textScale != textScale;
}

class _Stage extends ConsumerWidget {
  const _Stage({
    required this.kind,
    required this.items,
    required this.accent,
    required this.topPadding,
    required this.collapse,
    required this.shrinkOffset,
  });

  final CollectionKind kind;
  final List<PublishedReel> items;
  final Color accent;
  final double topPadding;
  final double collapse;
  final double shrinkOffset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final playing = ref.watch(musicIsPlayingProvider);
    final current = ref.watch(musicMediaItemProvider).asData?.value;
    final featured = items.isEmpty ? null : newestFirst(items).first;

    // What is playing colours the stage; before anything has, the newest
    // piece does. Either way the fallback is the channel's own colour laid
    // over the theme's hero band.
    final artwork = current?.artUri?.toString() ?? featured?.posterUrl;
    final fallback = musicTintForText(Color.lerp(brand.heroMid, accent, 0.4)!);
    final tint = watchMusicTint(ref, artwork) ?? fallback;
    final contentOpacity = (1 - collapse * 1.7).clamp(0.0, 1.0);

    return AnimatedTint(
      color: tint,
      builder: (context, color) => DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              brand.heroDeep,
              Color.lerp(brand.heroDeep, color, 0.78)!,
              Color.lerp(color, brand.heroLit, 0.18)!,
            ],
            stops: const [0, 0.55, 1],
          ),
        ),
        child: ClipRect(
          child: Stack(
            fit: StackFit.expand,
            children: [
              // The frieze along the foot of the wall.
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: MusicStageDelegate._frieze,
                child: Opacity(
                  opacity: 1 - collapse,
                  child: KassenaBand(
                    tint: brand.highlight,
                    opacity: 0.16,
                    // Also still once it has scrolled out of sight: a wall
                    // nobody can see has no reason to dance.
                    moving: playing && collapse < 0.9,
                  ),
                ),
              ),
              if (contentOpacity > 0)
                Positioned(
                  left: 0,
                  right: 0,
                  top:
                      topPadding +
                      MusicStageDelegate._toolbar -
                      // Parallax: the stage leaves more slowly than the page
                      // scrolls, so the foreground seems to slide over it.
                      shrinkOffset * 0.45,
                  child: Opacity(
                    opacity: contentOpacity,
                    child: _StageContent(
                      kind: kind,
                      items: items,
                      featured: featured,
                      tint: color,
                    ),
                  ),
                ),
              Positioned(
                left: 4,
                right: 4,
                top: topPadding,
                height: MusicStageDelegate._toolbar,
                child: _StageToolbar(kind: kind, collapse: collapse),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StageToolbar extends StatelessWidget {
  const _StageToolbar({required this.kind, required this.collapse});

  final CollectionKind kind;
  final double collapse;

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return Row(
      children: [
        if (canPop)
          const BackButton(color: Colors.white)
        else
          const SizedBox(width: 12),
        Expanded(
          child: Opacity(
            // The name arrives in the bar as the stage that says it leaves.
            opacity: ((collapse - 0.55) / 0.45).clamp(0.0, 1.0),
            child: Text(
              kind.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _StageContent extends ConsumerWidget {
  const _StageContent({
    required this.kind,
    required this.items,
    required this.featured,
    required this.tint,
  });

  final CollectionKind kind;
  final List<PublishedReel> items;
  final PublishedReel? featured;
  final Color tint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(musicControllerProvider.notifier);
    final lead = featured;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 2, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            items.isEmpty
                ? kind.label.toUpperCase()
                : '${kind.label.toUpperCase()} · ${items.length} '
                      '${items.length == 1 ? 'PIECE' : 'PIECES'}',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.72),
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.3,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            kind == CollectionKind.audiobooks
                ? 'Listen, learn, and carry it forward.'
                : 'Hear the rhythm of home.',
            maxLines: 2,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 30,
              height: 1.08,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.8,
            ),
          ),
          if (lead != null) ...[
            const SizedBox(height: 18),
            _FeaturedCard(
              item: lead,
              kind: kind,
              tint: tint,
              onPlay: () => controller.playCollection(
                items,
                startIndex: items.indexOf(lead),
                kind: kind,
              ),
            ),
            const SizedBox(height: 14),
            // A wrap, not a row: at a large text size the two pills are wider
            // than a small phone, and the second belongs on the next line
            // rather than off the edge.
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                _StagePill(
                  filled: true,
                  tint: tint,
                  icon: Icons.play_arrow_rounded,
                  label: 'Play all ${items.length}',
                  onTap: () => controller.playCollection(
                    items,
                    startIndex: 0,
                    kind: kind,
                  ),
                ),
                _StagePill(
                  filled: false,
                  tint: tint,
                  icon: Icons.shuffle_rounded,
                  label: 'Shuffle',
                  onTap: () async {
                    // Shuffle goes on before the queue is cued, so the first
                    // song is already a shuffled one.
                    await controller.toggleShuffle();
                    await controller.playCollection(
                      items,
                      startIndex: 0,
                      kind: kind,
                    );
                  },
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// The newest piece, offered first.
class _FeaturedCard extends ConsumerWidget {
  const _FeaturedCard({
    required this.item,
    required this.kind,
    required this.tint,
    required this.onPlay,
  });

  final PublishedReel item;
  final CollectionKind kind;
  final Color tint;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = watchTrackState(ref, item.id);
    final controller = ref.read(musicControllerProvider.notifier);
    final label = switch (state) {
      MusicTrackState.playing => 'Playing now',
      MusicTrackState.paused => 'Paused',
      MusicTrackState.idle => 'New in the archive',
    };

    return Semantics(
      button: true,
      label: '$label: ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: PressScale(
        pressed: 0.97,
        child: Material(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: switch (state) {
              MusicTrackState.playing => controller.pause,
              MusicTrackState.paused => controller.play,
              MusicTrackState.idle => onPlay,
            },
            child: Padding(
              padding: const EdgeInsets.all(9),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 12,
                          offset: const Offset(0, 5),
                        ),
                      ],
                    ),
                    child: MusicArtwork(
                      url: item.posterUrl,
                      size: 58,
                      radius: 12,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedSwitcher(
                          duration: motionOr(context, AppMotion.standard),
                          child: Text(
                            label.toUpperCase(),
                            key: ValueKey(label),
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.75),
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.1,
                            ),
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          item.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          item.creatorName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75),
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  AnimatedContainer(
                    duration: motionOr(context, AppMotion.standard),
                    width: 46,
                    height: 46,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: AnimatedSwitcher(
                        duration: motionOr(context, AppMotion.standard),
                        transitionBuilder: (child, animation) =>
                            ScaleTransition(scale: animation, child: child),
                        child: state == MusicTrackState.playing
                            ? MusicEqualizer(
                                key: const ValueKey('eq'),
                                color: tint,
                              )
                            : Icon(
                                Icons.play_arrow_rounded,
                                key: const ValueKey('play'),
                                color: tint,
                                size: 28,
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StagePill extends StatelessWidget {
  const _StagePill({
    required this.filled,
    required this.tint,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final bool filled;
  final Color tint;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final foreground = filled ? tint : Colors.white;
    return PressScale(
      child: Material(
        color: filled ? Colors.white : Colors.transparent,
        shape: StadiumBorder(
          side: filled
              ? BorderSide.none
              : BorderSide(color: Colors.white.withValues(alpha: 0.6)),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 9, 18, 9),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 20, color: foreground),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: foreground,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The colour of the [index]th category tile.
///
/// A fixed set, like the Collection's own channel colours: a category's tile
/// is recognised by its colour from one visit to the next, which a colour
/// taken from whichever artwork happened to load first could never be.
Color musicCategoryColor(int index) => const [
  Color(0xFF0E7490),
  Color(0xFFB4412F),
  Color(0xFF5B45C4),
  Color(0xFF0F7A5A),
  Color(0xFF9A6700),
  Color(0xFF2149B8),
  Color(0xFF9D2F6B),
  Color(0xFF3F5A1F),
][index % 8];

/// One kind of piece, as a tile you can open.
class MusicCategoryTile extends StatelessWidget {
  const MusicCategoryTile({
    required this.category,
    required this.color,
    required this.kind,
    super.key,
  });

  final MusicCategory category;
  final Color color;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context) {
    final cover = category.tracks
        .map((track) => track.posterUrl)
        .firstWhere((url) => url != null && url.isNotEmpty, orElse: () => null);
    return Semantics(
      button: true,
      label: '${category.name}, ${category.tracks.length} pieces',
      excludeSemantics: true,
      child: PressScale(
        child: Material(
          color: color,
          borderRadius: BorderRadius.circular(16),
          clipBehavior: Clip.antiAlias,
          child: Builder(
            builder: (tileContext) => InkWell(
              onTap: () => Navigator.of(tileContext).push(
                RevealPageRoute<void>(
                  origin: globalRectOf(tileContext),
                  originColor: color,
                  builder: (context) => MusicListScreen(
                    title: category.name,
                    tracks: category.tracks,
                    kind: kind,
                    color: color,
                  ),
                ),
              ),
              child: Stack(
                children: [
                  // The artwork peeks out of the corner, tilted, the way a
                  // record sleeve sticks out of a crate.
                  Positioned(
                    right: -14,
                    bottom: -10,
                    child: Transform.rotate(
                      angle: math.pi / 9,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.35),
                              blurRadius: 10,
                              offset: const Offset(-2, 4),
                            ),
                          ],
                        ),
                        child: MusicArtwork(url: cover, size: 66, radius: 8),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 64, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            category.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              height: 1.1,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Text(
                          '${category.tracks.length} pieces',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.8),
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Every song, with adverts dealt between them.
///
/// ── Why the rows are indices ──────────────────────────────────────────────
/// Because a track row does not only draw a song, it starts the queue at a
/// position — `play(items, index)` — and splicing adverts into the list moves
/// every position after the first one. Splicing the *indices* instead keeps the
/// one number that matters exact: row seven may be the fifth song, and it is the
/// fifth song that plays.
class _TrackRows extends StatelessWidget {
  const _TrackRows({
    required this.items,
    required this.accent,
    required this.inventory,
    required this.onPlay,
  });

  final List<PublishedReel> items;
  final Color accent;
  final AdPlacementInventory inventory;
  final ValueChanged<int> onPlay;

  @override
  Widget build(BuildContext context) {
    final rows = collectionRowsWithAds(
      items: List<Object>.generate(items.length, (index) => index),
      inventory: inventory,
    );
    return SliverList.builder(
      itemCount: rows.length,
      itemBuilder: (context, row) {
        final entry = rows[row];
        if (entry is AdSlot) {
          return UnifiedAdSlot(
            slot: entry,
            firstPartyBuilder: (context, ad) =>
                SponsoredCard(ad: ad, slot: 'music-$row'),
            adMobPadding: const EdgeInsets.symmetric(horizontal: 18),
          );
        }
        final index = entry as int;
        return Entrance(
          index: row,
          child: MusicTrackRow(
            item: items[index],
            accent: accent,
            onPlay: () => onPlay(index),
          ),
        );
      },
    );
  }
}

/// A horizontally scrolling row of cards.
///
/// Fixed height rather than intrinsic, because a shelf whose height is decided
/// by its tallest child jumps every time a longer title loads in.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.children, this.height = 206});

  final List<Widget> children;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 18),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(width: 14),
      itemBuilder: (context, index) => children[index],
    ),
  );
}

/// Where the shelves will be, while the channel loads.
class _ShelvesSkeleton extends StatelessWidget {
  const _ShelvesSkeleton();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(18, 24, 18, 0),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(width: 140, child: GlassSkeleton(height: 20, radius: 8)),
        const SizedBox(height: 14),
        SizedBox(
          height: 150,
          child: Row(
            children: [
              for (var i = 0; i < 3; i++) ...[
                const Expanded(child: GlassSkeleton(height: 150, radius: 14)),
                if (i < 2) const SizedBox(width: 14),
              ],
            ],
          ),
        ),
        const SizedBox(height: 26),
        const SizedBox(width: 110, child: GlassSkeleton(height: 20, radius: 8)),
        const SizedBox(height: 14),
        for (var i = 0; i < 4; i++) ...[
          const GlassSkeleton(height: 56, radius: 12),
          const SizedBox(height: 10),
        ],
      ],
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.kind, required this.accent});

  final CollectionKind kind;
  final Color accent;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(32, 40, 32, 32),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 66,
          width: 180,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: CustomPaint(
              painter: KassenaPatternPainter(tint: accent, opacity: 0.35),
            ),
          ),
        ),
        const SizedBox(height: 18),
        Icon(
          kind == CollectionKind.audiobooks
              ? Icons.headphones_rounded
              : Icons.music_note_rounded,
          color: accent,
          size: 34,
        ),
        const SizedBox(height: 10),
        Text(
          kind == CollectionKind.audiobooks
              ? 'Audiobooks are ready for their first published piece'
              : 'Music is ready for its first published piece',
          textAlign: TextAlign.center,
          style: TextStyle(color: context.brand.mutedInk),
        ),
      ],
    ),
  );
}

class _Unavailable extends StatelessWidget {
  const _Unavailable({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: GlassEmptyState(
        icon: Icons.cloud_off_rounded,
        title: 'That could not be loaded.',
        action: OutlinedButton(
          onPressed: onRetry,
          child: const Text('Try again'),
        ),
      ),
    ),
  );
}
