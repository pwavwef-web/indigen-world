import 'dart:async';
import 'dart:convert';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the last thing somebody listened to is written down.
const musicResumePreferenceKey = 'indigen_music_resume_v1';

/// The song a member left off on, read back at launch.
///
/// Only three things are kept, and deliberately not the queue: a queue is a
/// snapshot of a live Firestore collection and would be stale by morning, while
/// a track id, the collection it came from and a position are enough to put the
/// mini-player back exactly where it was once that collection loads again.
@immutable
class MusicResumePoint {
  const MusicResumePoint({
    required this.trackId,
    required this.kind,
    required this.position,
  });

  /// The published record id — [MusicTrack.id], not the media URL.
  final String trackId;

  /// Which collection the queue was built from, so the right stream is the one
  /// consulted to find the track again.
  final CollectionKind kind;

  final Duration position;
}

/// Everything about the music session that the audio handler does not own.
///
/// The handler owns what is *playing*: the queue, the current item, the
/// position, shuffle and repeat. It knows none of this, and none of this
/// belongs in a media session.
@immutable
class MusicSessionState {
  const MusicSessionState({
    this.queueKind,
    this.resumePoint,
    this.pausedForOtherAudio = false,
    this.error,
  });

  /// Which collection sourced the queue that is loaded now. Null before
  /// anything has been cued.
  final CollectionKind? queueKind;

  /// Where the last session left off, or null when there was none.
  final MusicResumePoint? resumePoint;

  /// True when *the app* paused the music to let something else be heard — a
  /// pronunciation, a voice note — rather than the member pausing it.
  ///
  /// The distinction is the whole point: music the app paused should come back
  /// on its own, and music a member paused must not. Set it with
  /// [MusicController.markPausedForOtherAudio] *after* calling
  /// [MusicController.pause], because pause clears it.
  final bool pausedForOtherAudio;

  /// The last thing that went wrong, for a one-line message on screen. Cleared
  /// by the next successful play.
  final String? error;

  MusicSessionState copyWith({
    CollectionKind? queueKind,
    MusicResumePoint? resumePoint,
    bool? pausedForOtherAudio,
    String? error,
    bool clearError = false,
    bool clearResumePoint = false,
  }) => MusicSessionState(
    queueKind: queueKind ?? this.queueKind,
    resumePoint: clearResumePoint ? null : (resumePoint ?? this.resumePoint),
    pausedForOtherAudio: pausedForOtherAudio ?? this.pausedForOtherAudio,
    error: clearError ? null : (error ?? this.error),
  );
}

/// A queue and the index within it that a tap actually meant.
@immutable
class MusicQueuePlan {
  const MusicQueuePlan({required this.tracks, required this.startIndex});

  final List<MusicTrack> tracks;
  final int startIndex;

  bool get isEmpty => tracks.isEmpty;
}

/// Turns a collection listing into a playable queue.
///
/// ── Why the index is re-found and not carried ─────────────────────────────
/// A collection listing is not a playlist. It contains records whose media is
/// still being processed and, in a music collection, the occasional record that
/// is not audio at all — and every one of those is dropped on the way into the
/// queue. Carrying the tapped index across that filter is the bug this function
/// exists to prevent: tap the fourth song in a list where the second has no
/// file yet, and index 3 of the filtered queue is the *fifth* song. So the
/// tapped record's id is taken first and looked up again afterwards.
///
/// If the tapped record was itself dropped — somebody tapped a poem sitting in
/// a music collection — the queue starts at the top. Playing from the beginning
/// is a comprehensible answer; playing whichever song happened to land at that
/// index is not.
MusicQueuePlan buildMusicQueue(
  List<PublishedReel> items, {
  required int startIndex,
  required CollectionKind kind,
  Map<String, String> offline = const <String, String>{},
}) {
  final tappedId = startIndex >= 0 && startIndex < items.length
      ? items[startIndex].id
      : null;

  final tracks = <MusicTrack>[];
  for (final item in items) {
    final track = MusicTrack.fromReel(item, kind: kind);
    if (track == null) continue;
    // A downloaded copy replaces the stream for that one entry and changes
    // nothing else about the queue. Substituting here rather than in the
    // handler keeps the rule in one place: the queue is built once, and
    // everything downstream — the notification, the resume point, the lyrics
    // lookup — still sees the same ids it always did.
    final local = offline[track.id];
    tracks.add(local == null ? track : track.withUrl(local));
  }
  if (tracks.isEmpty) {
    return const MusicQueuePlan(tracks: <MusicTrack>[], startIndex: 0);
  }

  final index = tappedId == null
      ? 0
      : tracks.indexWhere((track) => track.id == tappedId);
  return MusicQueuePlan(
    tracks: List.unmodifiable(tracks),
    startIndex: index < 0 ? 0 : index,
  );
}

/// Drives the music session: what to play, and what to remember about it.
///
/// Everything a member can do to playback goes through here rather than
/// through the handler directly, so that the two things the handler cannot know
/// — which collection this queue came from, and whether a pause was ours or
/// theirs — stay true.
final musicControllerProvider =
    NotifierProvider<MusicController, MusicSessionState>(MusicController.new);

class MusicController extends Notifier<MusicSessionState> {
  static const _noPlayerMessage = 'The music player is unavailable on this '
      'device.';

  AppLifecycleListener? _lifecycle;
  StreamSubscription<String>? _errors;

  @override
  MusicSessionState build() {
    final handler = ref.watch(musicAudioHandlerProvider);
    if (handler != null) {
      _errors = handler.errors.listen(
        (message) => state = state.copyWith(error: message),
      );
      // Registered only when there is a handler, which is also what keeps this
      // out of the widget tests: they build a scope with no override, so no
      // listener is attached to a binding they never asked for.
      _lifecycle = AppLifecycleListener(
        onStateChange: (lifecycle) {
          // Backgrounding is the last moment a position is knowable — the
          // process can be reclaimed at any point afterwards without another
          // callback.
          if (lifecycle == AppLifecycleState.paused) unawaited(_persist());
        },
      );
    }
    ref.onDispose(() {
      _lifecycle?.dispose();
      unawaited(_errors?.cancel());
    });

    unawaited(_restore());
    return const MusicSessionState();
  }

  /// Cues [items] and starts the record at [startIndex] playing.
  ///
  /// ── Why the queue is a snapshot ───────────────────────────────────────────
  /// [items] is read once, here, and never subscribed to. The collection
  /// providers are live Firestore streams, and re-writing the queue underneath
  /// a playing song every time somebody publishes anything is far worse than
  /// the thing it would fix: the running order would change mid-album, and a
  /// shuffle order would be thrown away. A queue entry that has since been
  /// unpublished simply 404s and is skipped — see the handler.
  Future<void> playCollection(
    List<PublishedReel> items, {
    required int startIndex,
    required CollectionKind kind,
  }) async {
    final plan = buildMusicQueue(
      items,
      startIndex: startIndex,
      kind: kind,
      offline: await _offlineUrls(),
    );
    if (plan.isEmpty) {
      state = state.copyWith(error: 'Nothing here can be played yet.');
      return;
    }

    final handler = ref.read(musicAudioHandlerProvider);
    if (handler == null) {
      state = state.copyWith(error: _noPlayerMessage);
      return;
    }

    state = state.copyWith(
      queueKind: kind,
      pausedForOtherAudio: false,
      clearError: true,
    );

    await handler.setPlaylist(
      [for (final track in plan.tracks) track.toMediaItem()],
      initialIndex: plan.startIndex,
      initialPosition: _resumePositionFor(plan.tracks[plan.startIndex].id),
    );
    await play();
  }

  /// Puts the last session back, paused, once [items] for its collection have
  /// arrived.
  ///
  /// Never plays. A phone that starts singing because it was unlocked is a
  /// phone somebody turns off; a mini-player sitting there with a play button
  /// is the thing that was actually wanted. Returns whether anything was cued.
  Future<bool> cueResumePoint(List<PublishedReel> items) async {
    final resume = state.resumePoint;
    final handler = ref.read(musicAudioHandlerProvider);
    if (resume == null || handler == null) return false;

    final index = items.indexWhere((item) => item.id == resume.trackId);
    if (index < 0) return false;

    final plan = buildMusicQueue(
      items,
      startIndex: index,
      kind: resume.kind,
      offline: await _offlineUrls(),
    );
    if (plan.isEmpty) return false;

    state = state.copyWith(queueKind: resume.kind, clearError: true);
    await handler.setPlaylist(
      [for (final track in plan.tracks) track.toMediaItem()],
      initialIndex: plan.startIndex,
      initialPosition: resume.position,
    );
    return true;
  }

  /// Downloaded copies, keyed by track id, or an empty map.
  ///
  /// Read through [offlineTrackUrlsLookupProvider] rather than from a stream,
  /// so that no part of the queue path depends on a stream having emitted
  /// first — a queue built a moment too early would silently stream a song the
  /// member had already paid for the data to download. That provider is also
  /// what keeps this off the database in a test scope.
  ///
  /// Failure is empty rather than fatal: an unreadable index means everything
  /// streams, which is what would have happened before downloads existed.
  Future<Map<String, String>> _offlineUrls() async {
    try {
      return await ref.read(offlineTrackUrlsLookupProvider)();
    } on Object catch (error) {
      debugPrint('Offline index unavailable: $error');
      return const <String, String>{};
    }
  }

  /// Starts or resumes playback.
  ///
  /// Clears the duck flag, because this is where a member-initiated resume
  /// arrives — including a resume that a later stage performs on their behalf.
  Future<void> play() async {
    state = state.copyWith(pausedForOtherAudio: false);
    await ref.read(musicAudioHandlerProvider)?.play();
  }

  /// Pauses, clears the duck flag, and writes down where we stopped.
  ///
  /// The flag is cleared here as well as in [play] because a member pausing is
  /// the clearest possible statement that the music should stay off. Anything
  /// that pauses *for* them must set the flag again afterwards — see
  /// [markPausedForOtherAudio].
  Future<void> pause() async {
    state = state.copyWith(pausedForOtherAudio: false);
    await ref.read(musicAudioHandlerProvider)?.pause();
    await _persist();
  }

  Future<void> next() async =>
      ref.read(musicAudioHandlerProvider)?.skipToNext();

  Future<void> previous() async =>
      ref.read(musicAudioHandlerProvider)?.skipToPrevious();

  Future<void> seek(Duration position) async =>
      ref.read(musicAudioHandlerProvider)?.seek(position);

  /// Shuffle on or off. The handler re-shuffles on the way on, so asking for it
  /// twice gives a different order the second time.
  Future<void> toggleShuffle() async {
    final handler = ref.read(musicAudioHandlerProvider);
    if (handler == null) return;
    final enabled =
        handler.playbackState.value.shuffleMode != AudioServiceShuffleMode.none;
    await handler.setShuffleMode(
      enabled ? AudioServiceShuffleMode.none : AudioServiceShuffleMode.all,
    );
  }

  /// Off → all → one → off, which is the order every player a member has ever
  /// used cycles in. Read back from the handler each time rather than counted
  /// here, so that a change made from the notification is where this starts.
  Future<void> cycleRepeat() async {
    final handler = ref.read(musicAudioHandlerProvider);
    if (handler == null) return;
    await handler.setRepeatMode(switch (handler.playbackState.value.repeatMode) {
      AudioServiceRepeatMode.none => AudioServiceRepeatMode.all,
      AudioServiceRepeatMode.all => AudioServiceRepeatMode.one,
      _ => AudioServiceRepeatMode.none,
    });
  }

  /// Records that the pause that just happened was the app's doing.
  ///
  /// Call it *after* [pause], never before: pause clears the flag on purpose,
  /// because that is the funnel a member's own pause arrives through.
  void markPausedForOtherAudio() =>
      state = state.copyWith(pausedForOtherAudio: true);

  /// Stands the music down so something else can be heard.
  ///
  /// Pause and never stop. `stop()` tears down the media session, the
  /// notification and the queue; a member who tapped a two-second pronunciation
  /// would come back to find the player gone and their place in the album lost.
  /// Pausing keeps all four and costs nothing.
  ///
  /// Returns whether it actually did anything, which is what the listener uses
  /// to decide there is something to come back to.
  Future<bool> duckForOtherAudio() async {
    if (!ref.read(musicIsPlayingProvider)) return false;
    await pause();
    markPausedForOtherAudio();
    return true;
  }

  /// Brings the music back, but only if this is the music we took away.
  ///
  /// ── Why the flag is checked and not just the pause state ──────────────────
  /// A member who pauses from the lock screen, opens a reel and closes it again
  /// must not be sung at. Their pause went through [pause], which clears the
  /// flag, so by the time we get here there is nothing to resume — and that is
  /// the difference between a player that respects a decision and one that
  /// argues with it.
  /// Returns whether it actually resumed, which is the only way a caller — or
  /// a test — can tell the difference between "brought the music back" and
  /// "correctly left a member's own pause alone".
  Future<bool> resumeAfterOtherAudio() async {
    if (!state.pausedForOtherAudio) return false;
    await play();
    return true;
  }

  /// Dismisses whatever message is on screen.
  void clearError() => state = state.copyWith(clearError: true);

  Duration _resumePositionFor(String trackId) {
    final resume = state.resumePoint;
    // Only ever offered to the track it was saved for. Dropping a stored
    // position into a different song would start it forty seconds in.
    return resume != null && resume.trackId == trackId
        ? resume.position
        : Duration.zero;
  }

  /// The same defensive read-write shape as the media switches in
  /// `core/media_preferences.dart`: a resume point is a convenience, and a
  /// storage failure loses the convenience rather than the session.
  Future<void> _persist() async {
    final handler = ref.read(musicAudioHandlerProvider);
    final item = handler?.mediaItem.value;
    final kind = state.queueKind;
    if (handler == null || item == null || kind == null) return;

    final position = handler.playbackState.value.position;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setString(
        musicResumePreferenceKey,
        jsonEncode({
          'trackId': item.id,
          'queueKind': kind.name,
          'positionMs': position.inMilliseconds,
        }),
      );
    } on Object {
      // Nothing is lost that the member can see this session.
    }
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getString(musicResumePreferenceKey);
      if (stored == null || stored.isEmpty) return;

      final decoded = jsonDecode(stored);
      if (decoded is! Map) return;
      final trackId = decoded['trackId'];
      final kindName = decoded['queueKind'];
      final positionMs = decoded['positionMs'];
      if (trackId is! String || trackId.isEmpty || kindName is! String) return;
      final kind = CollectionKind.values
          .where((value) => value.name == kindName)
          .firstOrNull;
      if (kind == null) return;

      // A member can tap a song before the disk read lands. What they are
      // listening to now wins — restoring over it would offer to resume
      // something they have already moved on from.
      if (state.queueKind != null) return;

      state = state.copyWith(
        resumePoint: MusicResumePoint(
          trackId: trackId,
          kind: kind,
          position: Duration(milliseconds: positionMs is int ? positionMs : 0),
        ),
      );
    } on Object {
      // A corrupt or unreadable blob means no resume point, which is exactly
      // the state a first launch is in.
    }
  }
}
