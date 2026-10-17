import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/blogs/blogs_tab.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/collection/literature_categories.dart';
import 'package:indigen_world_mobile/features/community/widgets/community_avatar.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/shared/channel_stage.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Literature's four destinations, in rail order.
enum LiteratureTab { library, genres, writers, blogs }

/// Literature as a channel: the app's glass rail, with Library, Genres,
/// Writers and Blogs on it.
///
/// ── Why the genres left the top of the page ──────────────────────────────
/// They used to be a scrolling tab strip under the header: Folktales, Drama,
/// Poetry, Food & recipes and whatever else the studio had typed, most of it
/// off the edge of the screen. A strip like that hides exactly the shelves a
/// reader has not found yet. Genres is a destination of its own now — every
/// shelf on one screen, with how much is on it — and the rail is the same one
/// Music and the Shop use, so the three channels are learned once.
///
/// Blogs is the updates blog, read live from Blogger; see [BlogsTab].
class LiteratureScreen extends ConsumerStatefulWidget {
  const LiteratureScreen({this.initialTab = LiteratureTab.library, super.key});

  final LiteratureTab initialTab;

  @override
  ConsumerState<LiteratureScreen> createState() => _LiteratureScreenState();
}

class _LiteratureScreenState extends ConsumerState<LiteratureScreen>
    with SingleTickerProviderStateMixin {
  late int _tab = widget.initialTab.index;
  late final _visited = <int>{_tab};
  final _scrolls = List<ScrollController>.generate(
    LiteratureTab.values.length,
    (_) => ScrollController(),
  );
  late final AnimationController _switch = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
  )..value = 1;
  late final Animation<double> _fade = Tween<double>(
    begin: 0.6,
    end: 1,
  ).animate(CurvedAnimation(parent: _switch, curve: AppMotion.arrive));

  @override
  void dispose() {
    for (final scroll in _scrolls) {
      scroll.dispose();
    }
    _switch.dispose();
    super.dispose();
  }

  void _select(int index) {
    if (index == _tab) {
      final scroll = _scrolls[index];
      if (scroll.hasClients && scroll.offset > 0) {
        scroll.animateTo(
          0,
          duration: motionOr(context, AppMotion.emphasized),
          curve: AppMotion.arrive,
        );
      }
      HapticFeedback.selectionClick();
      return;
    }
    setState(() {
      _tab = index;
      _visited.add(index);
    });
    if (motionAllowed(context)) _switch.forward(from: 0);
    HapticFeedback.selectionClick();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final items = ref.watch(literatureCollectionProvider);
    return PopScope<void>(
      canPop: _tab == LiteratureTab.library.index,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _select(LiteratureTab.library.index);
      },
      child: Scaffold(
        backgroundColor: brand.background,
        extendBody: true,
        body: FadeTransition(
          opacity: _fade,
          child: IndexedStack(
            index: _tab,
            children: [
              for (var index = 0; index < LiteratureTab.values.length; index++)
                TickerMode(
                  enabled: index == _tab,
                  child: !_visited.contains(index)
                      ? const SizedBox.shrink()
                      : switch (LiteratureTab.values[index]) {
                          LiteratureTab.library => PublishedCollectionScreen(
                            kind: CollectionKind.literature,
                            items: items,
                            onReload: () => reloadLiterature(ref),
                            inChannel: true,
                            scrollController: _scrolls[index],
                          ),
                          LiteratureTab.genres => _GenresTab(
                            items: items,
                            scrollController: _scrolls[index],
                          ),
                          LiteratureTab.writers => _WritersTab(
                            items: items,
                            scrollController: _scrolls[index],
                          ),
                          LiteratureTab.blogs => BlogsTab(
                            scrollController: _scrolls[index],
                          ),
                        },
                ),
            ],
          ),
        ),
        bottomNavigationBar: FrostedNavBar(
          currentIndex: _tab,
          onTap: _select,
          heroTag: kAppRailHeroTag,
          items: const [
            FrostedNavBarItem(
              icon: Icons.auto_stories_outlined,
              selectedIcon: Icons.auto_stories_rounded,
              label: 'Library',
            ),
            FrostedNavBarItem(
              icon: Icons.category_outlined,
              selectedIcon: Icons.category_rounded,
              label: 'Genres',
            ),
            FrostedNavBarItem(
              icon: Icons.edit_note_outlined,
              selectedIcon: Icons.edit_note_rounded,
              label: 'Writers',
            ),
            FrostedNavBarItem(
              icon: Icons.article_outlined,
              selectedIcon: Icons.article_rounded,
              label: 'Blogs',
            ),
          ],
        ),
      ),
    );
  }
}

double _textScale(BuildContext context) =>
    MediaQuery.textScalerOf(context).scale(1).clamp(1, 1.4);

void _openShelf(
  BuildContext context, {
  LiteratureCategory? category,
  String? writerId,
  String? writerName,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (context) => Consumer(
      builder: (context, ref, _) => PublishedCollectionScreen(
        kind: CollectionKind.literature,
        items: ref.watch(literatureCollectionProvider),
        onReload: () => reloadLiterature(ref),
        category: category,
        writerId: writerId,
        writerName: writerName,
      ),
    ),
  ),
);

/// Every genre as a shelf, with how much is on it.
class _GenresTab extends StatelessWidget {
  const _GenresTab({required this.items, this.scrollController});

  final AsyncValue<List<PublishedReel>> items;
  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context) {
    final all = items.value ?? const <PublishedReel>[];
    final genres = literatureCategoriesFor(all)
        .where((c) => c.id != LiteratureCategory.all.id)
        .toList();
    final byGenre = <String, List<PublishedReel>>{};
    for (final item in all) {
      byGenre.putIfAbsent(literatureCategoryFor(item).id, () => []).add(item);
    }
    return Material(
      color: context.brand.background,
      child: CustomScrollView(
        key: const PageStorageKey('literature-genres'),
        controller: scrollController,
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: ChannelStageDelegate(
              eyebrow: 'Browse',
              title: 'Genres',
              subtitle: 'Every shelf in the reading room.',
              topPadding: MediaQuery.paddingOf(context).top,
              textScale: _textScale(context),
              stageHeight: 96,
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
            sliver: SliverGrid.builder(
              gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 260,
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                mainAxisExtent: 150 + 30 * (_textScale(context) - 1),
              ),
              itemCount: genres.length,
              itemBuilder: (context, index) {
                final genre = genres[index];
                return Entrance(
                  index: index,
                  child: _GenreTile(
                    key: ValueKey('literature-genre-${genre.id}'),
                    genre: genre,
                    pieces: byGenre[genre.id] ?? const [],
                    counted: items.hasValue,
                    tint: _genreTint(context.brand, index),
                    onTap: () => _openShelf(context, category: genre),
                  ),
                );
              },
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: shellBottomReserve(context) + 12),
          ),
        ],
      ),
    );
  }
}

Color _genreTint(BrandPalette brand, int index) => [
  brand.terracotta,
  brand.accent,
  brand.gold,
  brand.repost,
  brand.heroMid,
  brand.like,
][index % 6];

IconData _genreIcon(String id) => switch (id) {
  'folktales' => Icons.forest_rounded,
  'short-stories' => Icons.short_text_rounded,
  'drama' => Icons.theater_comedy_rounded,
  'poetry' => Icons.format_quote_rounded,
  'recipes' => Icons.restaurant_rounded,
  'proverbs' => Icons.lightbulb_outline_rounded,
  'oral-history' => Icons.record_voice_over_rounded,
  'essays' => Icons.edit_note_rounded,
  'novels' => Icons.menu_book_rounded,
  'biographies' => Icons.person_search_rounded,
  _ => Icons.auto_stories_rounded,
};

class _GenreTile extends StatelessWidget {
  const _GenreTile({
    required this.genre,
    required this.pieces,
    required this.counted,
    required this.tint,
    required this.onTap,
    super.key,
  });

  final LiteratureCategory genre;
  final List<PublishedReel> pieces;
  final bool counted;
  final Color tint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final covers = pieces
        .map((p) => p.posterUrl)
        .whereType<String>()
        .take(3)
        .toList();
    final count = pieces.length;
    return Semantics(
      button: true,
      label: counted
          ? '${genre.label}, $count ${count == 1 ? 'piece' : 'pieces'}'
          : genre.label,
      excludeSemantics: true,
      child: PressScale(
        pressed: 0.97,
        child: Material(
          color: Color.lerp(brand.heroDeep, tint, 0.62),
          clipBehavior: Clip.antiAlias,
          borderRadius: BorderRadius.circular(22),
          child: InkWell(
            onTap: onTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Up to three covers fanned at the top right, like books
                // leaning on a shelf.
                for (final (i, url) in covers.indexed.toList().reversed)
                  Positioned(
                    right: 12.0 + i * 22,
                    top: 12.0 + i * 6,
                    child: Transform.rotate(
                      angle: (i - 1) * 0.08,
                      child: Container(
                        width: 46,
                        height: 62,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.8),
                            width: 1.5,
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(7),
                          child: CachedNetworkImage(
                            imageUrl: url,
                            memCacheWidth: 140,
                            fit: BoxFit.cover,
                            errorWidget: (_, _, _) =>
                                ColoredBox(color: tint.withValues(alpha: 0.5)),
                          ),
                        ),
                      ),
                    ),
                  ),
                if (covers.isEmpty)
                  Positioned(
                    right: -8,
                    top: -6,
                    child: Icon(
                      _genreIcon(genre.id),
                      size: 92,
                      color: Colors.white.withValues(alpha: 0.13),
                    ),
                  ),
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 14,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        _genreIcon(genre.id),
                        color: Colors.white.withValues(alpha: 0.9),
                        size: 20,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        genre.label,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 17,
                          height: 1.15,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (counted)
                        Text(
                          count == 0
                              ? 'Nothing yet'
                              : '$count ${count == 1 ? 'piece' : 'pieces'}',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.78),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
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
    );
  }
}

/// The people who wrote it, by how much of it they wrote.
class _WritersTab extends StatelessWidget {
  const _WritersTab({required this.items, this.scrollController});

  final AsyncValue<List<PublishedReel>> items;
  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final writers = groupWriters(items.value ?? const <PublishedReel>[]);
    return Material(
      color: brand.background,
      child: CustomScrollView(
        key: const PageStorageKey('literature-writers'),
        controller: scrollController,
        slivers: [
          SliverPersistentHeader(
            pinned: true,
            delegate: ChannelStageDelegate(
              eyebrow: 'The people behind the pages',
              title: 'Writers',
              subtitle: items.hasValue
                  ? '${writers.length} ${writers.length == 1 ? 'writer' : 'writers'} published here.'
                  : null,
              topPadding: MediaQuery.paddingOf(context).top,
              textScale: _textScale(context),
              stageHeight: 96,
            ),
          ),
          if (!items.hasValue && !items.hasError)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (writers.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: Text(
                  items.hasError
                      ? 'Writers could not load.'
                      : 'Writers appear here with their first published piece.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk),
                ),
              ),
            )
          else
            SliverList.separated(
              itemCount: writers.length,
              separatorBuilder: (_, _) =>
                  Divider(height: 1, indent: 82, color: brand.divider),
              itemBuilder: (context, index) {
                final writer = writers[index];
                final count = writer.pieces.length;
                final genres = {
                  for (final t in writer.pieces) literatureCategoryFor(t).label,
                }.take(3).join(' · ');
                final lead = writer.pieces.first;
                return ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(16, 6, 12, 6),
                  leading: CommunityAvatar(
                    initials: writer.name.isEmpty
                        ? '?'
                        : writer.name.substring(0, 1).toUpperCase(),
                    imageUrl: lead.creatorAvatarUrl,
                    size: 50,
                  ),
                  title: Text(
                    writer.name,
                    style: TextStyle(
                      color: brand.ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  subtitle: Text(
                    '$count ${count == 1 ? 'piece' : 'pieces'}  ·  $genres',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => _openShelf(
                    context,
                    writerId: writer.id,
                    writerName: writer.name,
                  ),
                );
              },
            ),
          SliverToBoxAdapter(
            child: SizedBox(height: shellBottomReserve(context) + 12),
          ),
        ],
      ),
    );
  }
}

/// One writer and what of theirs is published here.
@immutable
class LiteratureWriter {
  const LiteratureWriter({
    required this.id,
    required this.name,
    required this.pieces,
  });

  /// The same key [PublishedCollectionScreen] filters a writer's page by.
  final String id;
  final String name;
  final List<PublishedReel> pieces;
}

/// Everybody with published literature, busiest first, then by name.
///
/// Keyed like Music's artists (account id where the record has one, the
/// normalised name where it does not) but without Music's requirement that
/// a record be playable — a poem is not a track.
List<LiteratureWriter> groupWriters(List<PublishedReel> items) {
  final byKey = <String, List<PublishedReel>>{};
  for (final item in items) {
    byKey.putIfAbsent(artistKey(item), () => []).add(item);
  }
  return [
    for (final entry in byKey.entries)
      LiteratureWriter(
        id: entry.key,
        name: entry.value.first.creatorName.trim().isEmpty
            ? 'Unnamed writer'
            : entry.value.first.creatorName.trim(),
        pieces: entry.value,
      ),
  ]..sort((a, b) {
    final byCount = b.pieces.length.compareTo(a.pieces.length);
    return byCount != 0
        ? byCount
        : a.name.toLowerCase().compareTo(b.name.toLowerCase());
  });
}
