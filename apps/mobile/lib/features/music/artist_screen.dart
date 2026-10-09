import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_page_header.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// Everything one person has in the archive, on one page.
///
/// ── Why an artist page at all ─────────────────────────────────────────────
/// Because an archive of a people's music that cannot show you a person's work
/// is a filing cabinet. The name under a song was already the most tapped-at
/// dead text in the app: somebody hears a song they like and the very next
/// thing they want is everything else by whoever made it. This is that page,
/// and it is also the door onto the rest of the project — the creator's account
/// id is the same id their community profile is keyed by.
///
/// Opened by id rather than handed a [MusicArtist], so the page stays live: a
/// song published while it is open joins the list underneath.
///
/// ── How it arrives ────────────────────────────────────────────────────────
/// Their face flies from the circle that was tapped into the middle of a stage
/// painted in the colour of their picture, and the page's play button rides
/// up into the bar as the list scrolls.
class MusicArtistScreen extends ConsumerWidget {
  const MusicArtistScreen({
    required this.artistId,
    this.kind = CollectionKind.music,
    super.key,
  });

  final String artistId;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final artist = ref.watch(musicArtistProvider((kind: kind, id: artistId)));
    final controller = ref.read(musicControllerProvider.notifier);

    if (artist == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Artist')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              'Nothing of theirs is published here any more.',
              textAlign: TextAlign.center,
              style: TextStyle(color: context.brand.mutedInk),
            ),
          ),
        ),
      );
    }

    final brand = context.brand;
    final tracks = artist.tracks;
    final fallback = musicTintForText(
      Color.lerp(brand.heroMid, musicChannelColor(brand, kind), 0.4)!,
    );
    final tint = watchMusicTint(ref, artist.imageUrl) ?? fallback;

    return Scaffold(
      body: EntranceGate(
        child: AnimatedTint(
          color: tint,
          builder: (context, color) => CustomScrollView(
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: MusicPageHeaderDelegate(
                  title: artist.name,
                  subtitle:
                      '${tracks.length} '
                      '${tracks.length == 1 ? kind.pieceLabel : kind.piecesLabel} '
                      'in the archive',
                  color: color,
                  tracks: tracks,
                  topPadding: MediaQuery.paddingOf(context).top,
                  visual: _Portrait(artist: artist, kind: kind),
                  onPlay: () => controller.playCollection(
                    tracks,
                    startIndex: 0,
                    kind: kind,
                  ),
                  onShuffle: () async {
                    // Shuffle goes on before the queue is cued, so the first
                    // song is already a shuffled one.
                    await controller.toggleShuffle();
                    await controller.playCollection(
                      tracks,
                      startIndex: 0,
                      kind: kind,
                    );
                  },
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.only(
                  top: 8,
                  bottom: 24 + musicInset(context),
                ),
                sliver: SliverList.builder(
                  itemCount: tracks.length,
                  itemBuilder: (context, index) => Entrance(
                    index: index,
                    child: MusicTrackRow(
                      item: tracks[index],
                      leadingNumber: index + 1,
                      accent: brand.isDark ? null : color,
                      onPlay: () => controller.playCollection(
                        tracks,
                        startIndex: index,
                        kind: kind,
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Their face on the stage, flown in from the circle that was tapped, wearing
/// the live ring while one of their pieces plays.
class _Portrait extends ConsumerWidget {
  const _Portrait({required this.artist, required this.kind});

  final MusicArtist artist;
  final CollectionKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentId = ref.watch(
      musicMediaItemProvider.select((state) => state.asData?.value?.id),
    );
    final live =
        currentId != null &&
        artist.tracks.any((t) => t.id == currentId) &&
        ref.watch(musicIsPlayingProvider);

    return Stack(
      alignment: Alignment.center,
      children: [
        if (live)
          const Positioned.fill(
            child: MusicLiveRing(color: Colors.white, stroke: 3.5),
          ),
        DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Hero(
            tag: musicArtistHeroTag(kind, artist.id),
            child: MusicArtwork(
              url: artist.imageUrl,
              size: 136,
              circle: true,
              initial: artist.initial,
            ),
          ),
        ),
      ],
    );
  }
}

/// What one item of a collection is called, for a sentence that has to count
/// them. Local to this screen because it is a turn of phrase, not a model
/// concern — `CollectionKind.label` remains the name of the channel.
extension on CollectionKind {
  String get pieceLabel =>
      this == CollectionKind.audiobooks ? 'reading' : 'song';

  String get piecesLabel =>
      this == CollectionKind.audiobooks ? 'readings' : 'songs';
}
