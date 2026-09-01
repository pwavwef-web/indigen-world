import 'package:audio_service/audio_service.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/downloads/widgets/download_toggle.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';

/// The song, full screen.
///
/// Everything on it reads from the handler rather than from local state, so the
/// screen agrees with the notification and the lock screen without either
/// having to tell it anything. The one exception is the scrubber while a finger
/// is on it — see [_Scrubber].
class NowPlayingScreen extends ConsumerWidget {
  const NowPlayingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final item = ref.watch(musicMediaItemProvider).asData?.value;

    return Scaffold(
      backgroundColor: brand.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(item?.album ?? 'Now playing'),
        actions: [
          if (item != null)
            DownloadToggle(
              item: item,
              // The collection this queue was built from, which the media
              // session itself has no idea about — see [MusicSessionState].
              kind: ref.watch(musicControllerProvider).queueKind,
            ),
        ],
      ),
      body: item == null
          ? const _NothingCued()
          : SafeArea(
              top: false,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                children: [
                  _Artwork(item: item),
                  const SizedBox(height: 26),
                  Text(
                    item.title,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  if (item.artist case final artist? when artist.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      artist,
                      style: TextStyle(
                        color: brand.success,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  _Scrubber(duration: item.duration),
                  const SizedBox(height: 6),
                  const _Transport(),
                  const SizedBox(height: 26),
                  _Lyrics(trackId: item.id),
                ],
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

class _Artwork extends StatelessWidget {
  const _Artwork({required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final brand = context.brand;
    final fallback = ColoredBox(
      color: brand.surfaceMuted,
      child: Center(
        child: Icon(
          Icons.graphic_eq_rounded,
          size: 64,
          color: brand.mutedInk,
        ),
      ),
    );
    final art = item.artUri?.toString();
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: AspectRatio(
        aspectRatio: 1,
        child: art == null || art.isEmpty
            ? fallback
            : CachedNetworkImage(
                imageUrl: art,
                fit: BoxFit.cover,
                placeholder: (_, _) => fallback,
                errorWidget: (_, _, _) => fallback,
              ),
      ),
    );
  }
}

/// The seek bar.
///
/// ── Why the drag is local state ────────────────────────────────────────────
/// The position stream ticks five times a second. Feeding it straight into the
/// slider's `value` while a finger is dragging means the stream keeps yanking
/// the thumb back to where playback actually is, and the two fight each other
/// all the way across the bar. So a drag takes the slider over entirely, and
/// only `onChangeEnd` tells the player where to go.
class _Scrubber extends ConsumerStatefulWidget {
  const _Scrubber({required this.duration});

  final Duration? duration;

  @override
  ConsumerState<_Scrubber> createState() => _ScrubberState();
}

class _ScrubberState extends ConsumerState<_Scrubber> {
  double? _dragging;

  @override
  Widget build(BuildContext context) {
    final total = widget.duration;
    final handler = ref.watch(musicAudioHandlerProvider);
    if (total == null || total <= Duration.zero) {
      // A duration arrives a moment after the header parses. Until then there
      // is nothing to scrub along, and a slider from zero to zero is a control
      // that lies about what it can do.
      return const SizedBox(height: 12);
    }

    return RepaintBoundary(
      child: StreamBuilder<Duration>(
        stream: handler == null ? const Stream.empty() : AudioService.position,
        initialData: Duration.zero,
        builder: (context, snapshot) {
          final elapsed = snapshot.data ?? Duration.zero;
          final maximum = total.inMilliseconds.toDouble();
          final value =
              _dragging ??
              elapsed.inMilliseconds.toDouble().clamp(0, maximum);
          return Column(
            children: [
              Slider(
                value: value.clamp(0, maximum),
                max: maximum,
                onChanged: (next) => setState(() => _dragging = next),
                onChangeEnd: (next) {
                  ref
                      .read(musicControllerProvider.notifier)
                      .seek(Duration(milliseconds: next.round()));
                  setState(() => _dragging = null);
                },
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      _clock(Duration(milliseconds: value.round())),
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 12,
                      ),
                    ),
                    Text(
                      _clock(total),
                      style: TextStyle(
                        color: context.brand.mutedInk,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

String _clock(Duration duration) {
  final minutes = duration.inMinutes;
  final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}

class _Transport extends ConsumerWidget {
  const _Transport();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = context.brand;
    final playing = ref.watch(musicIsPlayingProvider);
    final playback = ref.watch(musicPlaybackStateProvider).asData?.value;
    final controller = ref.read(musicControllerProvider.notifier);
    final shuffling =
        playback?.shuffleMode == AudioServiceShuffleMode.all;
    final repeat = playback?.repeatMode ?? AudioServiceRepeatMode.none;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        IconButton(
          onPressed: controller.toggleShuffle,
          tooltip: shuffling ? 'Shuffle on' : 'Shuffle off',
          icon: Icon(
            Icons.shuffle_rounded,
            color: shuffling ? brand.accent : brand.mutedInk,
          ),
        ),
        IconButton(
          onPressed: controller.previous,
          tooltip: 'Previous',
          iconSize: 34,
          icon: Icon(Icons.skip_previous_rounded, color: brand.ink),
        ),
        IconButton.filled(
          onPressed: playing ? controller.pause : controller.play,
          tooltip: playing ? 'Pause' : 'Play',
          iconSize: 38,
          icon: Icon(
            playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
          ),
        ),
        IconButton(
          onPressed: controller.next,
          tooltip: 'Next',
          iconSize: 34,
          icon: Icon(Icons.skip_next_rounded, color: brand.ink),
        ),
        IconButton(
          onPressed: controller.cycleRepeat,
          tooltip: switch (repeat) {
            AudioServiceRepeatMode.one => 'Repeat this song',
            AudioServiceRepeatMode.none => 'Repeat off',
            _ => 'Repeat all',
          },
          icon: Icon(
            repeat == AudioServiceRepeatMode.one
                ? Icons.repeat_one_rounded
                : Icons.repeat_rounded,
            color: repeat == AudioServiceRepeatMode.none
                ? brand.mutedInk
                : brand.accent,
          ),
        ),
      ],
    );
  }
}

/// The words, where the archive recorded any.
///
/// A published song carries its lyrics or its transcript in `body`, which is
/// the same field the Collection detail screen reads. Showing it here is the
/// difference between a player and a player of *this* archive: a member
/// learning Kasem from a song needs the words in front of them while it plays.
class _Lyrics extends ConsumerWidget {
  const _Lyrics({required this.trackId});

  final String trackId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final body = ref.watch(musicTrackBodyProvider(trackId));
    if (body.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'WORDS',
          style: TextStyle(
            color: context.brand.terracotta,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.1,
          ),
        ),
        const SizedBox(height: 8),
        Text(body, style: const TextStyle(height: 1.5)),
      ],
    );
  }
}
