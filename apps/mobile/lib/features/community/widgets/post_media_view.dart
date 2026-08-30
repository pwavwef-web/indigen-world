import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/community/data/community_models.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/widgets/inline_video.dart';
import 'package:indigen_world_mobile/features/community/widgets/video_cover.dart';
import 'package:indigen_world_mobile/shared/night_theme.dart';
import 'package:just_audio/just_audio.dart';
import 'package:video_player/video_player.dart';

/// What the immersive viewer can do to the post an attachment came from.
///
/// The viewer is a route of its own, so it cannot see the card's state. It is
/// handed the post's identity instead and watches appreciation live, which is
/// what lets a double tap on the photograph light up the heart under it
/// without the card underneath being rebuilt first.
@immutable
class MediaPostActions {
  const MediaPostActions({
    required this.postId,
    required this.likeCount,
    required this.replyCount,
    required this.onLike,
    this.onReply,
    this.onShare,
  });

  final String postId;
  final int likeCount;
  final int replyCount;
  final VoidCallback onLike;
  final VoidCallback? onReply;
  final VoidCallback? onShare;
}

/// The media block under a post body.
///
/// One attachment fills the width at its own shape; two or more tile into the
/// arrangement every timeline uses — halves for two, a tall left plate and two
/// stacked plates for three, a quartered grid for four — with hairline gaps
/// and the outer corners rounded once around the whole block rather than
/// around each tile.
///
/// A lone clip plays where it lies. Everything else waits for a tap.
class PostMediaView extends StatefulWidget {
  const PostMediaView({required this.media, this.actions, super.key});

  final List<CommunityMedia> media;

  /// Appreciate / reply / share, carried through to the immersive viewer.
  final MediaPostActions? actions;

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

  /// The shape a block of two or more attachments is drawn in. One shape
  /// whatever the tiles inside it are, so a feed of grids does not lurch.
  static const gridAspect = 16 / 9;

  /// The hairline between two tiles of the same block.
  static const gridGap = 2.0;

  static const _radius = 16.0;

  /// The shape [item] is drawn in: its own, held between the two caps.
  static double displayAspect(CommunityMedia item) {
    final ratio = item.aspectRatio <= 0 ? 4 / 3 : item.aspectRatio;
    return ratio.clamp(_minAspect, _maxAspect).toDouble();
  }

  @override
  State<PostMediaView> createState() => _PostMediaViewState();
}

class _PostMediaViewState extends State<PostMediaView> {
  /// The hero namespace for this block.
  ///
  /// It has to be unique across everything mounted at once — the same post can
  /// legitimately appear twice in one feed, once on its own and once as
  /// somebody's reshare, and two heroes sharing a tag is a crash rather than a
  /// glitch. Tying it to this State's identity makes a collision impossible
  /// while staying stable for as long as the tile is on screen, which is all
  /// the flight needs.
  late final String _heroBase = 'post-media-${identityHashCode(this)}';

  void _open(int index) {
    unawaited(
      openMediaViewer(
        context,
        media: widget.media,
        initialIndex: index,
        // Only the tile that was tapped flies; the rest of a grid fades in
        // behind it, which is what the eye expects from a shared element.
        heroTag: widget.media[index].isVideo ? null : '$_heroBase-$index',
        actions: widget.actions,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final media = widget.media;
    if (media.isEmpty) return const SizedBox.shrink();

    if (media.length == 1) {
      final item = media.first;
      if (item.isAudio) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(PostMediaView._radius),
          child: SizedBox(height: 104, child: AudioPlayerTile(item: item)),
        );
      }
      return ClipRRect(
        borderRadius: BorderRadius.circular(PostMediaView._radius),
        child: AspectRatio(
          aspectRatio: PostMediaView.displayAspect(item),
          child: _MediaTile(
            item: item,
            heroTag: item.isVideo ? null : '$_heroBase-0',
            // A single clip is the one attachment that plays by itself.
            live: true,
            onOpen: () => _open(0),
          ),
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(PostMediaView._radius),
      child: AspectRatio(
        aspectRatio: PostMediaView.gridAspect,
        child: _MediaGrid(
          media: media,
          heroBase: _heroBase,
          onOpen: _open,
        ),
      ),
    );
  }
}

/// The two-, three- and four-up arrangements.
///
/// Built out of rows and columns rather than a [GridView] because the three-up
/// case is not a grid: it is a full-height plate beside a split column, and a
/// fixed-count grid can only approximate it by making the third tile square
/// and leaving a hole.
class _MediaGrid extends StatelessWidget {
  const _MediaGrid({
    required this.media,
    required this.heroBase,
    required this.onOpen,
  });

  final List<CommunityMedia> media;
  final String heroBase;
  final ValueChanged<int> onOpen;

  Widget _tile(int index, {int overflow = 0}) => _MediaTile(
    item: media[index],
    heroTag: media[index].isVideo ? null : '$heroBase-$index',
    onOpen: () => onOpen(index),
    overflow: overflow,
  );

  @override
  Widget build(BuildContext context) {
    const gap = SizedBox(width: PostMediaView.gridGap);
    const vgap = SizedBox(height: PostMediaView.gridGap);

    if (media.length == 2) {
      return Row(
        children: [
          Expanded(child: _tile(0)),
          gap,
          Expanded(child: _tile(1)),
        ],
      );
    }

    if (media.length == 3) {
      return Row(
        children: [
          Expanded(child: _tile(0)),
          gap,
          Expanded(
            child: Column(
              children: [
                Expanded(child: _tile(1)),
                vgap,
                Expanded(child: _tile(2)),
              ],
            ),
          ),
        ],
      );
    }

    // Four or more. A post cannot carry more than four today, but a document
    // written by a future composer might — so the fourth tile counts the rest
    // rather than silently swallowing them.
    final extra = media.length - 4;
    return Column(
      children: [
        Expanded(
          child: Row(
            children: [
              Expanded(child: _tile(0)),
              gap,
              Expanded(child: _tile(1)),
            ],
          ),
        ),
        vgap,
        Expanded(
          child: Row(
            children: [
              Expanded(child: _tile(2)),
              gap,
              Expanded(child: _tile(3, overflow: extra)),
            ],
          ),
        ),
      ],
    );
  }
}

class _MediaTile extends StatelessWidget {
  const _MediaTile({
    required this.item,
    required this.onOpen,
    this.heroTag,
    this.live = false,
    this.overflow = 0,
  });

  final CommunityMedia item;
  final VoidCallback onOpen;
  final String? heroTag;

  /// Whether this tile is allowed to start itself. Only ever true for a clip
  /// posted on its own.
  final bool live;

  /// How many further attachments this tile stands in for.
  final int overflow;

  @override
  Widget build(BuildContext context) {
    if (item.isAudio) return AudioPlayerTile(item: item, compact: true);

    if (item.isVideo && live) {
      return InlineVideoTile(
        item: item,
        onOpen: onOpen,
        borderRadius: BorderRadius.circular(PostMediaView._radius),
      );
    }

    final picture = item.isVideo
        ? VideoCover(videoUrl: item.url, thumbnailUrl: item.thumbnailUrl)
        : CachedNetworkImage(
            imageUrl: item.url,
            fit: BoxFit.cover,
            placeholder: (context, url) => ColoredBox(color: context.brand.divider),
            errorWidget: (context, url, error) => ColoredBox(
              color: context.brand.divider,
              child: Icon(
                Icons.image_not_supported_outlined,
                color: context.brand.mutedInk,
              ),
            ),
          );

    return GestureDetector(
      // Opaque, not deferred: a photograph that has not arrived yet paints a
      // plain fill, and a plain fill is not a hit test target — so the tap fell
      // through to the card underneath and opened the conversation instead of
      // the picture.
      behavior: HitTestBehavior.opaque,
      onTap: onOpen,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (heroTag case final tag?)
            Hero(tag: tag, child: picture)
          else
            picture,
          if (item.isVideo) ...[
            const IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.center,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0x66000000)],
                  ),
                ),
              ),
            ),
            const Center(child: PlayGlyph(size: 46)),
            Positioned(
              left: 8,
              bottom: 8,
              child: MediaPill(
                icon: Icons.play_arrow_rounded,
                label: mediaClockLabel(
                  Duration(seconds: item.durationSeconds ?? 0),
                ),
              ),
            ),
          ],
          if (overflow > 0)
            ColoredBox(
              color: const Color(0x99000000),
              child: Center(
                child: Text(
                  '+$overflow',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A voice note, drawn as a bar you can play rather than as a file you cannot.
class AudioPlayerTile extends StatefulWidget {
  const AudioPlayerTile({required this.item, this.compact = false, super.key});

  final CommunityMedia item;
  final bool compact;

  @override
  State<AudioPlayerTile> createState() => _AudioPlayerTileState();
}

class _AudioPlayerTileState extends State<AudioPlayerTile> {
  late final AudioPlayer _player;
  var _failed = false;

  @override
  void initState() {
    super.initState();
    _player = AudioPlayer();
    unawaited(_load());
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
    unawaited(_player.dispose());
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
              builder: (context, snapshot) => Text(
                mediaClockLabel(snapshot.data ?? Duration.zero),
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}

// ── The immersive viewer ─────────────────────────────────────────────────────

/// Opens [media] full screen, starting at [initialIndex].
///
/// Pushed as a see-through route on purpose: the viewer can be dragged down to
/// dismiss, and what the reader should see behind the falling picture is the
/// post they opened it from — not a black rectangle, and not a second copy of
/// the feed rebuilding itself.
Future<void> openMediaViewer(
  BuildContext context, {
  required List<CommunityMedia> media,
  int initialIndex = 0,
  String? heroTag,
  MediaPostActions? actions,
}) => Navigator.of(context).push(
  PageRouteBuilder<void>(
    opaque: false,
    barrierColor: null,
    fullscreenDialog: true,
    transitionDuration: const Duration(milliseconds: 260),
    reverseTransitionDuration: const Duration(milliseconds: 200),
    pageBuilder: (context, animation, secondaryAnimation) => MediaViewerPage(
      media: media,
      initialIndex: initialIndex,
      heroTag: heroTag,
      actions: actions,
    ),
    transitionsBuilder: (context, animation, secondary, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
      child: child,
    ),
  ),
);

/// Full-screen viewer opened by tapping a post attachment.
///
/// Everything here is a gesture somebody already knows from somewhere else:
/// pinch to zoom, swipe sideways between attachments, drag down to put it back
/// where it came from, tap to clear the chrome away, double tap to appreciate.
class MediaViewerPage extends ConsumerStatefulWidget {
  const MediaViewerPage({
    required this.media,
    this.initialIndex = 0,
    this.heroTag,
    this.actions,
    super.key,
  });

  final List<CommunityMedia> media;
  final int initialIndex;

  /// The tag of the tile that was tapped, when it is one that can fly.
  final String? heroTag;

  final MediaPostActions? actions;

  @override
  ConsumerState<MediaViewerPage> createState() => _MediaViewerPageState();
}

class _MediaViewerPageState extends ConsumerState<MediaViewerPage>
    with TickerProviderStateMixin {
  late final PageController _controller = PageController(
    initialPage: widget.initialIndex,
  );
  late final AnimationController _settle = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 240),
  );

  late final _burst = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 620),
  );

  late final FullScreenMediaCount _feedSilence = ref.read(
    fullScreenMediaProvider.notifier,
  );
  var _silenced = false;

  late int _index = widget.initialIndex;

  /// How far the picture has been dragged from its resting place.
  var _drag = Offset.zero;

  /// Where the drag was when it was let go, so the spring back reads as one
  /// movement rather than as a decay that never quite arrives.
  var _dragFrom = Offset.zero;

  /// Set while a picture is pinched in. Dragging is the zoomed picture's own
  /// gesture then, so the dismissal has to stand aside or the two fight.
  var _zoomed = false;

  var _chromeVisible = true;

  /// Whether appreciation has been added or taken away in here, so the count
  /// under the heart moves the moment it is tapped.
  int? _likeDelta;

  @override
  void initState() {
    super.initState();
    _settle.addListener(() {
      if (!mounted) return;
      setState(
        () => _drag = Offset.lerp(
          _dragFrom,
          Offset.zero,
          Curves.easeOutBack.transform(_settle.value),
        )!,
      );
    });
    // The feed underneath is still mounted behind a see-through route, so it
    // is told to stop playing until this closes. Deferred by a frame because a
    // provider must not be written to while the tree that reads it is building.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _silenced = true;
      _feedSilence.enter();
    });
  }

  @override
  void dispose() {
    if (_silenced) {
      // Riverpod refuses a write from inside a life-cycle callback, and this is
      // one. The feed may start playing again a microtask later than the viewer
      // closed, which is a difference nobody can see — and by then the whole
      // container may be gone, which is not this widget's problem to solve.
      final feedSilence = _feedSilence;
      unawaited(
        Future<void>.microtask(() {
          try {
            feedSilence.leave();
          } on Object {
            // The scope that owned it has been torn down; nothing to release.
          }
        }),
      );
    }
    _controller.dispose();
    _settle.dispose();
    _burst.dispose();
    super.dispose();
  }

  /// 1 at rest, falling towards 0 as the picture is dragged away.
  double get _restingness =>
      (1 - (_drag.dy.abs() / 320)).clamp(0.0, 1.0).toDouble();

  void _onDragUpdate(DragUpdateDetails details) {
    if (_zoomed) return;
    setState(() => _drag += details.delta);
  }

  void _onDragEnd(DragEndDetails details) {
    if (_zoomed) return;
    final velocity = details.velocity.pixelsPerSecond.dy;
    if (_drag.dy.abs() > 120 || velocity.abs() > 780) {
      Navigator.of(context).pop();
      return;
    }
    _dragFrom = _drag;
    _settle.forward(from: 0);
  }

  void _toggleChrome() => setState(() => _chromeVisible = !_chromeVisible);

  void _appreciate() {
    final actions = widget.actions;
    if (actions == null) return;
    final liked = ref.read(myLikesProvider).asData?.value.contains(
          actions.postId,
        ) ??
        false;
    HapticFeedback.mediumImpact();
    setState(() => _likeDelta = liked ? -1 : 1);
    // Taking appreciation back is a correction, not a moment. Only the giving
    // of it gets the flourish.
    if (!liked) _burst.forward(from: 0);
    actions.onLike();
  }

  @override
  Widget build(BuildContext context) {
    final actions = widget.actions;
    final liked = actions == null
        ? false
        : ref.watch(myLikesProvider).asData?.value.contains(actions.postId) ??
              false;

    return NightTheme(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            // The ground fades as the picture is pulled away, so the feed it
            // came from is already showing through before it is let go.
            Positioned.fill(
              child: IgnorePointer(
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: _restingness),
                ),
              ),
            ),
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _toggleChrome,
                onDoubleTap: actions == null ? null : _appreciate,
                onVerticalDragUpdate: _onDragUpdate,
                onVerticalDragEnd: _onDragEnd,
                child: Transform.translate(
                  offset: _drag,
                  child: Transform.scale(
                    scale: 0.86 + (0.14 * _restingness),
                    child: PageView.builder(
                      controller: _controller,
                      // A zoomed picture owns its own panning; letting the
                      // pager also read that drag turns a careful pan into a
                      // page turn.
                      physics: _zoomed
                          ? const NeverScrollableScrollPhysics()
                          : const PageScrollPhysics(),
                      onPageChanged: (index) => setState(() {
                        _index = index;
                        _zoomed = false;
                      }),
                      itemCount: widget.media.length,
                      itemBuilder: (context, index) => _ViewerPage(
                        item: widget.media[index],
                        // Only the tile that was tapped has a partner to fly
                        // from; the rest simply appear.
                        heroTag: index == widget.initialIndex
                            ? widget.heroTag
                            : null,
                        onZoomChanged: (zoomed) {
                          if (zoomed != _zoomed) {
                            setState(() => _zoomed = zoomed);
                          }
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Positioned.fill(child: IgnorePointer(child: _Burst(_burst))),
            _ViewerChrome(
              visible: _chromeVisible && _restingness > 0.85,
              index: _index,
              count: widget.media.length,
              liked: liked,
              likeCount: (actions?.likeCount ?? 0) + (_likeDelta ?? 0),
              replyCount: actions?.replyCount ?? 0,
              onLike: actions == null ? null : _appreciate,
              onReply: actions?.onReply,
              onShare: actions?.onShare,
            ),
          ],
        ),
      ),
    );
  }
}

/// The heart that swells out of a double tap and is gone again in half a
/// second. It is the only confirmation the gesture gets, so it is drawn over
/// the middle of the picture where the fingers were.
class _Burst extends StatelessWidget {
  const _Burst(this.animation);

  final Animation<double> animation;

  @override
  Widget build(BuildContext context) => Center(
    child: AnimatedBuilder(
      animation: animation,
      builder: (context, _) {
        final value = animation.value;
        if (value == 0 || value == 1) return const SizedBox.shrink();
        // Out fast, hold, then away — the shape of every gesture confirmation
        // that has ever felt right.
        final scale = value < 0.35
            ? Curves.easeOutBack.transform(value / 0.35) * 1.05
            : 1.05 + ((value - 0.35) * 0.35);
        final opacity = value < 0.35
            ? 1.0
            : (1 - ((value - 0.35) / 0.65)).clamp(0.0, 1.0).toDouble();
        return Opacity(
          opacity: opacity,
          child: Transform.scale(
            scale: scale,
            child: const Icon(
              Icons.favorite_rounded,
              size: 118,
              color: Color(0xF2E0563C),
            ),
          ),
        );
      },
    ),
  );
}

/// One attachment, filling the frame.
class _ViewerPage extends StatefulWidget {
  const _ViewerPage({
    required this.item,
    required this.onZoomChanged,
    this.heroTag,
  });

  final CommunityMedia item;
  final String? heroTag;
  final ValueChanged<bool> onZoomChanged;

  @override
  State<_ViewerPage> createState() => _ViewerPageState();
}

class _ViewerPageState extends State<_ViewerPage> {
  final _transform = TransformationController();

  @override
  void initState() {
    super.initState();
    _transform.addListener(_reportZoom);
  }

  @override
  void dispose() {
    _transform
      ..removeListener(_reportZoom)
      ..dispose();
    super.dispose();
  }

  void _reportZoom() =>
      widget.onZoomChanged(_transform.value.getMaxScaleOnAxis() > 1.02);

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    if (item.isAudio) {
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: SizedBox(height: 112, child: AudioPlayerTile(item: item)),
        ),
      );
    }
    if (item.isVideo) return _ViewerVideo(url: item.url);

    final picture = CachedNetworkImage(
      imageUrl: item.url,
      fit: BoxFit.contain,
      placeholder: (context, url) => const Center(
        child: SizedBox.square(
          dimension: 30,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: BrandColors.kenteGold,
          ),
        ),
      ),
      errorWidget: (context, url, error) => const Center(
        child: Icon(
          Icons.image_not_supported_outlined,
          color: Colors.white38,
          size: 42,
        ),
      ),
    );

    return InteractiveViewer(
      transformationController: _transform,
      minScale: 1,
      maxScale: 4,
      child: Center(
        child: widget.heroTag == null
            ? picture
            : Hero(tag: widget.heroTag!, child: picture),
      ),
    );
  }
}

/// The full-screen player: the whole clip, with the sound the feed withheld.
class _ViewerVideo extends ConsumerStatefulWidget {
  const _ViewerVideo({required this.url});

  final String url;

  @override
  ConsumerState<_ViewerVideo> createState() => _ViewerVideoState();
}

class _ViewerVideoState extends ConsumerState<_ViewerVideo> {
  VideoPlayerController? _controller;
  var _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_open());
  }

  Future<void> _open() async {
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(ref.read(videoMutedProvider) ? 0 : 1);
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
    unawaited(_controller?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<bool>(videoMutedProvider, (_, muted) {
      unawaited(_controller?.setVolume(muted ? 0 : 1));
    });
    final muted = ref.watch(videoMutedProvider);

    if (_failed) {
      return const Center(
        child: Text(
          'This clip could not be played.',
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
            child: Stack(
              fit: StackFit.expand,
              children: [
                VideoPlayer(controller),
                Positioned(
                  right: 12,
                  bottom: 12,
                  child: ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: controller,
                    builder: (context, value, _) => Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _ViewerVideoButton(
                          icon: value.isPlaying
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          tooltip: value.isPlaying ? 'Pause' : 'Play',
                          onTap: () => value.isPlaying
                              ? controller.pause()
                              : controller.play(),
                        ),
                        const SizedBox(width: 8),
                        _ViewerVideoButton(
                          icon: muted
                              ? Icons.volume_off_rounded
                              : Icons.volume_up_rounded,
                          tooltip: muted ? 'Sound off' : 'Sound on',
                          onTap: () => unawaited(
                            ref.read(videoMutedProvider.notifier).toggle(),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
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

class _ViewerVideoButton extends StatelessWidget {
  const _ViewerVideoButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(
          color: Color(0x8C000000),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    ),
  );
}

/// The counter, the way out and the post's own actions, floated over the
/// picture and taken away the moment somebody wants to look at it properly.
class _ViewerChrome extends StatelessWidget {
  const _ViewerChrome({
    required this.visible,
    required this.index,
    required this.count,
    required this.liked,
    required this.likeCount,
    required this.replyCount,
    required this.onLike,
    required this.onReply,
    required this.onShare,
  });

  final bool visible;
  final int index;
  final int count;
  final bool liked;
  final int likeCount;
  final int replyCount;
  final VoidCallback? onLike;
  final VoidCallback? onReply;
  final VoidCallback? onShare;

  @override
  Widget build(BuildContext context) {
    final padding = MediaQuery.paddingOf(context);
    return IgnorePointer(
      ignoring: !visible,
      child: AnimatedOpacity(
        opacity: visible ? 1 : 0,
        duration: const Duration(milliseconds: 180),
        child: Stack(
          children: [
            Positioned(
              top: padding.top + 6,
              left: 6,
              right: 6,
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).maybePop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  Expanded(
                    child: Center(
                      child: count > 1
                          ? MediaPill(label: '${index + 1} of $count')
                          : const SizedBox.shrink(),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
            if (onLike != null)
              Positioned(
                left: 0,
                right: 0,
                bottom: padding.bottom + 10,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _ViewerAction(
                      icon: liked
                          ? Icons.favorite_rounded
                          : Icons.favorite_border_rounded,
                      tooltip: liked ? 'Appreciated' : 'Appreciate',
                      label: likeCount > 0
                          ? communityCountLabel(likeCount)
                          : '',
                      tint: liked ? const Color(0xFFE0563C) : Colors.white,
                      onTap: onLike,
                    ),
                    _ViewerAction(
                      icon: Icons.mode_comment_outlined,
                      tooltip: 'Reply',
                      label: replyCount > 0
                          ? communityCountLabel(replyCount)
                          : '',
                      tint: Colors.white,
                      onTap: onReply,
                    ),
                    _ViewerAction(
                      icon: Icons.ios_share_rounded,
                      tooltip: 'Share',
                      label: '',
                      tint: Colors.white,
                      onTap: onShare,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ViewerAction extends StatelessWidget {
  const _ViewerAction({
    required this.icon,
    required this.tooltip,
    required this.label,
    required this.tint,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final String label;
  final Color tint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: InkResponse(
      radius: 26,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: onTap == null ? Colors.white38 : tint, size: 24),
            if (label.isNotEmpty) ...[
              const SizedBox(width: 7),
              Text(
                label,
                style: TextStyle(
                  color: tint,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    ),
  );
}
