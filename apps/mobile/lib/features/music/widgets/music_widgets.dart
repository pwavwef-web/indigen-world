import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';

/// The pieces every music surface is built out of.
///
/// One file, because the alternative is what was here before: each screen
/// drawing its own artwork placeholder, its own now-playing highlight and its
/// own idea of how tall a row is. A player is judged almost entirely on whether
/// it feels like one thing, and it cannot feel like one thing if the artwork on
/// the shelf and the artwork in the list round their corners differently.

/// Square artwork with a fallback that is a picture rather than a hole.
class MusicArtwork extends StatelessWidget {
  const MusicArtwork({
    required this.url,
    required this.size,
    this.radius = 10,
    this.circle = false,
    this.initial,
    super.key,
  });

  final String? url;
  final double size;
  final double radius;

  /// Artists are circles and songs are squares, the way every player has drawn
  /// them since the first one. It is not decoration: it is how the eye tells a
  /// person from a piece of work without reading a word.
  final bool circle;

  /// Drawn instead of the note glyph when there is a name to stand in for —
  /// an artist with no photograph is a letter, not an anonymous icon.
  final String? initial;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final placeholder = DecoratedBox(
      decoration: BoxDecoration(
        color: brand.surfaceMuted,
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(radius),
      ),
      child: Center(
        child: initial == null
            ? Icon(
                Icons.graphic_eq_rounded,
                color: brand.mutedInk,
                size: size * 0.34,
              )
            : Text(
                initial!,
                style: TextStyle(
                  color: brand.mutedInk,
                  fontSize: size * 0.36,
                  fontWeight: FontWeight.w900,
                ),
              ),
      ),
    );

    final image = url == null || url!.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: url!,
            fit: BoxFit.cover,
            width: size,
            height: size,
            placeholder: (_, _) => placeholder,
            errorWidget: (_, _, _) => placeholder,
          );

    return SizedBox(
      width: size,
      height: size,
      child: circle
          ? ClipOval(child: image)
          : ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: image,
            ),
    );
  }
}

/// A section heading, with an optional way through to the whole of it.
class MusicSectionHeader extends StatelessWidget {
  const MusicSectionHeader({
    required this.title,
    this.onSeeAll,
    this.seeAllLabel = 'See all',
    super.key,
  });

  final String title;
  final VoidCallback? onSeeAll;
  final String seeAllLabel;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 20, 10, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                color: brand.ink,
                fontSize: 19,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.3,
              ),
            ),
          ),
          if (onSeeAll != null)
            TextButton(onPressed: onSeeAll, child: Text(seeAllLabel)),
        ],
      ),
    );
  }
}

/// One song as a row: artwork, title, artist, and whatever it is doing now.
///
/// A row rather than a grid tile, for the list that holds everything. A grid
/// of squares is a beautiful way to show twelve albums and a hopeless way to
/// read a hundred song titles, which is what a growing archive turns into.
class MusicTrackRow extends ConsumerWidget {
  const MusicTrackRow({
    required this.item,
    required this.onPlay,
    this.leadingNumber,
    this.onMore,
    super.key,
  });

  final PublishedReel item;
  final VoidCallback onPlay;

  /// The track's place in the list it is being shown in, when that means
  /// something — an artist's catalogue — and null when it does not.
  final int? leadingNumber;

  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    // `select` rather than a plain watch: this row is one of a hundred, and a
    // track change must repaint the two rows whose highlight moved rather than
    // rebuild the whole list.
    final isCurrent = ref.watch(
      musicMediaItemProvider.select(
        (state) => state.asData?.value?.id == item.id,
      ),
    );
    final playing = isCurrent && ref.watch(musicIsPlayingProvider);

    return Semantics(
      button: true,
      label: 'Play ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onPlay,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
          child: Row(
            children: [
              if (leadingNumber != null) ...[
                SizedBox(
                  width: 22,
                  child: playing
                      ? Icon(Icons.equalizer_rounded, size: 16, color: brand.accent)
                      : Text(
                          '$leadingNumber',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: brand.faintInk,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                const SizedBox(width: 8),
              ],
              Stack(
                children: [
                  MusicArtwork(url: item.posterUrl, size: 52),
                  if (isCurrent && leadingNumber == null)
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.42),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          playing
                              ? Icons.equalizer_rounded
                              : Icons.pause_rounded,
                          color: brand.gold,
                          size: 22,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      item.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isCurrent ? brand.accent : brand.ink,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        item.creatorName,
                        if (item.category.trim().isNotEmpty) item.category.trim(),
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: brand.mutedInk, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (onMore != null)
                IconButton(
                  onPressed: onMore,
                  tooltip: 'More',
                  icon: Icon(Icons.more_horiz_rounded, color: brand.mutedInk),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// An artist as a circle with their name under it.
class MusicArtistCircle extends StatelessWidget {
  const MusicArtistCircle({
    required this.artist,
    required this.onOpen,
    this.size = 96,
    super.key,
  });

  final MusicArtist artist;
  final VoidCallback onOpen;
  final double size;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: '${artist.name}, ${artist.trackCount} '
          '${artist.trackCount == 1 ? 'piece' : 'pieces'}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(size / 2),
        onTap: onOpen,
        child: SizedBox(
          width: size + 12,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              MusicArtwork(
                url: artist.imageUrl,
                size: size,
                circle: true,
                initial: artist.initial,
              ),
              const SizedBox(height: 8),
              Text(
                artist.name,
                maxLines: 1,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                '${artist.trackCount}',
                style: TextStyle(color: brand.mutedInk, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A song on a horizontal shelf: artwork above, two lines under it.
class MusicShelfCard extends StatelessWidget {
  const MusicShelfCard({
    required this.item,
    required this.onPlay,
    this.size = 132,
    super.key,
  });

  final PublishedReel item;
  final VoidCallback onPlay;
  final double size;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Semantics(
      button: true,
      label: 'Play ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onPlay,
        child: SizedBox(
          width: size,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              MusicArtwork(url: item.posterUrl, size: size, radius: 12),
              const SizedBox(height: 8),
              Text(
                item.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: brand.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                item.creatorName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: brand.mutedInk, fontSize: 11.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Play all / Shuffle, the pair every collection opens with.
class MusicTransportRow extends StatelessWidget {
  const MusicTransportRow({
    required this.count,
    required this.onPlayAll,
    required this.onShuffle,
    super.key,
  });

  final int count;
  final VoidCallback onPlayAll;
  final VoidCallback onShuffle;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      FilledButton.icon(
        onPressed: onPlayAll,
        icon: const Icon(Icons.play_arrow_rounded),
        label: Text('Play all $count'),
      ),
      const SizedBox(width: 10),
      OutlinedButton.icon(
        onPressed: onShuffle,
        icon: const Icon(Icons.shuffle_rounded),
        label: const Text('Shuffle'),
      ),
    ],
  );
}
