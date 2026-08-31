import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_audio_handler.dart';

/// The one background audio handler, or null when there isn't one.
///
/// ── Why the default is null ───────────────────────────────────────────────
/// The handler is created by `AudioService.init` in `main()` and overridden
/// into the scope from there, exactly the way the database and the Firebase
/// readiness flag are. That means two things are true here and both are
/// load-bearing. `AudioService.init` can fail on a device — a refused
/// foreground service, a platform channel that never answers — and the app
/// must degrade to "no music player" rather than "no app", so main() omits the
/// override when it does. And every widget test in the suite builds a bare
/// `ProviderScope` with no override at all; a default that threw, or that
/// tried to touch a platform channel, would take hundreds of green tests down
/// with it.
///
/// So every consumer must handle null. That is not a caveat, it is the
/// contract.
final musicAudioHandlerProvider = Provider<IndigenAudioHandler?>((ref) => null);

/// The track playing right now, or null when nothing is cued.
final musicMediaItemProvider = StreamProvider<MediaItem?>((ref) {
  final handler = ref.watch(musicAudioHandlerProvider);
  if (handler == null) return Stream.value(null);
  return handler.mediaItem;
});

/// The whole queue, in the order it was cued.
final musicQueueProvider = StreamProvider<List<MediaItem>>((ref) {
  final handler = ref.watch(musicAudioHandlerProvider);
  if (handler == null) return Stream.value(const <MediaItem>[]);
  return handler.queue;
});

/// Playing / paused / buffering, plus shuffle and repeat.
///
/// Read shuffle and repeat from *here* rather than from anything the UI keeps
/// for itself: the notification's own buttons write into this same state, so a
/// screen that remembered its own copy would disagree with the lock screen the
/// first time somebody used the lock screen.
final musicPlaybackStateProvider = StreamProvider<PlaybackState>((ref) {
  final handler = ref.watch(musicAudioHandlerProvider);
  if (handler == null) return Stream.value(PlaybackState());
  return handler.playbackState;
});

/// The playhead, ticking up to five times a second.
///
/// ── The performance rule ──────────────────────────────────────────────────
/// This stream emits as often as every 200ms while a song plays. Exactly two
/// widgets in the app may consume it: the seek bar on the now-playing screen
/// and the progress line on the mini-player. Both must do so through a local
/// `StreamBuilder<Duration>` wrapped in a `RepaintBoundary`, never through
/// `ref.watch`.
///
/// The reason is what `ref.watch` means: it rebuilds the whole widget that
/// asked, and every child underneath it, five times a second, forever, while
/// somebody listens to an album. Nothing that has children may watch the
/// position — not the mini-player, not a screen, not a scaffold. A
/// `StreamBuilder` around the one painted line keeps the rebuild to the line,
/// and the `RepaintBoundary` keeps its repaint off the rest of the layer.
///
/// Everything else that wants to know about playback — is it playing, what is
/// playing, is there a queue — reads one of the other providers here, which
/// emit when something actually changes.
final musicPositionProvider = StreamProvider<Duration>((ref) {
  // `AudioService.position` is a static that builds itself on first touch and
  // reads through the initialised service. Not touching it at all when there
  // is no handler is what keeps this safe in tests.
  final handler = ref.watch(musicAudioHandlerProvider);
  if (handler == null) return Stream.value(Duration.zero);
  return AudioService.position;
});

/// Whether a song is playing. Cheap to watch anywhere: it emits on transitions,
/// not on every tick.
final musicIsPlayingProvider = Provider<bool>(
  (ref) => ref.watch(
    musicPlaybackStateProvider.select(
      (state) => state.asData?.value.playing ?? false,
    ),
  ),
);

/// Whether there is anything cued at all — the switch the mini-player lives or
/// dies by.
final musicHasQueueProvider = Provider<bool>(
  (ref) => ref.watch(
    musicQueueProvider.select(
      (queue) => queue.asData?.value.isNotEmpty ?? false,
    ),
  ),
);

/// The lyrics or transcript for a queued track, or `''`.
///
/// Looked up from the published collections rather than carried on the
/// [MediaItem], deliberately. A `MediaItem` crosses to the platform side and
/// back — a media button, a resumption request — and anything on it has to
/// survive that trip; a page of lyrics riding through the Android media session
/// on every track change would be paying that cost five times a sitting for
/// something only one screen ever reads.
final musicTrackBodyProvider = Provider.family<String, String>((ref, trackId) {
  for (final collection in [
    ref.watch(musicCollectionProvider),
    ref.watch(audiobookCollectionProvider),
  ]) {
    for (final item in collection.asData?.value ?? const <PublishedReel>[]) {
      if (item.id == trackId) return item.body.trim();
    }
  }
  return '';
});
