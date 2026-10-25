import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';
import 'package:indigen_world_mobile/features/music/music_providers.dart';

/// How long the music takes to fade before a sleep timer stops it.
const musicSleepFade = Duration(seconds: 10);

/// The lengths offered, shortest first.
const musicSleepChoices = <Duration>[
  Duration(minutes: 15),
  Duration(minutes: 30),
  Duration(minutes: 45),
  Duration(minutes: 60),
];

/// A sleep timer that is running: either a time on the clock, or the end of
/// one particular song.
@immutable
class MusicSleepTimer {
  const MusicSleepTimer.at(DateTime this.endsAt) : endOfTrackId = null;

  const MusicSleepTimer.endOfTrack(String this.endOfTrackId) : endsAt = null;

  final DateTime? endsAt;

  /// The song whose end stops the music. Its id rather than "the current
  /// one", so skipping ahead does not silently move the timer to the next.
  final String? endOfTrackId;

  bool get atEndOfTrack => endOfTrackId != null;
}

/// How long [timer] has left, or null when that depends on the length of a
/// song the player has not measured yet.
Duration? musicSleepRemaining(
  MusicSleepTimer timer, {
  required DateTime now,
  Duration? position,
  Duration? duration,
}) {
  final endsAt = timer.endsAt;
  if (endsAt != null) {
    final left = endsAt.difference(now);
    return left.isNegative ? Duration.zero : left;
  }
  if (position == null || duration == null || duration <= Duration.zero) {
    return null;
  }
  final left = duration - position;
  return left.isNegative ? Duration.zero : left;
}

/// The volume while a timer runs down: full until the last [musicSleepFade],
/// then easing to silence, so nobody is woken by the music stopping.
double musicSleepVolume(Duration? remaining) {
  if (remaining == null || remaining >= musicSleepFade) return 1;
  if (remaining <= Duration.zero) return 0;
  return remaining.inMilliseconds / musicSleepFade.inMilliseconds;
}

/// "12:05 left", "1:00:00 left" — the time on the chip.
String musicSleepLabel(Duration remaining) {
  final hours = remaining.inHours;
  final minutes = remaining.inMinutes.remainder(60);
  final seconds = remaining.inSeconds.remainder(60);
  String two(int value) => value.toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${two(minutes)}:${two(seconds)}'
      : '$minutes:${two(seconds)}';
}

/// The running sleep timer, or null.
///
/// Ticks once a second while it runs: enough to fade smoothly over ten
/// seconds, and nothing at all while no timer is set.
class MusicSleepTimerController extends Notifier<MusicSleepTimer?> {
  Timer? _ticker;

  @override
  MusicSleepTimer? build() {
    ref.onDispose(() => _ticker?.cancel());
    return null;
  }

  /// Stops the music [after] from now.
  void start(Duration after) =>
      _arm(MusicSleepTimer.at(DateTime.now().add(after)));

  /// Stops the music when the song playing now ends.
  void startEndOfTrack() {
    final id = ref.read(musicAudioHandlerProvider)?.mediaItem.value?.id;
    if (id == null) return;
    _arm(MusicSleepTimer.endOfTrack(id));
  }

  void cancel() {
    _ticker?.cancel();
    _ticker = null;
    state = null;
    unawaited(ref.read(musicAudioHandlerProvider)?.setVolume(1));
  }

  /// What is left on the timer now, for the chip.
  Duration? remaining() {
    final timer = state;
    if (timer == null) return null;
    final handler = ref.read(musicAudioHandlerProvider);
    return musicSleepRemaining(
      timer,
      now: DateTime.now(),
      position: handler?.position,
      duration: handler?.mediaItem.value?.duration,
    );
  }

  void _arm(MusicSleepTimer timer) {
    _ticker?.cancel();
    state = timer;
    unawaited(ref.read(musicAudioHandlerProvider)?.setVolume(1));
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    final timer = state;
    final handler = ref.read(musicAudioHandlerProvider);
    if (timer == null || handler == null || handler.queue.value.isEmpty) {
      cancel();
      return;
    }
    // The song it was set for has ended and the queue moved on: stop here,
    // at the top of the next one, which the fade has already silenced.
    if (timer.atEndOfTrack &&
        handler.mediaItem.value?.id != timer.endOfTrackId) {
      unawaited(_expire());
      return;
    }
    final left = remaining();
    if (!timer.atEndOfTrack && left == Duration.zero) {
      unawaited(_expire());
      return;
    }
    unawaited(handler.setVolume(musicSleepVolume(left)));
  }

  Future<void> _expire() async {
    _ticker?.cancel();
    _ticker = null;
    state = null;
    final handler = ref.read(musicAudioHandlerProvider);
    await ref.read(musicControllerProvider.notifier).pause();
    // A song the queue had just walked into starts from the top next time.
    if (handler != null && handler.position < const Duration(seconds: 5)) {
      await handler.seek(Duration.zero);
    }
    await handler?.setVolume(1);
  }
}

final musicSleepTimerProvider =
    NotifierProvider<MusicSleepTimerController, MusicSleepTimer?>(
      MusicSleepTimerController.new,
    );
