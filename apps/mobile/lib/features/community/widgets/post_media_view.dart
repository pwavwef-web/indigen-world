import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:just_audio/just_audio.dart';
import 'package:video_player/video_player.dart';

/// The media block under a post body. One attachment fills the width; two or
/// more tile into a rounded grid, the way the reference social feed does.
class PostMediaView extends StatelessWidget {
  const PostMediaView({required this.media, this.onOpen, super.key});

  final List<CommunityMedia> media;
  final void Function(int index)? onOpen;

  /// The tallest and widest shapes a single attachment may be drawn in.
  ///
  /// A phone-shot portrait clip is 9:16, and drawn at its own shape one post
  /// took nearly the whole screen — the feed became a stack of slabs with a
  /// line of writing between them. Every text-first social product caps this
  /// for the same reason. Past the cap the attachment is centred inside the
  /// capped box and cropped evenly from both ends, which is what keeps the
  /// middle of a portrait video in the middle of the frame. Tapping it still
  /// opens the whole thing, uncropped.
  static const _minAspect = 3 / 4;
  static const _maxAspect = 16 / 9;

  /// The shape [item] is drawn in: its own, held between the two caps.
  static double displayAspect(CommunityMedia item) {
    final ratio = item.aspectRatio <= 0 ? 4 / 3 : item.aspectRatio;
    return ratio.clamp(_minAspect, _maxAspect).toDouble();
  }

  @override
  Widget build(BuildContext context) {
    if (media.isEmpty) return const SizedBox.shrink();

    if (media.length == 1) {
      final item = media.first;
      if (item.isAudio) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: SizedBox(height: 104, child: _AudioPlayerTile(item: item)),
        );
      }
      return ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: AspectRatio(
          aspectRatio: displayAspect(item),
          child: _MediaTile(item: item, onOpen: () => onOpen?.call(0)),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: AspectRatio(
        aspectRatio: 16 / 10,
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          padding: EdgeInsets.zero,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 3,
            crossAxisSpacing: 3,
            childAspectRatio: media.length == 2 ? 8 / 10 : 1,
          ),
          itemCount: media.length,
          itemBuilder: (context, index) =>
              _MediaTile(item: media[index], onOpen: () => onOpen?.call(index)),
        ),
      ),
    );
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({required this.item, required this.onOpen});

  final CommunityMedia item;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    if (item.isAudio) return _AudioPlayerTile(item: item, compact: true);
    return GestureDetector(
      onTap: onOpen,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (item.isVideo)
            VideoCover(videoUrl: item.url, thumbnailUrl: item.thumbnailUrl)
          else
            CachedNetworkImage(
              imageUrl: item.url,
              fit: BoxFit.cover,
              placeholder: (context, url) =>
                  ColoredBox(color: context.brand.divider),
              errorWidget: (context, url, error) => ColoredBox(
                color: context.brand.divider,
                child: Icon(
                  Icons.image_not_supported_outlined,
                  color: context.brand.mutedInk,
                ),
              ),
            ),
          if (item.isVideo) ...[
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Color(0x99000000)],
                ),
              ),
            ),
            const Center(
              child: Icon(
                Icons.play_circle_fill_rounded,
                color: Colors.white,
                size: 54,
              ),
            ),
            const Positioned(
              left: 8,
              top: 8,
              child: _MediaBadge(label: 'REEL'),
            ),
          ],
        ],
      ),
    );
  }
}

class _AudioPlayerTile extends StatefulWidget {
  const _AudioPlayerTile({required this.item, this.compact = false});

  final CommunityMedia item;
  final bool compact;

  @override
  State<_AudioPlayerTile> createState() => _AudioPlayerTileState();
}

class _AudioPlayerTileState extends State<_AudioPlayerTile> {
  late final AudioPlayer _player;
  var _failed = false;

  @override
  void initState() {
    super.initState();
    _player = AudioPlayer();
    _load();
  }

  Future<void> _load() async {
    try {
      await _player.setUrl(widget.item.url);
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: context.brand.accent,
    child: Padding(
      padding: EdgeInsets.symmetric(
        horizontal: widget.compact ? 8 : 14,
        vertical: 10,
      ),
      child: Row(
        children: [
          StreamBuilder<PlayerState>(
            stream: _player.playerStateStream,
            builder: (context, snapshot) {
              final playing = snapshot.data?.playing ?? false;
              final processing = snapshot.data?.processingState;
              final loading =
                  processing == ProcessingState.loading ||
                  processing == ProcessingState.buffering;
              return IconButton.filled(
                tooltip: playing ? 'Pause voice note' : 'Play voice note',
                onPressed: _failed || loading
                    ? null
                    : () => playing ? _player.pause() : _player.play(),
                style: IconButton.styleFrom(
                  backgroundColor: context.brand.gold,
                  foregroundColor: context.brand.ink,
                ),
                icon: loading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        playing
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                      ),
              );
            },
          ),
          SizedBox(width: widget.compact ? 4 : 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _failed ? 'Voice note unavailable' : 'VOICE NOTE',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.7,
                  ),
                ),
                const SizedBox(height: 7),
                StreamBuilder<Duration>(
                  stream: _player.positionStream,
                  builder: (context, positionSnapshot) =>
                      StreamBuilder<Duration?>(
                        stream: _player.durationStream,
                        builder: (context, durationSnapshot) {
                          final duration =
                              durationSnapshot.data ??
                              Duration(
                                seconds: widget.item.durationSeconds ?? 0,
                              );
                          final position =
                              positionSnapshot.data ?? Duration.zero;
                          final total = duration.inMilliseconds;
                          final progress = total <= 0
                              ? 0.0
                              : (position.inMilliseconds / total).clamp(
                                  0.0,
                                  1.0,
                                );
                          return LinearProgressIndicator(
                            value: progress,
                            minHeight: 4,
                            borderRadius: BorderRadius.circular(999),
                            backgroundColor: Colors.white24,
                            color: context.brand.gold,
                          );
                        },
                      ),
                ),
              ],
            ),
          ),
          if (!widget.compact) ...[
            const SizedBox(width: 9),
            StreamBuilder<Duration>(
              stream: _player.positionStream,
              builder: (context, snapshot) {
                final value = snapshot.data ?? Duration.zero;
                final minutes = value.inMinutes.toString().padLeft(2, '0');
                final seconds = (value.inSeconds % 60).toString().padLeft(
                  2,
                  '0',
                );
                return Text(
                  '$minutes:$seconds',
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                );
              },
            ),
          ],
        ],
      ),
    ),
  );
}

class _MediaBadge extends StatelessWidget {
  const _MediaBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.black54,
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: context.brand.gold,
        fontSize: 9,
        fontWeight: FontWeight.w900,
        letterSpacing: 0.6,
      ),
    ),
  );
}

/// Full-screen viewer opened by tapping a post attachment. Images pinch-zoom;
/// videos play inline with a scrub bar.
class MediaViewerPage extends StatefulWidget {
  const MediaViewerPage({
    required this.media,
    this.initialIndex = 0,
    super.key,
  });

  final List<CommunityMedia> media;
  final int initialIndex;

  @override
  State<MediaViewerPage> createState() => _MediaViewerPageState();
}

class _MediaViewerPageState extends State<MediaViewerPage> {
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => NightTheme(
    child: Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: PageView.builder(
        controller: _controller,
        itemCount: widget.media.length,
        itemBuilder: (context, index) {
          final item = widget.media[index];
          if (item.isAudio) {
            return Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: SizedBox(
                  height: 112,
                  child: _AudioPlayerTile(item: item),
                ),
              ),
            );
          }
          if (item.isVideo) return _VideoPlayerBox(url: item.url);
          return InteractiveViewer(
            minScale: 1,
            maxScale: 4,
            child: Center(
              child: CachedNetworkImage(
                imageUrl: item.url,
                fit: BoxFit.contain,
              ),
            ),
          );
        },
      ),
    ),
  );
}

class _VideoPlayerBox extends StatefulWidget {
  const _VideoPlayerBox({required this.url});

  final String url;

  @override
  State<_VideoPlayerBox> createState() => _VideoPlayerBoxState();
}

class _VideoPlayerBoxState extends State<_VideoPlayerBox> {
  VideoPlayerController? _controller;
  var _failed = false;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.play();
    } on Object {
      await controller.dispose();
      if (mounted) setState(() => _failed = true);
      return;
    }
    if (!mounted) {
      await controller.dispose();
      return;
    }
    setState(() => _controller = controller);
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_failed) {
      return const Center(
        child: Text(
          'This reel could not be played.',
          style: TextStyle(color: Colors.white70),
        ),
      );
    }
    final controller = _controller;
    if (controller == null) {
      return Center(
        child: CircularProgressIndicator(color: context.brand.gold),
      );
    }
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: controller.value.aspectRatio,
            child: GestureDetector(
              onTap: () => setState(
                () => controller.value.isPlaying
                    ? controller.pause()
                    : controller.play(),
              ),
              child: VideoPlayer(controller),
            ),
          ),
          VideoProgressIndicator(
            controller,
            allowScrubbing: true,
            colors: VideoProgressColors(
              playedColor: context.brand.gold,
              bufferedColor: Colors.white30,
              backgroundColor: Colors.white12,
            ),
          ),
        ],
      ),
    );
  }
}
