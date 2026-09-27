import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_search_screen.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Every person the channel holds, as a wall of faces.
///
/// The Home shelf shows the busiest twelve; this is all of them. Busiest first
/// by default, for the same reason the shelf is — an alphabetical wall puts
/// whoever is called Abu at the front of it forever — with A–Z one tap away
/// for somebody who knows the name they are after.
class MusicArtistsTab extends ConsumerStatefulWidget {
  const MusicArtistsTab({
    required this.kind,
    required this.accent,
    this.scrollController,
    super.key,
  });

  final CollectionKind kind;
  final Color accent;
  final ScrollController? scrollController;

  @override
  ConsumerState<MusicArtistsTab> createState() => _MusicArtistsTabState();
}

enum _Order { busiest, alphabetical }

class _MusicArtistsTabState extends ConsumerState<MusicArtistsTab> {
  var _order = _Order.busiest;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final kind = widget.kind;
    final busiest = ref.watch(musicArtistsProvider(kind));
    final artists = _order == _Order.busiest
        ? busiest
        : ([...busiest]..sort(
            (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
          ));
    final people = kind == CollectionKind.audiobooks ? 'Readers' : 'Artists';

    return CustomScrollView(
      controller: widget.scrollController,
      slivers: [
        MusicTabAppBar(
          title: people,
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(52),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Align(
                alignment: Alignment.centerLeft,
                child: SegmentedButton<_Order>(
                  showSelectedIcon: false,
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: widget.accent.withValues(
                      alpha: brand.isDark ? 0.24 : 0.14,
                    ),
                    selectedForegroundColor: brand.isDark
                        ? Colors.white
                        : widget.accent,
                    visualDensity: VisualDensity.compact,
                  ),
                  segments: const [
                    ButtonSegment(
                      value: _Order.busiest,
                      label: Text('Most pieces'),
                      icon: Icon(Icons.local_fire_department_rounded),
                    ),
                    ButtonSegment(
                      value: _Order.alphabetical,
                      label: Text('A–Z'),
                      icon: Icon(Icons.sort_by_alpha_rounded),
                    ),
                  ],
                  selected: {_order},
                  onSelectionChanged: (selection) =>
                      setState(() => _order = selection.first),
                ),
              ),
            ),
          ),
        ),
        if (artists.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'Nobody is published here yet.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: brand.mutedInk),
                ),
              ),
            ),
          )
        else
          // A fresh gate per order, so switching it deals the faces out again
          // rather than leaving them where they were.
          EntranceGate(
            key: ValueKey(_order),
            child: SliverPadding(
              padding: const EdgeInsets.fromLTRB(10, 12, 10, 0),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 128,
                  mainAxisExtent: 146,
                  crossAxisSpacing: 4,
                  mainAxisSpacing: 10,
                ),
                delegate: SliverChildBuilderDelegate((context, index) {
                  final artist = artists[index];
                  return Entrance(
                    key: ValueKey('${_order.name}-${artist.id}'),
                    index: index,
                    child: Center(
                      child: MusicArtistCircle(
                        artist: artist,
                        kind: kind,
                        size: 84,
                        ringColor: widget.accent,
                        onOpen: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (context) => MusicArtistScreen(
                              artistId: artist.id,
                              kind: kind,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                }, childCount: artists.length),
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: shellBottomReserve(context) + 12),
        ),
      ],
    );
  }
}
