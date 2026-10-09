import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

/// The header of a page that is a list of pieces — an artist, a kind of song.
///
/// A coloured stage with the page's picture in the middle and its name at the
/// foot, which folds into a bar as the list scrolls. The round play button is
/// the one thing that does not fade with it: it travels up out of the stage
/// and docks in the bar, so the way to play the page is under the thumb at
/// every scroll position, not only at the top.
class MusicPageHeaderDelegate extends SliverPersistentHeaderDelegate {
  MusicPageHeaderDelegate({
    required this.title,
    required this.subtitle,
    required this.color,
    required this.visual,
    required this.tracks,
    required this.onPlay,
    required this.onShuffle,
    required this.topPadding,
    this.visualSize = 148,
  });

  final String title;
  final String subtitle;
  final Color color;

  /// The picture on the stage — a portrait, a sleeve. Scales down and fades as
  /// the stage folds away.
  final Widget visual;
  final double visualSize;

  /// The pieces the page holds, for knowing whether the play button is
  /// already the one playing.
  final List<PublishedReel> tracks;

  final VoidCallback onPlay;
  final VoidCallback onShuffle;
  final double topPadding;

  static const double _toolbar = 56;
  static const double _button = 58;
  static const double _dockedButton = 42;

  @override
  double get minExtent => topPadding + _toolbar;

  @override
  double get maxExtent => topPadding + _toolbar + visualSize + 118;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final range = maxExtent - minExtent;
    final t = range <= 0 ? 1.0 : (shrinkOffset / range).clamp(0.0, 1.0);
    final extent = (maxExtent - shrinkOffset).clamp(minExtent, maxExtent);
    final width = MediaQuery.sizeOf(context).width;

    // The button's two resting places, and the path between them.
    final open = Offset(width - 20 - _button, extent - _button - 18);
    final docked = Offset(
      width - 10 - _dockedButton,
      topPadding + (_toolbar - _dockedButton) / 2,
    );
    final eased = Curves.easeInOut.transform(t);
    final buttonAt = Offset.lerp(open, docked, eased)!;
    final buttonSize = lerpDouble(_button, _dockedButton, eased)!;
    final fade = (1 - t * 1.6).clamp(0.0, 1.0);

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color.lerp(color, Colors.black, 0.25)!,
            color,
            Color.lerp(color, context.brand.background, 0.1)!,
          ],
          stops: const [0, 0.6, 1],
        ),
      ),
      child: ClipRect(
        child: Stack(
          children: [
            if (fade > 0)
              Positioned(
                left: 0,
                right: 0,
                top: topPadding + _toolbar - 6 - shrinkOffset * 0.35,
                child: Opacity(
                  opacity: fade,
                  child: Center(
                    child: Transform.scale(
                      scale: 1 - t * 0.3,
                      child: SizedBox.square(
                        dimension: visualSize,
                        child: visual,
                      ),
                    ),
                  ),
                ),
              ),
            if (fade > 0)
              Positioned(
                left: 20,
                right: 20 + _button + 12,
                bottom: 14,
                child: Opacity(
                  opacity: fade,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          height: 1.05,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          PressScale(
                            child: IconButton(
                              tooltip: 'Shuffle',
                              onPressed: onShuffle,
                              visualDensity: VisualDensity.compact,
                              icon: const Icon(
                                Icons.shuffle_rounded,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            Positioned(
              left: 4,
              right: 10 + _dockedButton + 8,
              top: topPadding,
              height: _toolbar,
              child: Row(
                children: [
                  const BackButton(color: Colors.white),
                  Expanded(
                    child: Opacity(
                      opacity: ((t - 0.6) / 0.4).clamp(0.0, 1.0),
                      child: Text(
                        title,
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
              ),
            ),
            Positioned(
              left: buttonAt.dx,
              top: buttonAt.dy,
              width: buttonSize,
              height: buttonSize,
              child: MusicPagePlayButton(
                tracks: tracks,
                color: color,
                onPlay: onPlay,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(MusicPageHeaderDelegate oldDelegate) =>
      oldDelegate.title != title ||
      oldDelegate.subtitle != subtitle ||
      oldDelegate.color != color ||
      oldDelegate.topPadding != topPadding ||
      oldDelegate.visualSize != visualSize ||
      !identical(oldDelegate.tracks, tracks) ||
      oldDelegate.visual != visual;
}

/// The page's own play button: play from the top, or — when this page's
/// queue is the one sounding — pause and resume it.
class MusicPagePlayButton extends ConsumerWidget {
  const MusicPagePlayButton({
    required this.tracks,
    required this.color,
    required this.onPlay,
    super.key,
  });

  final List<PublishedReel> tracks;
  final Color color;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentId = ref.watch(
      musicMediaItemProvider.select((state) => state.asData?.value?.id),
    );
    final ours = currentId != null && tracks.any((t) => t.id == currentId);
    final playing = ours && ref.watch(musicIsPlayingProvider);
    final controller = ref.read(musicControllerProvider.notifier);

    return PressScale(
      pressed: 0.9,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        elevation: 6,
        shadowColor: Colors.black.withValues(alpha: 0.5),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: !ours
              ? onPlay
              : playing
              ? controller.pause
              : controller.play,
          child: Tooltip(
            message: playing ? 'Pause' : 'Play',
            child: Center(
              child: AnimatedSwitcher(
                duration: motionOr(context, AppMotion.standard),
                transitionBuilder: (child, animation) =>
                    ScaleTransition(scale: animation, child: child),
                child: playing
                    ? MusicEqualizer(key: const ValueKey('eq'), color: color)
                    : Icon(
                        Icons.play_arrow_rounded,
                        key: const ValueKey('play'),
                        color: color,
                        size: 30,
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
