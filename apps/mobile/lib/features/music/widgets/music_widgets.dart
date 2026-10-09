import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The pieces every music surface is built out of.
///
/// One file, because the alternative is what was here before: each screen
/// drawing its own artwork placeholder, its own now-playing highlight and its
/// own idea of how tall a row is. A player is judged almost entirely on whether
/// it feels like one thing, and it cannot feel like one thing if the artwork on
/// the shelf and the artwork in the list round their corners differently.

/// The hero tag an artist's face flies under, from a circle to their page.
///
/// Keyed by channel as well as id: the same person can have a shelf in Music
/// and another in Audiobooks, and those are two different pages.
Object musicArtistHeroTag(CollectionKind kind, String artistId) =>
    'music-artist-${kind.name}-$artistId';

/// What the one-line state of a track is, for anything that draws a track.
enum MusicTrackState { idle, playing, paused }

/// Whether [trackId] is the one cued, and whether it is moving.
///
/// `select` rather than a plain watch: a row is one of a hundred, and a track
/// change must repaint the two rows whose state changed rather than rebuild
/// the whole list.
MusicTrackState watchTrackState(WidgetRef ref, String trackId) {
  final isCurrent = ref.watch(
    musicMediaItemProvider.select(
      (state) => state.asData?.value?.id == trackId,
    ),
  );
  if (!isCurrent) return MusicTrackState.idle;
  return ref.watch(musicIsPlayingProvider)
      ? MusicTrackState.playing
      : MusicTrackState.paused;
}

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

    // Decoded at the size it is drawn, not at the poster's full size. A 96 px
    // circle does not need a 1200 px photograph held in memory, and on a
    // shelf of twelve that is the difference between smooth and stuttering.
    final decode = (size * MediaQuery.devicePixelRatioOf(context)).round();
    final image = url == null || url!.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: url!,
            fit: BoxFit.cover,
            width: size,
            height: size,
            memCacheWidth: decode,
            fadeInDuration: const Duration(milliseconds: 220),
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

/// What a piece of artwork shows over itself while it is the one cued: the
/// meter moving while it plays, a pause mark while it waits.
class MusicTrackStateOverlay extends StatelessWidget {
  const MusicTrackStateOverlay({
    required this.state,
    required this.radius,
    this.meter = const Size(20, 16),
    super.key,
  });

  final MusicTrackState state;
  final double radius;
  final Size meter;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: motionOr(context, AppMotion.standard),
    child: state == MusicTrackState.idle
        ? const SizedBox.shrink(key: ValueKey('idle'))
        : DecoratedBox(
            key: const ValueKey('cued'),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.42),
              borderRadius: BorderRadius.circular(radius),
            ),
            child: Center(
              child: state == MusicTrackState.playing
                  ? MusicEqualizer(color: Colors.white, size: meter)
                  // Paused is drawn, not implied: bars that had stopped would
                  // look like bars nobody was watching.
                  : Icon(
                      Icons.pause_rounded,
                      color: Colors.white,
                      size: meter.height * 1.4,
                    ),
            ),
          ),
  );
}

/// A section heading, with an optional way through to the whole of it.
class MusicSectionHeader extends StatelessWidget {
  const MusicSectionHeader({
    required this.title,
    this.onSeeAll,
    this.seeAllLabel = 'See all',
    this.eyebrow,
    super.key,
  });

  final String title;
  final VoidCallback? onSeeAll;
  final String seeAllLabel;

  /// A small line above the title — how many, or why this shelf is here.
  final String? eyebrow;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 22, 10, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (eyebrow != null)
                  Text(
                    eyebrow!.toUpperCase(),
                    style: TextStyle(
                      color: brand.terracotta,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                    ),
                  ),
                Text(
                  title,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
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
    this.accent,
    super.key,
  });

  final PublishedReel item;
  final VoidCallback onPlay;

  /// The track's place in the list it is being shown in, when that means
  /// something — an artist's catalogue — and null when it does not.
  final int? leadingNumber;

  final VoidCallback? onMore;

  /// The colour of the playing row's title. The palette's accent when null.
  final Color? accent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final state = watchTrackState(ref, item.id);
    final isCurrent = state != MusicTrackState.idle;
    final offline = ref.watch(
      musicOfflineIdsProvider.select((ids) => ids.contains(item.id)),
    );
    final highlight = accent ?? brand.accent;

    return Semantics(
      button: true,
      label: 'Play ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: InkWell(
        onTap: onPlay,
        child: AnimatedContainer(
          duration: motionOr(context, AppMotion.standard),
          color: isCurrent
              ? highlight.withValues(alpha: brand.isDark ? 0.1 : 0.06)
              : Colors.transparent,
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
          child: Row(
            children: [
              if (leadingNumber != null) ...[
                SizedBox(
                  width: 22,
                  child: state == MusicTrackState.playing
                      ? Center(
                          child: MusicEqualizer(
                            color: highlight,
                            size: const Size(14, 12),
                          ),
                        )
                      : Text(
                          '$leadingNumber',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: isCurrent ? highlight : brand.faintInk,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                const SizedBox(width: 8),
              ],
              PressScale(
                pressed: 0.9,
                child: Stack(
                  children: [
                    MusicArtwork(url: item.posterUrl, size: 52),
                    if (leadingNumber == null)
                      Positioned.fill(
                        child: MusicTrackStateOverlay(
                          state: state,
                          radius: 10,
                          meter: const Size(18, 14),
                        ),
                      ),
                  ],
                ),
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
                        color: isCurrent ? highlight : brand.ink,
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        if (offline) ...[
                          // Kept on this phone: plays with no signal and costs
                          // no data. Worth saying before somebody taps it on a
                          // bus with one bar.
                          Icon(
                            Icons.download_done_rounded,
                            size: 14,
                            color: brand.success,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            [
                              item.creatorName,
                              if (item.category.trim().isNotEmpty)
                                item.category.trim(),
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: brand.mutedInk,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                      ],
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
///
/// While one of their pieces is playing the circle wears a slowly turning ring
/// — the shelf of people says whose voice is in the room.
class MusicArtistCircle extends ConsumerWidget {
  const MusicArtistCircle({
    required this.artist,
    required this.onOpen,
    this.kind = CollectionKind.music,
    this.size = 96,
    this.ringColor,
    super.key,
  });

  final MusicArtist artist;
  final VoidCallback onOpen;
  final CollectionKind kind;
  final double size;

  /// The live ring's colour. The palette's accent when null.
  final Color? ringColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final currentId = ref.watch(
      musicMediaItemProvider.select((state) => state.asData?.value?.id),
    );
    final theirs =
        currentId != null && artist.tracks.any((t) => t.id == currentId);
    final live = theirs && ref.watch(musicIsPlayingProvider);

    return Semantics(
      button: true,
      label:
          '${artist.name}, ${artist.trackCount} '
          '${artist.trackCount == 1 ? 'piece' : 'pieces'}'
          '${live ? ', playing now' : ''}',
      excludeSemantics: true,
      child: PressScale(
        child: InkWell(
          borderRadius: BorderRadius.circular(size / 2),
          onTap: onOpen,
          child: SizedBox(
            width: size + 12,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: size + 8,
                  height: size + 8,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      if (live)
                        Positioned.fill(
                          child: MusicLiveRing(
                            color: ringColor ?? brand.accent,
                          ),
                        )
                      else if (theirs)
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: (ringColor ?? brand.accent).withValues(
                                  alpha: 0.5,
                                ),
                                width: 2,
                              ),
                            ),
                          ),
                        ),
                      Hero(
                        tag: musicArtistHeroTag(kind, artist.id),
                        child: MusicArtwork(
                          url: artist.imageUrl,
                          size: size,
                          circle: true,
                          initial: artist.initial,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
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
                  '${artist.trackCount} '
                  '${artist.trackCount == 1 ? 'piece' : 'pieces'}',
                  style: TextStyle(color: brand.mutedInk, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A turning ring of colour, for the face of whoever is playing now.
///
/// Mounted only while they are, which is what keeps it from being a ticker
/// that runs behind a paused screen.
class MusicLiveRing extends StatefulWidget {
  const MusicLiveRing({required this.color, this.stroke = 3, super.key});

  final Color color;
  final double stroke;

  @override
  State<MusicLiveRing> createState() => _MusicLiveRingState();
}

class _MusicLiveRingState extends State<MusicLiveRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _turn = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 4),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (motionAllowed(context)) {
      if (!_turn.isAnimating) _turn.repeat();
    } else {
      _turn.stop();
    }
  }

  @override
  void dispose() {
    _turn.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(
      painter: _LiveRingPainter(
        turn: _turn,
        color: widget.color,
        stroke: widget.stroke,
      ),
    ),
  );
}

class _LiveRingPainter extends CustomPainter {
  _LiveRingPainter({
    required this.turn,
    required this.color,
    required this.stroke,
  }) : super(repaint: turn);

  final Animation<double> turn;
  final Color color;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = (Offset.zero & size).deflate(stroke / 2);
    final shader = SweepGradient(
      colors: [
        color.withValues(alpha: 0),
        color,
        Color.lerp(color, Colors.white, 0.35)!,
        color.withValues(alpha: 0),
      ],
      stops: const [0, 0.45, 0.7, 1],
      transform: GradientRotation(2 * math.pi * turn.value),
    ).createShader(rect);
    canvas.drawArc(
      rect,
      0,
      2 * math.pi,
      false,
      Paint()
        ..shader = shader
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = stroke,
    );
  }

  @override
  bool shouldRepaint(_LiveRingPainter old) =>
      old.color != color || old.stroke != stroke;
}

/// The little meter the app rail wears on Collection while music plays.
///
/// It answers a question the mini-player cannot: not *what* is playing but
/// *where it lives* — which of the five doors to go back through for the rest
/// of it. It renders nothing at all while nothing plays, so the rail is exactly
/// as it was for everybody who never presses play.
class MusicLiveBadge extends ConsumerWidget {
  const MusicLiveBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(musicIsPlayingProvider)) return const SizedBox.shrink();
    final brand = context.brand;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 2),
      decoration: BoxDecoration(
        color: brand.surface,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: brand.border),
      ),
      child: MusicEqualizer(
        color: musicChannelColor(brand, CollectionKind.music),
        size: const Size(13, 9),
      ),
    );
  }
}

/// A song on a horizontal shelf: artwork above, two lines under it.
class MusicShelfCard extends ConsumerWidget {
  const MusicShelfCard({
    required this.item,
    required this.onPlay,
    this.size = 148,
    super.key,
  });

  final PublishedReel item;
  final VoidCallback onPlay;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final state = watchTrackState(ref, item.id);
    return Semantics(
      button: true,
      label: 'Play ${item.title} by ${item.creatorName}',
      excludeSemantics: true,
      child: PressScale(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPlay,
          child: SizedBox(
            width: size,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: brand.shadow.withValues(
                          alpha: brand.isDark ? 0.4 : 0.1,
                        ),
                        blurRadius: 14,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Stack(
                    children: [
                      MusicArtwork(url: item.posterUrl, size: size, radius: 14),
                      Positioned.fill(
                        child: MusicTrackStateOverlay(
                          state: state,
                          radius: 14,
                          meter: const Size(30, 24),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  item.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 13.5,
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
    this.accent,
    super.key,
  });

  final int count;
  final VoidCallback onPlayAll;
  final VoidCallback onShuffle;

  /// The fill of the Play all button. The theme's own when null.
  final Color? accent;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      PressScale(
        child: FilledButton.icon(
          onPressed: onPlayAll,
          style: accent == null
              ? null
              : FilledButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: Colors.white,
                ),
          icon: const Icon(Icons.play_arrow_rounded),
          label: Text('Play all $count'),
        ),
      ),
      const SizedBox(width: 10),
      PressScale(
        child: OutlinedButton.icon(
          onPressed: onShuffle,
          icon: const Icon(Icons.shuffle_rounded),
          label: const Text('Shuffle'),
        ),
      ),
    ],
  );
}
