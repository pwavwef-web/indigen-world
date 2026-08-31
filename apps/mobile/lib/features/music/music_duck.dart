import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:indigen_world_mobile/features/music/music_controller.dart';

/// How long the music waits before coming back.
///
/// Somebody checking three pronunciations in a row crosses zero between each
/// one. Without a pause here they would get three separate quarter-seconds of
/// music in the gaps, which is worse than either playing or not playing. Long
/// enough to swallow the gap between two taps, short enough that putting a reel
/// down and picking the album back up feels immediate.
const Duration kMusicResumeDelay = Duration(milliseconds: 300);

/// Hands the speakers over, and takes them back.
///
/// ── Why one refcount rather than each surface talking to the player ────────
/// `fullScreenMediaProvider` already counts how many things are claiming to own
/// the sound: a pushed viewer, a community video, an Explore reel, a
/// pronunciation. It existed before the music player did, for the narrower job
/// of stopping two clips playing at once. Reusing it means there is exactly one
/// place that knows whether anything else is audible, and a new surface joins
/// the arrangement by calling `enter()` and `leave()` like everything else
/// rather than by learning about music.
///
/// This widget is mounted by the music overlay, which sits above every route —
/// so the arrangement holds on a pushed screen, in a shell tab, and on Explore
/// alike.
class MusicDuckListener extends ConsumerStatefulWidget {
  const MusicDuckListener({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<MusicDuckListener> createState() => _MusicDuckListenerState();
}

class _MusicDuckListenerState extends ConsumerState<MusicDuckListener> {
  Timer? _resume;

  @override
  void dispose() {
    _resume?.cancel();
    super.dispose();
  }

  void _onFocusChanged(int? previous, int next) {
    // A claim arriving cancels any resume still waiting to fire. Without this a
    // member closing one pronunciation and opening the next would get the music
    // back for a moment in between.
    _resume?.cancel();
    _resume = null;

    final controller = ref.read(musicControllerProvider.notifier);
    if (next > 0) {
      controller.duckForOtherAudio();
      return;
    }
    _resume = Timer(kMusicResumeDelay, () {
      // Re-read rather than trust the value this fired with: something may have
      // claimed the speakers again while the timer was running.
      if (!mounted || ref.read(fullScreenMediaProvider) > 0) return;
      controller.resumeAfterOtherAudio();
    });
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<int>(fullScreenMediaProvider, _onFocusChanged);
    return widget.child;
  }
}
