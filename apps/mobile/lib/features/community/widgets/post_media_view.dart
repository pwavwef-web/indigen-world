import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:video_player/video_player.dart';

/// The media block under a post body. One attachment fills the width; two or
/// more tile into a rounded grid, the way the reference social feed does.
class PostMediaView extends StatelessWidget {
  const PostMediaView({required this.media, this.onOpen, super.key});

  final List<CommunityMedia> media;
  final void Function(int index)? onOpen;

  @override
  Widget build(BuildContext context) {
    if (media.isEmpty) return const SizedBox.shrink();

    if (media.length == 1) {
      final item = media.first;
      return ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: AspectRatio(
          aspectRatio: item.aspectRatio <= 0 ? 4 / 3 : item.aspectRatio,
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
  Widget build(BuildContext context) => GestureDetector(
    onTap: onOpen,
    child: Stack(
      fit: StackFit.expand,
      children: [
        if (item.isVideo)
          ColoredBox(
            color: BrandColors.heritageGreen,
            child: item.thumbnailUrl != null
                ? CachedNetworkImage(
                    imageUrl: item.thumbnailUrl!,
                    fit: BoxFit.cover,
                    errorWidget: (context, url, error) =>
                        const SizedBox.shrink(),
                  )
                : const SizedBox.shrink(),
          )
        else
          CachedNetworkImage(
            imageUrl: item.url,
            fit: BoxFit.cover,
            placeholder: (context, url) =>
                const ColoredBox(color: BrandColors.divider),
            errorWidget: (context, url, error) => const ColoredBox(
              color: BrandColors.divider,
              child: Icon(
                Icons.image_not_supported_outlined,
                color: BrandColors.mutedInk,
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
          const Positioned(left: 8, top: 8, child: _MediaBadge(label: 'REEL')),
        ],
      ],
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
      style: const TextStyle(
        color: BrandColors.kenteGold,
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
  Widget build(BuildContext context) => Scaffold(
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
        if (item.isVideo) return _VideoPlayerBox(url: item.url);
        return InteractiveViewer(
          minScale: 1,
          maxScale: 4,
          child: Center(
            child: CachedNetworkImage(imageUrl: item.url, fit: BoxFit.contain),
          ),
        );
      },
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
      return const Center(
        child: CircularProgressIndicator(color: BrandColors.kenteGold),
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
            colors: const VideoProgressColors(
              playedColor: BrandColors.kenteGold,
              bufferedColor: Colors.white30,
              backgroundColor: Colors.white12,
            ),
          ),
        ],
      ),
    );
  }
}
