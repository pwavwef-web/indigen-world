import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/shared/app_widgets.dart';

enum _CollectionFilter { all, symbols, places, songs, stories }

class CollectionScreen extends StatefulWidget {
  const CollectionScreen({super.key});

  @override
  State<CollectionScreen> createState() => _CollectionScreenState();
}

class _CollectionScreenState extends State<CollectionScreen> {
  var _filter = _CollectionFilter.all;
  final _savedPlaces = <int>{};

  bool _shows(_CollectionFilter section) =>
      _filter == _CollectionFilter.all || _filter == section;

  @override
  Widget build(BuildContext context) => ScreenContainer(
    child: CustomScrollView(
      key: const PageStorageKey('collection-scroll'),
      slivers: [
        const SliverToBoxAdapter(child: _CollectionHero()),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 48,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              scrollDirection: Axis.horizontal,
              children: [
                for (final filter in _CollectionFilter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      selected: _filter == filter,
                      showCheckmark: false,
                      avatar: Icon(_filterIcon(filter), size: 17),
                      label: Text(_filterLabel(filter)),
                      onSelected: (_) => setState(() => _filter = filter),
                    ),
                  ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 120),
          sliver: SliverList.list(
            children: [
              const _CollectionNotice(),
              if (_shows(_CollectionFilter.symbols)) ...[
                const SizedBox(height: 26),
                const SectionTitle(title: 'Kasena visual language'),
                const SizedBox(height: 5),
                const Text(
                  'Explore recurring forms inspired by painted-earth architecture.',
                  style: TextStyle(color: BrandColors.mutedInk),
                ),
                const SizedBox(height: 13),
                const _SymbolGrid(),
              ],
              if (_shows(_CollectionFilter.places)) ...[
                const SizedBox(height: 28),
                const SectionTitle(title: 'Places worth knowing'),
                const SizedBox(height: 5),
                const Text(
                  'A visual journey through Kasena homelands and nearby Upper East landmarks.',
                  style: TextStyle(color: BrandColors.mutedInk),
                ),
                const SizedBox(height: 13),
                SizedBox(
                  height: 280,
                  child: ListView.separated(
                    clipBehavior: Clip.none,
                    scrollDirection: Axis.horizontal,
                    itemCount: _places.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) => _PlaceCard(
                      place: _places[index],
                      saved: _savedPlaces.contains(index),
                      onSave: () => setState(() {
                        _savedPlaces.contains(index)
                            ? _savedPlaces.remove(index)
                            : _savedPlaces.add(index);
                      }),
                      onOpen: () => _openPlace(context, _places[index]),
                    ),
                  ),
                ),
              ],
              if (_shows(_CollectionFilter.songs)) ...[
                const SizedBox(height: 28),
                const SectionTitle(title: 'Songs & sounds'),
                const SizedBox(height: 5),
                const Text(
                  'A rights-aware catalog ready for community-approved recordings.',
                  style: TextStyle(color: BrandColors.mutedInk),
                ),
                const SizedBox(height: 13),
                for (final song in _songs) ...[
                  _SongCard(song: song),
                  const SizedBox(height: 10),
                ],
              ],
              if (_shows(_CollectionFilter.stories)) ...[
                const SizedBox(height: 28),
                const SectionTitle(title: 'Stories, history & culture'),
                const SizedBox(height: 5),
                const Text(
                  'Living knowledge presented with room for elders and cultural reviewers.',
                  style: TextStyle(color: BrandColors.mutedInk),
                ),
                const SizedBox(height: 13),
                const _StoryCard(
                  icon: Icons.auto_stories_rounded,
                  label: 'ORAL TRADITION',
                  title: 'The bond at the sacred pond',
                  summary: 'Paga traditions hold crocodiles as sacred and describe a long relationship between the pond and the community. Accounts vary by storyteller.',
                  color: BrandColors.savannahGreen,
                ),
                const SizedBox(height: 10),
                const _StoryCard(
                  icon: Icons.public_rounded,
                  label: 'HISTORY',
                  title: 'One homeland across a border',
                  summary: 'Kasena communities live across northern Ghana and southern Burkina Faso. Language, kinship and artistic practice continue across the modern border.',
                  color: BrandColors.terracotta,
                ),
                const SizedBox(height: 10),
                const _StoryCard(
                  icon: Icons.brush_rounded,
                  label: 'CULTURE',
                  title: 'Walls that carry memory',
                  summary: 'Painted and incised earthen surfaces use rhythm, geometry, fauna and everyday objects to renew homes and communicate cultural identity.',
                  color: BrandColors.kenteGold,
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );

  void _openPlace(BuildContext context, _Place place) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 0, 22, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: CachedNetworkImage(
                    imageUrl: place.imageUrl,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => _PlaceFallback(icon: place.icon),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                place.title,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 5),
              Text(
                place.location,
                style: const TextStyle(
                  color: BrandColors.terracotta,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                place.description,
                style: const TextStyle(fontSize: 16, height: 1.45),
              ),
              const SizedBox(height: 12),
              Text(
                'Image: ${place.credit}',
                style: const TextStyle(
                  color: BrandColors.mutedInk,
                  fontSize: 10,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollectionHero extends StatelessWidget {
  const _CollectionHero();

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.fromLTRB(16, 14, 16, 14),
    height: 204,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(28),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF7E351F), BrandColors.terracotta, Color(0xFFD89B1D)],
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x2AB65A3A),
          blurRadius: 24,
          offset: Offset(0, 12),
        ),
      ],
    ),
    child: Stack(
      fit: StackFit.expand,
      children: [
        const Positioned(
          right: -22,
          top: -12,
          child: _HeroSymbol(glyph: '✣', size: 120),
        ),
        const Positioned(
          right: 72,
          bottom: -35,
          child: _HeroSymbol(glyph: '◉', size: 94),
        ),
        Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.auto_awesome_rounded,
                    color: Colors.white,
                    size: 17,
                  ),
                  SizedBox(width: 7),
                  Text(
                    'THE KASENA COLLECTION',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.25,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Text(
                'Keep wonder\nwithin reach.',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  color: Colors.white,
                  height: 0.96,
                  letterSpacing: -1.2,
                ),
              ),
              const SizedBox(height: 9),
              const Text(
                'Symbols · places · songs · legends · history · culture',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _HeroSymbol extends StatelessWidget {
  const _HeroSymbol({required this.glyph, required this.size});
  final String glyph;
  final double size;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: 0.15,
    child: Text(
      glyph,
      style: TextStyle(
        color: Colors.white,
        fontSize: size,
        fontWeight: FontWeight.w900,
      ),
    ),
  );
}

class _CollectionNotice extends StatelessWidget {
  const _CollectionNotice();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      color: BrandColors.heritageGreen.withValues(alpha: 0.07),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: BrandColors.heritageGreen.withValues(alpha: 0.16),
      ),
    ),
    child: const Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.verified_user_outlined,
          color: BrandColors.heritageGreen,
          size: 20,
        ),
        SizedBox(width: 10),
        Expanded(
          child: Text(
            'Editorial preview: cultural names, meanings, songs and oral histories require approval from designated Kasena reviewers before publication.',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
        ),
      ],
    ),
  );
}

class _SymbolGrid extends StatelessWidget {
  const _SymbolGrid();

  @override
  Widget build(BuildContext context) => GridView.builder(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: 2,
      childAspectRatio: 1.12,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
    ),
    itemCount: _symbols.length,
    itemBuilder: (context, index) {
      final symbol = _symbols[index];
      return Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: symbol.color,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Stack(
          children: [
            Align(
              alignment: Alignment.topRight,
              child: Text(
                symbol.glyph,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 56,
                  height: 0.9,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            Align(
              alignment: Alignment.bottomLeft,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    symbol.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    symbol.note,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                      height: 1.25,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _PlaceCard extends StatelessWidget {
  const _PlaceCard({
    required this.place,
    required this.saved,
    required this.onSave,
    required this.onOpen,
  });

  final _Place place;
  final bool saved;
  final VoidCallback onSave;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 230,
    child: Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  CachedNetworkImage(
                    imageUrl: place.imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, _) => _PlaceFallback(icon: place.icon),
                    errorWidget: (_, _, _) => _PlaceFallback(icon: place.icon),
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0x88000000)],
                      ),
                    ),
                  ),
                  Positioned(
                    right: 8,
                    top: 8,
                    child: IconButton.filled(
                      tooltip: saved ? 'Remove saved place' : 'Save place',
                      onPressed: onSave,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.black45,
                        foregroundColor: saved
                            ? BrandColors.kenteGold
                            : Colors.white,
                      ),
                      icon: Icon(
                        saved
                            ? Icons.bookmark_rounded
                            : Icons.bookmark_border_rounded,
                        size: 19,
                      ),
                    ),
                  ),
                  Positioned(
                    left: 12,
                    bottom: 10,
                    child: Text(
                      place.tag,
                      style: const TextStyle(
                        color: BrandColors.kenteGold,
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(13),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    place.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: BrandColors.terracotta,
                      ),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          place.location,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: BrandColors.mutedInk,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PlaceFallback extends StatelessWidget {
  const _PlaceFallback({required this.icon});
  final IconData icon;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        colors: [BrandColors.heritageGreen, BrandColors.terracotta],
      ),
    ),
    child: Center(child: Icon(icon, size: 54, color: Colors.white54)),
  );
}

class _SongCard extends StatelessWidget {
  const _SongCard({required this.song});
  final _Song song;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      leading: Container(
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [song.color, BrandColors.heritageGreen],
          ),
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Icon(Icons.graphic_eq_rounded, color: Colors.white),
      ),
      title: Text(
        song.title,
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text(
        '${song.type} · ${song.duration}\nApproved recording needed',
        style: const TextStyle(fontSize: 11),
      ),
      isThreeLine: true,
      trailing: IconButton.filledTonal(
        tooltip: 'Recording availability',
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Playback will open when a rights-cleared community recording is approved.',
            ),
          ),
        ),
        icon: const Icon(Icons.play_arrow_rounded),
      ),
    ),
  );
}

class _StoryCard extends StatelessWidget {
  const _StoryCard({
    required this.icon,
    required this.label,
    required this.title,
    required this.summary,
    required this.color,
  });
  final IconData icon;
  final String label;
  final String title;
  final String summary;
  final Color color;

  @override
  Widget build(BuildContext context) => Card(
    child: ExpansionTile(
      tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
      leading: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(13),
        ),
        child: Icon(icon, color: color),
      ),
      title: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w900,
          letterSpacing: 1,
        ),
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(title, style: Theme.of(context).textTheme.titleMedium),
      ),
      children: [
        Text(summary, style: const TextStyle(height: 1.5)),
        const SizedBox(height: 10),
        const Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Context note · Review before public release',
            style: TextStyle(
              color: BrandColors.mutedInk,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Symbol {
  const _Symbol(this.glyph, this.name, this.note, this.color);
  final String glyph;
  final String name;
  final String note;
  final Color color;
}

class _Place {
  const _Place({
    required this.title,
    required this.location,
    required this.tag,
    required this.imageUrl,
    required this.credit,
    required this.description,
    required this.icon,
  });
  final String title;
  final String location;
  final String tag;
  final String imageUrl;
  final String credit;
  final String description;
  final IconData icon;
}

class _Song {
  const _Song(this.title, this.type, this.duration, this.color);
  final String title;
  final String type;
  final String duration;
  final Color color;
}

String _filterLabel(_CollectionFilter filter) => switch (filter) {
  _CollectionFilter.all => 'All',
  _CollectionFilter.symbols => 'Symbols',
  _CollectionFilter.places => 'Places',
  _CollectionFilter.songs => 'Songs',
  _CollectionFilter.stories => 'Stories',
};

IconData _filterIcon(_CollectionFilter filter) => switch (filter) {
  _CollectionFilter.all => Icons.auto_awesome_rounded,
  _CollectionFilter.symbols => Icons.grid_view_rounded,
  _CollectionFilter.places => Icons.landscape_rounded,
  _CollectionFilter.songs => Icons.music_note_rounded,
  _CollectionFilter.stories => Icons.auto_stories_rounded,
};

const _symbols = [
  _Symbol(
    '▲▼',
    'Rhythm in geometry',
    'Repeating forms used as an editorial motif.',
    BrandColors.heritageGreen,
  ),
  _Symbol(
    '≋',
    'Flowing line',
    'A visual prompt for water, movement and continuity.',
    BrandColors.terracotta,
  ),
  _Symbol(
    '◉',
    'Circle & centre',
    'A recurring shape awaiting its community-approved name.',
    Color(0xFF735C25),
  ),
  _Symbol(
    '✣',
    'Four directions',
    'A contemporary collection mark inspired by symmetry.',
    BrandColors.savannahGreen,
  ),
];

const _places = [
  _Place(
    title: 'Paga Crocodile Pond',
    location: 'Paga · Upper East Region',
    tag: 'SACRED LANDSCAPE',
    imageUrl: 'https://images.ghanatrvl.com/images/gh/articles/place-to-see_paga-crocodile-pond_spot-the-crocodile_2023-05-23_86_1762-xl.webp',
    credit: 'GhanaTRVL',
    description: 'A well-known Paga sanctuary where oral traditions describe a sacred relationship between crocodiles and the community. Visits should follow local guidance.',
    icon: Icons.water_rounded,
  ),
  _Place(
    title: 'Sirigu murals',
    location: 'Sirigu · Kassena-Nankana West',
    tag: 'WOMEN\'S ART',
    imageUrl: 'https://pub-5bcc3edf34304d04b59dc91e1ad9d2fd.r2.dev/tortoisepath.com/uploads/2023/09/03131824/Sirigu-Murals-and-Traditional-Arts-Natugnia-Ghana-TortoisePathcom-jpeg.webp',
    credit: 'TortoisePath',
    description: 'Sirigu is known for pottery and painted earthen surfaces. Women artists have sustained and renewed the visual tradition through community practice.',
    icon: Icons.brush_rounded,
  ),
  _Place(
    title: 'Navrongo Cathedral',
    location: 'Navrongo · Upper East Region',
    tag: 'BUILT HERITAGE',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Navrongo_Cathedral_outside_01.JPG/960px-Navrongo_Cathedral_outside_01.JPG.webp',
    credit: 'Wikimedia Commons',
    description: 'The historic cathedral is a prominent landmark in Navrongo, recognised for its earthen architecture and distinctive blue doors and windows.',
    icon: Icons.account_balance_rounded,
  ),
  _Place(
    title: 'Royal Court of Tiébélé',
    location: 'Tiébélé · southern Burkina Faso',
    tag: 'KASENA HERITAGE',
    imageUrl: 'https://www.studioyafa.org/wp-content/uploads/2024/09/452884382_10229685867665072_4379156145777904212_n.jpg',
    credit: 'Studio Yafa',
    description: 'A living Kasena royal compound whose architecture and mural decoration carry social, artistic and spiritual meaning. It entered the UNESCO World Heritage List in 2024.',
    icon: Icons.home_work_rounded,
  ),
];

const _songs = [
  _Song(
    'Welcome song',
    'Community vocal · catalog entry',
    '2:48',
    BrandColors.terracotta,
  ),
  _Song(
    'Drum call at dusk',
    'Rhythm · catalog entry',
    '3:16',
    BrandColors.kenteGold,
  ),
  _Song(
    'Harvest gathering',
    'Song & dance · catalog entry',
    '4:02',
    BrandColors.savannahGreen,
  ),
];
