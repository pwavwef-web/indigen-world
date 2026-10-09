import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/widgets/download_toggle.dart';
import 'package:indigen_world_mobile/features/music/artist_screen.dart';
import 'package:indigen_world_mobile/features/music/music_bar_placement.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_library.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_tint.dart';
import 'package:indigen_world_mobile/features/music/widgets/audio_artwork.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_bubble.dart';
import 'package:indigen_world_mobile/features/music/widgets/music_scrubber.dart';
import 'package:indigen_world_mobile/features/music/widgets/now_playing_backdrop.dart';
import 'package:indigen_world_mobile/shared/motion.dart';
import 'package:indigen_world_mobile/shared/reveal_route.dart';

/// Where the now-playing screen grows from: the bar, or the bubble when the
/// player is minimised.
///
/// Computed rather than measured. The player lives above the Navigator, where
/// no `Hero` can reach and no route's context can find its render box — but
/// `MusicBubbleBounds` is the arithmetic the dock itself is laid out by, so it
/// already knows to the pixel where the bar or the bubble is.
Rect nowPlayingOrigin(BuildContext context) {
  final placement = ProviderScope.containerOf(
    context,
    listen: false,
  ).read(musicBarPlacementProvider);
  final bounds = MusicBubbleBounds(
    box: MediaQuery.sizeOf(context),
    safeTop: MediaQuery.viewPaddingOf(context).top,
    safeBottom: MediaQuery.viewPaddingOf(context).bottom,
  );
  return placement.collapsed ? bounds.rectFor(placement.dock) : bounds.barRect;
}

/// The song, full screen.
///
/// Everything on it reads from the handler rather than from local state, so the
/// screen agrees with the notification and the lock screen without either
/// having to tell it anything. The exceptions are gestures in progress — a
/// finger on the seek bar, on the artwork, pulling the page down — which own
/// their own few pixels until they let go.
///
/// ── How it arrives and leaves ─────────────────────────────────────────────
/// It grows out of the mini-player (see the `/now-playing` route) and, while it
/// is up, the mini-player hides: the bar has become this page, and drawing both
/// was the same song and the same buttons twice. Pull it down and it follows
/// the finger; let go far enough and it folds back into the bar.
///
/// ── What moves ────────────────────────────────────────────────────────────
/// The colour is the song's, taken from its artwork. The artwork sits forward
/// while the song plays and eases back when it is paused. Swipe it sideways to
/// change song. A glow breathes behind it — only while it plays.
class NowPlayingScreen extends ConsumerStatefulWidget {
  const NowPlayingScreen({super.key});

  @override
  ConsumerState<NowPlayingScreen> createState() => _NowPlayingScreenState();
}

class _NowPlayingScreenState extends ConsumerState<NowPlayingScreen>
    with SingleTickerProviderStateMixin {
  /// How far the page has been pulled down.
  double _pull = 0;

  /// Which way the last change of song went: +1 forward, -1 back. Read by the
  /// artwork and the title so the new one arrives from the side it came from.
  int _direction = 1;

  late final AnimationController _settle = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
  )..addListener(_onSettle);
  double _settleFrom = 0;

  NowPlayingOpenCount? _openCount;
  var _counted = false;
  Animation<double>? _routeAnimation;

  static const _dismissAt = 120.0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_counted) {
      _counted = true;
      final count = ref.read(nowPlayingOpenProvider.notifier);
      _openCount = count;
      // Not during this build: telling the overlay changes a provider it is
      // watching, and a provider cannot change while the tree is building.
      scheduleMicrotask(count.enter);
    }
    final animation = ModalRoute.of(context)?.animation;
    if (!identical(animation, _routeAnimation)) {
      _routeAnimation?.removeStatusListener(_onRouteStatus);
      _routeAnimation = animation?..addStatusListener(_onRouteStatus);
    }
  }

  void _onRouteStatus(AnimationStatus status) {
    // The bar comes back once the page has finished folding into its place,
    // not as it starts to — a bar drawn over a page still shrinking towards it
    // would be the two players on screen at once again.
    if (status == AnimationStatus.dismissed) _release();
  }

  void _release() {
    if (!_counted) return;
    _counted = false;
    final count = _openCount;
    if (count != null) scheduleMicrotask(count.leave);
  }

  @override
  void dispose() {
    _routeAnimation?.removeStatusListener(_onRouteStatus);
    _release();
    _settle.dispose();
    super.dispose();
  }

  void _onSettle() {
    setState(
      () => _pull = _settleFrom * (1 - AppMotion.land.transform(_settle.value)),
    );
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0) return false;
    if (notification is OverscrollNotification &&
        notification.dragDetails != null &&
        notification.overscroll < 0) {
      _settle.stop();
      setState(() => _pull += -notification.overscroll);
    } else if (notification is ScrollUpdateNotification &&
        notification.dragDetails != null &&
        _pull > 0 &&
        (notification.scrollDelta ?? 0) > 0) {
      setState(() => _pull = math.max(0, _pull - notification.scrollDelta!));
    } else if (notification is ScrollEndNotification && _pull > 0) {
      final flung =
          (notification.dragDetails?.primaryVelocity ?? 0) > 700 && _pull > 40;
      if (_pull > _dismissAt || flung) {
        HapticFeedback.lightImpact();
        Navigator.of(context).maybePop();
      } else if (!motionAllowed(context)) {
        setState(() => _pull = 0);
      } else {
        _settleFrom = _pull;
        _settle.forward(from: 0);
      }
    }
    return false;
  }

  void _skip(int direction) {
    setState(() => _direction = direction);
    final controller = ref.read(musicControllerProvider.notifier);
    direction > 0 ? controller.next() : controller.previous();
  }

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final item = ref.watch(musicMediaItemProvider).asData?.value;
    if (item == null) {
      return Scaffold(
        backgroundColor: brand.background,
        appBar: AppBar(title: const Text('Now playing')),
        body: const _NothingCued(),
      );
    }

    final playing = ref.watch(musicIsPlayingProvider);
    final kind = ref.watch(musicControllerProvider).queueKind;
    final art = item.artUri?.toString();
    final fallback = musicTintForText(
      Color.lerp(
        brand.heroMid,
        musicChannelColor(brand, kind ?? CollectionKind.music),
        0.4,
      )!,
    );
    final tint = brand.isBlack
        ? brand.background
        : watchMusicTint(ref, art) ?? fallback;
    final media = MediaQuery.of(context);
    final artSize = math
        .min(media.size.width - 56, media.size.height * 0.4)
        .clamp(160.0, 440.0);
    final pulled = (_pull / 420).clamp(0.0, 1.0);

    return AnimatedTint(
      color: tint,
      builder: (context, color) => Transform.translate(
        offset: Offset(0, _pull),
        child: Transform.scale(
          scale: 1 - pulled * 0.08,
          alignment: Alignment.topCenter,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(lerpDouble(0, 32, pulled)!),
            child: Scaffold(
              backgroundColor: color,
              body: Stack(
                children: [
                  Positioned.fill(
                    child: NowPlayingBackdrop(
                      artworkUrl: art,
                      tint: color,
                      playing: playing,
                    ),
                  ),
                  SafeArea(
                    bottom: false,
                    child: NotificationListener<ScrollNotification>(
                      onNotification: _onScroll,
                      child: ScrollConfiguration(
                        behavior: ScrollConfiguration.of(context)
                            .copyWith(overscroll: false),
                        child: ListView(
                          physics: const ClampingScrollPhysics(
                            parent: AlwaysScrollableScrollPhysics(),
                          ),
                          // `viewPadding`, not `padding`: the overlay keeps the
                          // bar's room in `padding` while the bar is hidden
                          // under this page, and this page has no bar to clear.
                          padding: EdgeInsets.fromLTRB(
                            24,
                            0,
                            24,
                            media.viewPadding.bottom + 28,
                          ),
                          children: [
                            _TopBar(item: item, kind: kind),
                            const SizedBox(height: 14),
                            Center(
                              child: _ArtworkDeck(
                                item: item,
                                playing: playing,
                                size: artSize,
                                arriveFrom: _direction,
                                onSkip: _skip,
                              ),
                            ),
                            const SizedBox(height: 30),
                            _TitleBlock(item: item, direction: _direction),
                            const SizedBox(height: 20),
                            MusicScrubber(duration: item.duration),
                            const SizedBox(height: 4),
                            _Transport(tint: color, onSkip: _skip),
                            const SizedBox(height: 26),
                            _WordsCard(item: item, tint: color),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NothingCued extends StatelessWidget {
  const _NothingCued();

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Text(
        'Nothing is playing yet. Open Music in the Collection and choose '
        'something.',
        textAlign: TextAlign.center,
        style: TextStyle(color: context.brand.mutedInk),
      ),
    ),
  );
}

/// Close, where this is playing from, and the two things to do with it.
class _TopBar extends ConsumerWidget {
  const _TopBar({required this.item, required this.kind});

  final MediaItem item;
  final CollectionKind? kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final brand = context.brand;
    return SizedBox(
      height: 56,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Close',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(
              Icons.keyboard_arrow_down_rounded,
              color: Colors.white,
              size: 30,
            ),
          ),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  'PLAYING FROM',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.7),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  item.album ?? kind?.label ?? 'Music',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          // The download control is shared with the rest of the app, where it
          // is drawn in the page's accent. Over the song's own colour that
          // accent can vanish, so here the accent is white.
          Theme(
            data: theme.copyWith(
              iconTheme: const IconThemeData(color: Colors.white),
              extensions: [brand.copyWith(accent: Colors.white)],
            ),
            child: IconTheme(
              data: const IconThemeData(color: Colors.white),
              child: DownloadToggle(
                item: item,
                // The collection this queue was built from, which the media
                // session itself has no idea about — see [MusicSessionState].
                kind: kind,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Up next',
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              sheetAnimationStyle: AnimationStyle(
                duration: motionOr(context, AppMotion.standard),
                reverseDuration: motionOr(context, AppMotion.quick),
              ),
              isScrollControlled: true,
              backgroundColor: brand.surfaceElevated,
              showDragHandle: true,
              builder: (context) => const _QueueSheet(),
            ),
            icon: const Icon(Icons.queue_music_rounded, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

/// The artwork: forward while it plays, back while it waits, and a card you
/// can throw sideways to change song.
class _ArtworkDeck extends StatefulWidget {
  const _ArtworkDeck({
    required this.item,
    required this.playing,
    required this.size,
    required this.arriveFrom,
    required this.onSkip,
  });

  final MediaItem item;
  final bool playing;
  final double size;

  /// The side the next artwork arrives from when the song changes for a
  /// reason other than a swipe here — a button, the end of the last song.
  final int arriveFrom;

  final ValueChanged<int> onSkip;

  @override
  State<_ArtworkDeck> createState() => _ArtworkDeckState();
}

enum _DeckPhase { resting, dragging, leaving, waiting, arriving }

class _ArtworkDeckState extends State<_ArtworkDeck>
    with SingleTickerProviderStateMixin {
  late final AnimationController _move = AnimationController(vsync: this)
    ..addListener(_tick)
    ..addStatusListener(_done);

  double _dx = 0;
  double _from = 0;
  double _to = 0;
  Curve _curve = Curves.linear;
  var _phase = _DeckPhase.resting;

  /// The direction of a swipe still waiting for its song to change.
  int _pending = 0;

  double get _offstage => widget.size * 1.35;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!motionAllowed(context)) {
      final skip = _phase == _DeckPhase.leaving ? _pending : 0;
      _move.stop();
      _dx = 0;
      _pending = 0;
      _phase = _DeckPhase.resting;
      if (skip != 0) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) widget.onSkip(skip);
        });
      }
    }
  }

  @override
  void didUpdateWidget(covariant _ArtworkDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.item.id == widget.item.id) return;
    // A new song: its artwork comes in from the side the change points to.
    final side = _pending != 0 ? _pending : widget.arriveFrom;
    _pending = 0;
    if (!motionAllowed(context)) {
      setState(() => _dx = 0);
      return;
    }
    _run(
      from: side * _offstage * 0.8,
      to: 0,
      duration: AppMotion.emphasized,
      curve: AppMotion.arrive,
      phase: _DeckPhase.arriving,
    );
  }

  @override
  void dispose() {
    _move.dispose();
    super.dispose();
  }

  void _run({
    required double from,
    required double to,
    required Duration duration,
    required Curve curve,
    required _DeckPhase phase,
  }) {
    _from = from;
    _to = to;
    _curve = curve;
    _phase = phase;
    _move
      ..duration = duration
      ..forward(from: 0);
    _tick();
  }

  void _tick() {
    if (_phase == _DeckPhase.waiting) return;
    setState(
      () => _dx = lerpDouble(_from, _to, _curve.transform(_move.value))!,
    );
  }

  void _done(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    switch (_phase) {
      case _DeckPhase.leaving:
        // Off the edge: now ask for the song, and wait for it to arrive.
        widget.onSkip(_pending);
        _phase = _DeckPhase.waiting;
        _move
          ..duration = const Duration(milliseconds: 900)
          ..forward(from: 0);
      case _DeckPhase.waiting:
        // Nothing came — the end of the queue with repeat off. The same
        // artwork comes back from the side it left by.
        final side = -_pending;
        _pending = 0;
        _run(
          from: side * _offstage,
          to: 0,
          duration: AppMotion.emphasized,
          curve: AppMotion.arrive,
          phase: _DeckPhase.arriving,
        );
      case _DeckPhase.arriving:
      case _DeckPhase.dragging:
      case _DeckPhase.resting:
        _phase = _DeckPhase.resting;
    }
  }

  void _dragStart(DragStartDetails _) {
    if (_phase == _DeckPhase.leaving || _phase == _DeckPhase.waiting) return;
    _move.stop();
    _phase = _DeckPhase.dragging;
  }

  void _dragUpdate(DragUpdateDetails details) {
    if (_phase != _DeckPhase.dragging) return;
    setState(() => _dx += details.delta.dx);
  }

  void _dragEnd(DragEndDetails details) {
    if (_phase != _DeckPhase.dragging) return;
    final velocity = details.primaryVelocity ?? 0;
    final far = _dx.abs() > widget.size * 0.28;
    final flung = velocity.abs() > 800;
    if (!motionAllowed(context)) {
      final direction = (flung ? velocity : _dx) < 0 ? 1 : -1;
      setState(() {
        _dx = 0;
        _pending = 0;
        _phase = _DeckPhase.resting;
      });
      if (far || flung) widget.onSkip(direction);
      return;
    }
    if (far || flung) {
      // Thrown left means "the next one"; thrown right, "the one before".
      final direction = (flung ? velocity : _dx) < 0 ? 1 : -1;
      _pending = direction;
      HapticFeedback.selectionClick();
      _run(
        from: _dx,
        to: -direction * _offstage,
        duration: AppMotion.quick,
        curve: Curves.easeIn,
        phase: _DeckPhase.leaving,
      );
    } else {
      _run(
        from: _dx,
        to: 0,
        duration: AppMotion.emphasized,
        curve: AppMotion.arrive,
        phase: _DeckPhase.arriving,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    final away = (_dx.abs() / _offstage).clamp(0.0, 1.0);
    final art = widget.item.artUri?.toString();
    final decode = (size * MediaQuery.devicePixelRatioOf(context)).round();

    final fallback = DecoratedBox(
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12)),
      child: const Center(
        child: Icon(Icons.graphic_eq_rounded, size: 72, color: Colors.white70),
      ),
    );

    return Semantics(
      image: true,
      label: 'Artwork for ${widget.item.title}. Swipe to change song.',
      child: GestureDetector(
        onHorizontalDragStart: _dragStart,
        onHorizontalDragUpdate: _dragUpdate,
        onHorizontalDragEnd: _dragEnd,
        child: Transform.translate(
          offset: Offset(_dx, 0),
          child: Transform.rotate(
            angle: (_dx / _offstage) * 0.14,
            child: Opacity(
              opacity: 1 - away * 0.55,
              child: AnimatedScale(
                // Forward while it plays, back while it waits — the one
                // movement on this screen that says, at a glance from across
                // a room, whether the song is going.
                scale: widget.playing ? 1 : 0.86,
                duration: motionOr(context, AppMotion.emphasized),
                curve: AppMotion.land,
                child: Container(
                  width: size,
                  height: size,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(
                          alpha: widget.playing ? 0.45 : 0.25,
                        ),
                        blurRadius: widget.playing ? 40 : 22,
                        offset: Offset(0, widget.playing ? 18 : 10),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: art == null || art.isEmpty
                        ? fallback
                        : AudioArtwork(
                            imageUrl: art,
                            fit: BoxFit.cover,
                            memCacheWidth: decode,
                            fadeInDuration: const Duration(milliseconds: 250),
                            placeholder: (_, _) => fallback,
                            errorWidget: (_, _, _) => fallback,
                          ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The title and the name under it, sliding in from the side the song
/// changed towards.
class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.item, required this.direction});

  final MediaItem item;
  final int direction;

  @override
  Widget build(BuildContext context) {
    final currentKey = ValueKey(item.id);
    return AnimatedSwitcher(
      duration: motionOr(context, AppMotion.standard),
      switchInCurve: AppMotion.arrive,
      switchOutCurve: Curves.easeIn,
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.centerLeft,
        children: [...previous, ?current],
      ),
      transitionBuilder: (child, animation) {
        final incoming = child.key == currentKey;
        final offset = Tween<Offset>(
          begin: Offset((incoming ? 0.25 : -0.25) * direction, 0),
          end: Offset.zero,
        ).animate(animation);
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: offset, child: child),
        );
      },
      child: Column(
        key: currentKey,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              height: 1.1,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
          if (item.artist case final artist? when artist.isNotEmpty) ...[
            const SizedBox(height: 6),
            _ArtistLine(name: artist),
          ],
        ],
      ),
    );
  }
}

/// The name under the title, and the way to everything else they made.
///
/// ── Why it is matched by name ─────────────────────────────────────────────
/// A [MediaItem] carries an artist *line*, not an artist *id* — it is built for
/// a lock screen, and everything on it has to survive the trip to the platform
/// side and back. The account id lives on the publication record, so the line
/// is matched against the artists of the collection this queue came from.
///
/// When that lookup finds nothing — a queue cued from a collection that has
/// since moved on, or a record with no name at all — the line simply stays a
/// line. A name that does nothing when tapped is better than a name that
/// promises a page and opens an error.
class _ArtistLine extends ConsumerWidget {
  const _ArtistLine({required this.name});

  final String name;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kind = ref.watch(musicControllerProvider).queueKind;
    final needle = normaliseMusicText(name);
    MusicArtist? match;
    if (kind != null) {
      for (final artist in ref.watch(musicArtistsProvider(kind))) {
        if (normaliseMusicText(artist.name) == needle) {
          match = artist;
          break;
        }
      }
    }

    final line = Text(
      name,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        color: Colors.white.withValues(alpha: 0.82),
        fontSize: 16,
        fontWeight: FontWeight.w700,
      ),
    );
    if (match == null || kind == null) return line;

    final artist = match;
    return Semantics(
      button: true,
      label: 'Open $name',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(6),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (context) =>
                MusicArtistScreen(artistId: artist.id, kind: kind),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(child: line),
            const SizedBox(width: 2),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: Colors.white.withValues(alpha: 0.82),
            ),
          ],
        ),
      ),
    );
  }
}

class _Transport extends ConsumerWidget {
  const _Transport({required this.tint, required this.onSkip});

  final Color tint;
  final ValueChanged<int> onSkip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playing = ref.watch(musicIsPlayingProvider);
    final playback = ref.watch(musicPlaybackStateProvider).asData?.value;
    final controller = ref.read(musicControllerProvider.notifier);
    final shuffling = playback?.shuffleMode == AudioServiceShuffleMode.all;
    final repeat = playback?.repeatMode ?? AudioServiceRepeatMode.none;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _ModeButton(
          icon: Icons.shuffle_rounded,
          active: shuffling,
          tooltip: shuffling ? 'Shuffle on' : 'Shuffle off',
          onPressed: controller.toggleShuffle,
        ),
        _NudgeButton(
          icon: Icons.skip_previous_rounded,
          tooltip: 'Previous',
          direction: -1,
          onPressed: () => onSkip(-1),
        ),
        _PlayPauseDisc(
          playing: playing,
          tint: tint,
          onPressed: playing ? controller.pause : controller.play,
        ),
        _NudgeButton(
          icon: Icons.skip_next_rounded,
          tooltip: 'Next',
          direction: 1,
          onPressed: () => onSkip(1),
        ),
        _ModeButton(
          icon: repeat == AudioServiceRepeatMode.one
              ? Icons.repeat_one_rounded
              : Icons.repeat_rounded,
          active: repeat != AudioServiceRepeatMode.none,
          tooltip: switch (repeat) {
            AudioServiceRepeatMode.one => 'Repeat this song',
            AudioServiceRepeatMode.none => 'Repeat off',
            _ => 'Repeat all',
          },
          onPressed: controller.cycleRepeat,
        ),
      ],
    );
  }
}

/// Shuffle and repeat: an icon, and a dot under it that grows when it is on.
class _ModeButton extends StatelessWidget {
  const _ModeButton({
    required this.icon,
    required this.active,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final bool active;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton(
        onPressed: onPressed,
        tooltip: tooltip,
        icon: AnimatedSwitcher(
          duration: motionOr(context, AppMotion.standard),
          transitionBuilder: (child, animation) =>
              RotationTransition(turns: animation, child: child),
          child: Icon(
            icon,
            key: ValueKey(icon),
            color: active ? Colors.white : Colors.white.withValues(alpha: 0.5),
          ),
        ),
      ),
      AnimatedContainer(
        duration: motionOr(context, AppMotion.standard),
        curve: AppMotion.land,
        width: active ? 5 : 0,
        height: active ? 5 : 0,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
      ),
    ],
  );
}

/// Previous and next: a nudge in their own direction when pressed, as if the
/// button had pushed the song along.
class _NudgeButton extends StatefulWidget {
  const _NudgeButton({
    required this.icon,
    required this.tooltip,
    required this.direction,
    required this.onPressed,
  });

  final IconData icon;
  final String tooltip;
  final int direction;
  final VoidCallback onPressed;

  @override
  State<_NudgeButton> createState() => _NudgeButtonState();
}

class _NudgeButtonState extends State<_NudgeButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _nudge = AnimationController(
    vsync: this,
    duration: motionOr(context, AppMotion.standard),
  );

  @override
  void dispose() {
    _nudge.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: widget.tooltip,
    iconSize: 42,
    onPressed: () {
      if (motionAllowed(context)) _nudge.forward(from: 0);
      widget.onPressed();
    },
    icon: AnimatedBuilder(
      animation: _nudge,
      builder: (context, child) => Transform.translate(
        offset: Offset(
          widget.direction * 9 * math.sin(math.pi * _nudge.value),
          0,
        ),
        child: child,
      ),
      child: Icon(widget.icon, color: Colors.white),
    ),
  );
}

/// The big one: play and pause morphing into each other inside a white disc.
class _PlayPauseDisc extends StatefulWidget {
  const _PlayPauseDisc({
    required this.playing,
    required this.tint,
    required this.onPressed,
  });

  final bool playing;
  final Color tint;
  final VoidCallback onPressed;

  @override
  State<_PlayPauseDisc> createState() => _PlayPauseDiscState();
}

class _PlayPauseDiscState extends State<_PlayPauseDisc>
    with SingleTickerProviderStateMixin {
  late final AnimationController _morph = AnimationController(
    vsync: this,
    duration: AppMotion.standard,
    value: widget.playing ? 1 : 0,
  );

  @override
  void didUpdateWidget(covariant _PlayPauseDisc oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.playing == widget.playing) return;
    if (motionAllowed(context)) {
      widget.playing ? _morph.forward() : _morph.reverse();
    } else {
      _morph.value = widget.playing ? 1 : 0;
    }
  }

  @override
  void dispose() {
    _morph.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PressScale(
    pressed: 0.9,
    child: IconButton(
      tooltip: widget.playing ? 'Pause' : 'Play',
      onPressed: widget.onPressed,
      style: IconButton.styleFrom(
        backgroundColor: Colors.white,
        fixedSize: const Size.square(78),
        elevation: 8,
        shadowColor: Colors.black.withValues(alpha: 0.5),
      ),
      icon: AnimatedIcon(
        icon: AnimatedIcons.play_pause,
        progress: _morph,
        size: 40,
        color: widget.tint,
      ),
    ),
  );
}

/// The words, where the archive recorded any, as a card that opens into a
/// large-type page to read along with.
///
/// A published song carries its lyrics or its transcript in `body`, which is
/// the same field the Collection detail screen reads. Showing it here is the
/// difference between a player and a player of *this* archive: a member
/// learning Kasem from a song needs the words in front of them while it plays.
class _WordsCard extends ConsumerWidget {
  const _WordsCard({required this.item, required this.tint});

  final MediaItem item;
  final Color tint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final body = ref.watch(musicTrackBodyProvider(item.id));
    if (body.isEmpty) return const SizedBox.shrink();
    return Semantics(
      button: true,
      label: 'Words. Opens them to read along.',
      child: PressScale(
        pressed: 0.97,
        child: Material(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.antiAlias,
          child: Builder(
            builder: (cardContext) => InkWell(
              onTap: () => Navigator.of(cardContext).push(
                RevealPageRoute<void>(
                  origin: globalRectOf(cardContext),
                  originRadius: 22,
                  originColor: Color.lerp(tint, Colors.black, 0.3),
                  builder: (context) => _ReadAlong(
                    title: item.title,
                    artist: item.artist,
                    body: body,
                    tint: tint,
                  ),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'WORDS',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75),
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.4,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          'Read along',
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.85),
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Icon(
                          Icons.open_in_full_rounded,
                          size: 16,
                          color: Colors.white.withValues(alpha: 0.85),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      body,
                      maxLines: 5,
                      overflow: TextOverflow.fade,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        height: 1.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The words at reading size, over the song's colour.
class _ReadAlong extends StatefulWidget {
  const _ReadAlong({
    required this.title,
    required this.artist,
    required this.body,
    required this.tint,
  });

  final String title;
  final String? artist;
  final String body;
  final Color tint;

  @override
  State<_ReadAlong> createState() => _ReadAlongState();
}

class _ReadAlongState extends State<_ReadAlong> {
  var _size = 24.0;

  @override
  Widget build(BuildContext context) {
    final ground = Color.lerp(widget.tint, Colors.black, 0.3)!;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: ground,
        appBar: AppBar(
          backgroundColor: ground,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          leading: IconButton(
            tooltip: 'Close',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.close_rounded),
          ),
          title: Text(
            widget.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          actions: [
            IconButton(
              tooltip: 'Smaller words',
              onPressed: _size <= 18 ? null : () => setState(() => _size -= 3),
              icon: const Icon(Icons.text_decrease_rounded),
            ),
            IconButton(
              tooltip: 'Larger words',
              onPressed: _size >= 36 ? null : () => setState(() => _size += 3),
              icon: const Icon(Icons.text_increase_rounded),
            ),
          ],
        ),
        body: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            26,
            12,
            26,
            MediaQuery.viewPaddingOf(context).bottom + 40,
          ),
          child: AnimatedDefaultTextStyle(
            duration: motionOr(context, AppMotion.standard),
            style: TextStyle(
              color: Colors.white,
              fontSize: _size,
              height: 1.55,
              fontWeight: FontWeight.w800,
            ),
            child: Text(widget.body),
          ),
        ),
      ),
    );
  }
}

/// What is playing after this one.
///
/// ── Why the sheet taps into the queue rather than the collection ──────────
/// Because the queue is the thing somebody is listening to. Re-cueing the
/// collection to play its fourth entry would throw away a shuffle order and
/// restart a sitting halfway through — see [MusicController.skipToQueueItem].
class _QueueSheet extends ConsumerWidget {
  const _QueueSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final queue = ref.watch(musicQueueProvider).asData?.value ?? const [];
    final current = ref.watch(musicMediaItemProvider).asData?.value;
    final playing = ref.watch(musicIsPlayingProvider);
    final controller = ref.read(musicControllerProvider.notifier);

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: EntranceGate(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(
                  'Up next',
                  style: TextStyle(
                    color: brand.ink,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: queue.length,
                  itemBuilder: (context, index) {
                    final entry = queue[index];
                    final isCurrent = entry.id == current?.id;
                    return Entrance(
                      index: index,
                      child: ListTile(
                        onTap: () {
                          Navigator.of(context).pop();
                          controller.skipToQueueItem(index);
                        },
                        tileColor: isCurrent ? brand.accentSoft : null,
                        leading: SizedBox(
                          width: 26,
                          child: Center(
                            child: isCurrent && playing
                                ? MusicEqualizer(
                                    color: brand.accent,
                                    size: const Size(16, 14),
                                  )
                                : Text(
                                    '${index + 1}',
                                    style: TextStyle(
                                      color: isCurrent
                                          ? brand.accent
                                          : brand.faintInk,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                          ),
                        ),
                        title: Text(
                          entry.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: isCurrent ? brand.accent : brand.ink,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        subtitle: entry.artist == null || entry.artist!.isEmpty
                            ? null
                            : Text(
                                entry.artist!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: brand.mutedInk,
                                  fontSize: 12.5,
                                ),
                              ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
