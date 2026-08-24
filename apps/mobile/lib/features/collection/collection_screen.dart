import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
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
    final useSingleColumn = MediaQuery.textScalerOf(context).scale(1) > 1.1;
    final portals = <Widget>[
      _CollectionPortalCard(
        kind: CollectionKind.music,
        icon: Icons.graphic_eq_rounded,
        color: BrandColors.terracotta,
        count: _count(music),
        description: 'Songs, instruments, and community sound.',
        onTap: () => _open(context, const MusicCollectionScreen()),
      ),
      _CollectionPortalCard(
        kind: CollectionKind.dictionary,
        icon: Icons.translate_rounded,
        color: BrandColors.heritageGreen,
        count: _count(dictionary),
        description: 'Kasem words, meanings, and examples.',
        onTap: () => _open(context, const DictionaryCollectionScreen()),
      ),
      _CollectionPortalCard(
        kind: CollectionKind.literature,
        icon: Icons.auto_stories_rounded,
        color: BrandColors.savannahGreen,
        count: _count(literature),
        description: 'Stories, poetry, and living histories.',
        onTap: () => _open(context, const LiteratureCollectionScreen()),
      ),
      _CollectionPortalCard(
        kind: CollectionKind.audiobooks,
        icon: Icons.headphones_rounded,
        color: const Color(0xFF735C25),
        count: _count(audiobooks),
        description: 'Narrated works for listening anywhere.',
        onTap: () => _open(context, const AudiobookCollectionScreen()),
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
                      audiobooks.isLoading,
                  hasError:
                      dictionary.hasError ||
                      music.hasError ||
                      literature.hasError ||
                      audiobooks.hasError,
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
                  : SliverGrid(
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                            childAspectRatio: 0.82,
                          ),
                      delegate: SliverChildListDelegate.fixed(portals),
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

class _CollectionPortalCard extends StatefulWidget {
  const _CollectionPortalCard({
    required this.kind,
    required this.icon,
    required this.color,
    required this.count,
    required this.description,
    required this.onTap,
  });

  final CollectionKind kind;
  final IconData icon;
  final Color color;
  final int? count;
  final String description;
  final VoidCallback onTap;

  @override
  State<_CollectionPortalCard> createState() => _CollectionPortalCardState();
}

class _CollectionPortalCardState extends State<_CollectionPortalCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) => AnimatedScale(
    duration: const Duration(milliseconds: 150),
    scale: _pressed ? 0.97 : 1,
    child: Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      child: InkWell(
        onHighlightChanged: (value) => setState(() => _pressed = value),
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 47,
                    height: 47,
                    decoration: BoxDecoration(
                      color: widget.color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(15),
                    ),
                    child: Icon(widget.icon, color: widget.color),
                  ),
                  const Spacer(),
                  const Icon(
                    Icons.north_east_rounded,
                    color: BrandColors.mutedInk,
                    size: 18,
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Text(
                widget.kind.label,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 5),
              Text(
                widget.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: BrandColors.mutedInk,
                  fontSize: 11,
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                widget.count == null
                    ? 'Loading…'
                    : widget.count == 0
                    ? 'Ready for contributions'
                    : '${widget.count} published ${widget.count == 1 ? 'item' : 'items'}',
                style: TextStyle(
                  color: widget.color,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
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
