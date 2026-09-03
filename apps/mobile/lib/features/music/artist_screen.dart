import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_widgets.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

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
    final artist = ref.watch(
      musicArtistProvider((kind: kind, id: artistId)),
    );
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

    final tracks = artist.tracks;
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 260,
            // The name only appears in the bar once the portrait has scrolled
            // away behind it, which is what keeps the header from saying the
            // same thing twice.
            flexibleSpace: FlexibleSpaceBar(
              title: Text(artist.name, style: const TextStyle(fontSize: 15)),
              centerTitle: true,
              background: _Portrait(artist: artist),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 6),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${tracks.length} '
                    '${tracks.length == 1 ? kind.pieceLabel : kind.piecesLabel} '
                    'in the archive',
                    style: TextStyle(
                      color: context.brand.mutedInk,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 14),
                  MusicTransportRow(
                    count: tracks.length,
                    onPlayAll: () => controller.playCollection(
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
                ],
              ),
            ),
          ),
          SliverPadding(
            padding: EdgeInsets.only(top: 6, bottom: 24 + musicInset(context)),
            sliver: SliverList.builder(
              itemCount: tracks.length,
              itemBuilder: (context, index) => MusicTrackRow(
                item: tracks[index],
                leadingNumber: index + 1,
                onPlay: () => controller.playCollection(
                  tracks,
                  startIndex: index,
                  kind: kind,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The portrait behind the header: their picture, darkened towards the bottom
/// so the name over it is legible whatever the photograph turns out to be.
class _Portrait extends StatelessWidget {
  const _Portrait({required this.artist});

  final MusicArtist artist;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Stack(
      fit: StackFit.expand,
      children: [
        // Square artwork stretched across a wide header would distort a face.
        // Centring the circle on a plain ground keeps the picture honest and
        // reads as a portrait rather than as a cropped album cover.
        ColoredBox(color: brand.surfaceMuted),
        Center(
          child: MusicArtwork(
            url: artist.imageUrl,
            size: 148,
            circle: true,
            initial: artist.initial,
          ),
        ),
        IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.center,
                colors: [
                  brand.background.withValues(alpha: 0.92),
                  brand.background.withValues(alpha: 0),
                ],
              ),
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
