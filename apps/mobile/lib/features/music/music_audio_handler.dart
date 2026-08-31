import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:indigen_world_mobile/features/music/music_track.dart';
import 'package:just_audio/just_audio.dart';

/// The one player in the app that is allowed to outlive the screen it started
/// on.
///
/// ── Why audio_service and not just_audio_background ───────────────────────
/// `just_audio_background` is global by construction: it swaps the platform
/// implementation for *every* `AudioPlayer` in the process, requires a
/// `MediaItem` tag on every audio source, and hands the media session to
/// whichever player loaded most recently. Four places in this app build their
/// own bare `AudioPlayer` — voice-note tiles in the community feed (several
/// alive at once while somebody scrolls), dictionary pronunciations, the
/// contribution recorder and the review desk — so a two-second pronunciation
/// would replace the album on the lock screen and then tear the notification
/// down on its way out, with no per-player opt-out anywhere.
///
/// `audio_service` draws the line where it belongs: only the player inside this
/// handler joins the background session. Those four call sites needed no
/// changes at all.
class IndigenAudioHandler extends BaseAudioHandler
    with QueueHandler, SeekHandler {
  IndigenAudioHandler() {
    _player.playbackEventStream.listen(
      _broadcastState,
      onError: _onPlayerError,
    );
    _player.currentIndexStream.listen(_broadcastCurrentItem);
    _player.durationStream.listen(_patchDuration);
  }

  /// The notification channel the player posts on.
  ///
  /// Deliberately *not* `indigen_community_v2`. Channels in this app are
  /// per-purpose so that a member can mute one thing from system settings
  /// without losing another — see `notifications/local_alerts.dart`, which
  /// splits community activity, messages and account decisions for exactly
  /// that reason. A transport control strip is not community activity, and
  /// somebody who mutes likes and follows must not thereby lose their play
  /// button.
  static const notificationChannelId = 'world.indigen.mobile.audio';

  /// The human name of that channel, as it appears in Android settings.
  static const notificationChannelName = 'Music playback';

  final AudioPlayer _player = AudioPlayer();

  final StreamController<String> _errors = StreamController<String>.broadcast();

  /// Load failures worth telling somebody about — a song whose file has gone.
  /// Playback has already moved on by the time one of these arrives.
  Stream<String> get errors => _errors.stream;

  /// Set the first time music actually plays. See [_ensureSessionConfigured].
  bool _sessionConfigured = false;

  /// True when *we* paused for a phone call or another app, so that the end of
  /// the interruption should hand the song back. A member who paused during a
  /// call must not find their music playing again when it ends.
  bool _resumeAfterInterruption = false;

  /// Configures the process audio session, on the first play and never before.
  ///
  /// ── Why this is lazy ──────────────────────────────────────────────────────
  /// `audio_session` is a process singleton: one category, shared by every
  /// player in the app. Setting the iOS category to `.playback` at start-up
  /// would change how a dictionary pronunciation and a community voice note
  /// behave — they would keep playing with the phone on silent, and duck other
  /// apps — for every member, including the many who will never open the music
  /// screen at all. Configuring it here means the session becomes a music
  /// session at the moment the app actually becomes a music player.
  Future<void> _ensureSessionConfigured() async {
    if (_sessionConfigured) return;
    // Claimed before the first await: two taps in quick succession both reach
    // this line, and configuring twice would attach a second set of listeners.
    _sessionConfigured = true;

    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());

    // just_audio does none of this for you. Without it a song keeps playing
    // over a phone call, and keeps playing out loud into a room after the
    // earbuds are pulled out — which is the single most embarrassing bug an
    // audio app can ship.
    session.interruptionEventStream.listen((event) {
      if (event.begin) {
        // `unknown` means the interruption may never end, so nothing is owed a
        // resume. `pause` and `duck` are temporary and the song is handed back.
        _resumeAfterInterruption =
            _player.playing && event.type != AudioInterruptionType.unknown;
        if (_player.playing) unawaited(_player.pause());
      } else if (_resumeAfterInterruption) {
        _resumeAfterInterruption = false;
        unawaited(_player.play());
      }
    });
    session.becomingNoisyEventStream.listen((_) {
      _resumeAfterInterruption = false;
      unawaited(_player.pause());
    });
  }

  /// Replaces the queue with [items] and cues the one at [initialIndex].
  ///
  /// Nothing starts playing here — the caller decides that, because the same
  /// path is used to restore a paused mini-player on a cold launch as to start
  /// a song somebody just tapped.
  Future<void> setPlaylist(
    List<MediaItem> items, {
    int initialIndex = 0,
    Duration initialPosition = Duration.zero,
  }) async {
    if (items.isEmpty) {
      await _player.stop();
      queue.add(<MediaItem>[]);
      mediaItem.add(null);
      return;
    }

    final index = initialIndex.clamp(0, items.length - 1);
    // A growable copy on purpose: the QueueHandler mixin mutates this list in
    // place when anything is added to or removed from the queue, and an
    // unmodifiable one would throw the first time it did.
    queue.add(List<MediaItem>.of(items));
    mediaItem.add(items[index]);

    final sources = <AudioSource>[];
    for (final item in items) {
      final url = musicTrackUrlOf(item);
      if (url == null) continue;
      sources.add(AudioSource.uri(Uri.parse(url)));
    }

    try {
      await _player.setAudioSource(
        ConcatenatingAudioSource(children: sources),
        initialIndex: index,
        initialPosition: initialPosition,
      );
    } on Object catch (error) {
      _onPlayerError(error, StackTrace.current);
    }
  }

  /// Volume, between 0 and 1 — the seam a later stage ducks music through when
  /// something else in the app wants the speaker for a moment.
  Future<void> setVolume(double volume) => _player.setVolume(volume);

  @override
  Future<void> play() async {
    await _ensureSessionConfigured();
    // Not awaited, and this is the whole reason this method has a body rather
    // than being `=> _player.play()`. just_audio's `play()` completes when
    // playback *finishes*, not when it starts, so awaiting it would leave
    // every caller — the play button, the notification, a headset click —
    // hanging for the length of the song.
    unawaited(_player.play());
  }

  @override
  Future<void> pause() async {
    _resumeAfterInterruption = false;
    await _player.pause();
  }

  @override
  Future<void> stop() async {
    _resumeAfterInterruption = false;
    await _player.stop();
    await super.stop();
  }

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  /// Skips using the player rather than the [QueueHandler] mixin's arithmetic.
  ///
  /// The mixin adds one to the queue index, which is the wrong song the moment
  /// shuffle is on: the player has its own shuffled order and `seekToNext`
  /// follows it. Both directions are overridden so the notification's buttons
  /// and the on-screen ones cannot disagree.
  @override
  Future<void> skipToNext() => _player.seekToNext();

  @override
  Future<void> skipToPrevious() => _player.seekToPrevious();

  @override
  Future<void> skipToQueueItem(int index) async {
    final items = queue.value;
    if (index < 0 || index >= items.length) return;
    await _player.seek(Duration.zero, index: index);
  }

  /// Shuffle, mirrored into [playbackState] so the notification agrees with the
  /// screen. The re-shuffle on the way on is deliberate: turning shuffle on
  /// twice in one sitting should give a different order the second time.
  @override
  Future<void> setShuffleMode(AudioServiceShuffleMode shuffleMode) async {
    final enabled = shuffleMode != AudioServiceShuffleMode.none;
    if (enabled) await _player.shuffle();
    await _player.setShuffleModeEnabled(enabled);
    playbackState.add(playbackState.value.copyWith(shuffleMode: shuffleMode));
  }

  @override
  Future<void> setRepeatMode(AudioServiceRepeatMode repeatMode) async {
    await _player.setLoopMode(switch (repeatMode) {
      AudioServiceRepeatMode.none => LoopMode.off,
      AudioServiceRepeatMode.one => LoopMode.one,
      // `group` is unimplemented upstream and nothing here sends it; treating
      // it as "all" is the closest honest answer if a platform ever does.
      AudioServiceRepeatMode.all || AudioServiceRepeatMode.group => LoopMode.all,
    });
    playbackState.add(playbackState.value.copyWith(repeatMode: repeatMode));
  }

  /// Releases the player. Only ever called when the whole service is going
  /// away; the handler is a process-lifetime object.
  Future<void> dispose() async {
    await _player.dispose();
    await _errors.close();
  }

  void _broadcastState(PlaybackEvent event) {
    final playing = _player.playing;
    playbackState.add(
      playbackState.value.copyWith(
        controls: [
          MediaControl.skipToPrevious,
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.skipToNext,
        ],
        // Enables the scrubber in the notification and in Control Centre. It
        // only draws once the media item has a duration, which is why the
        // handler bothers to patch one in at all.
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
        },
        androidCompactActionIndices: const [0, 1, 2],
        processingState: switch (_player.processingState) {
          ProcessingState.idle => AudioProcessingState.idle,
          ProcessingState.loading => AudioProcessingState.loading,
          ProcessingState.buffering => AudioProcessingState.buffering,
          ProcessingState.ready => AudioProcessingState.ready,
          ProcessingState.completed => AudioProcessingState.completed,
        },
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: event.currentIndex,
      ),
    );
  }

  void _broadcastCurrentItem(int? index) {
    final items = queue.value;
    if (index == null || index < 0 || index >= items.length) return;
    mediaItem.add(items[index]);
  }

  /// Writes the real duration into the playing item once the header has parsed.
  ///
  /// This is the whole of the "no duration field on publishedContent" bargain:
  /// the number arrives a second after playback starts, from the file itself,
  /// and the seek bar and the notification scrubber pick it up from here.
  void _patchDuration(Duration? duration) {
    final index = _player.currentIndex;
    final items = queue.value;
    if (duration == null || index == null || index < 0 || index >= items.length) {
      return;
    }
    if (items[index].duration == duration) return;

    final patched = items[index].copyWith(duration: duration);
    queue.add(List<MediaItem>.of(items)..[index] = patched);
    if (mediaItem.value?.id == patched.id) mediaItem.add(patched);
  }

  /// A track that will not load — most often a song that was unpublished while
  /// it was still sitting in somebody's queue, whose URL now 404s.
  ///
  /// Skipping is the right answer rather than stalling: the member asked for a
  /// collection, not for that one file, and a player frozen on "buffering"
  /// with no explanation is the worst of the available outcomes. The walk
  /// terminates even if every remaining track is broken, because each failure
  /// advances the index and the last one has no next.
  void _onPlayerError(Object error, StackTrace stackTrace) {
    final message = switch (error) {
      PlayerException(:final message?) => message,
      PlayerInterruptedException() => 'Playback was interrupted.',
      _ => 'This track could not be played.',
    };
    if (_errors.hasListener) _errors.add(message);

    if (_player.hasNext) {
      unawaited(_player.seekToNext().then((_) => _player.play()));
      return;
    }
    playbackState.add(
      playbackState.value.copyWith(
        processingState: AudioProcessingState.error,
        playing: false,
        errorMessage: message,
      ),
    );
  }
}
