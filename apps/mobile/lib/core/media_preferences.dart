import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// How video attachments behave in a feed.
///
/// Two choices, both of them the member's and both of them remembered on the
/// device rather than on the account: whether a clip starts itself when it
/// scrolls into view, and whether the ones that do start make a sound.
///
/// They are kept here rather than inside the player so Settings can offer them
/// without importing a video widget, and so every surface that plays community
/// media — the feed, the conversation, the immersive viewer — is answering to
/// the same two switches.
const videoAutoplayPreferenceKey = 'indigen_video_autoplay_v1';
const videoMutedPreferenceKey = 'indigen_video_muted_v1';

/// Whether a clip plays itself once it is mostly on screen.
///
/// On by default, because a feed of still frames with play buttons on them is
/// a feed nobody watches. Off is a real data saving on a metered Ghanaian SIM,
/// which is why it is offered at all.
final videoAutoplayProvider = NotifierProvider<VideoAutoplayController, bool>(
  VideoAutoplayController.new,
);

/// Whether a clip that started itself is silent.
///
/// On by default, and deliberately sticky: a phone that starts talking in a
/// quiet room is the single fastest way to lose somebody from a feed. Tapping
/// the speaker on any clip changes it for every clip, which is what members
/// expect from every product that has this control.
final videoMutedProvider = NotifierProvider<VideoMutedController, bool>(
  VideoMutedController.new,
);

/// How many full-screen media viewers are currently open.
///
/// A viewer is pushed as a see-through route so it can be dragged away to
/// reveal the feed underneath, which means the feed is still mounted, still
/// laid out and — without this — still playing. One clip playing behind
/// another is two soundtracks at once, so a feed tile stands down for as long
/// as anything is on top of it.
final fullScreenMediaProvider = NotifierProvider<FullScreenMediaCount, int>(
  FullScreenMediaCount.new,
);

class FullScreenMediaCount extends Notifier<int> {
  @override
  int build() => 0;

  void enter() => state = state + 1;

  void leave() => state = state > 0 ? state - 1 : 0;
}

/// Shared behaviour for the two device-local media switches.
abstract class _MediaSwitch extends Notifier<bool> {
  String get key;
  bool get fallback;

  @override
  bool build() {
    unawaited(_restore());
    return fallback;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getBool(key);
      // A member who never touched the switch keeps the default, and a storage
      // read that fails is treated the same way rather than as a choice.
      if (stored != null && stored != state) state = stored;
    } on Object {
      // Nothing to recover: the default is already in state.
    }
  }

  Future<void> set(bool value) async {
    if (state == value) return;
    state = value;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(key, value);
    } on Object {
      // The choice still holds for this session; only its persistence failed.
    }
  }

  Future<void> toggle() => set(!state);
}

class VideoAutoplayController extends _MediaSwitch {
  @override
  String get key => videoAutoplayPreferenceKey;

  @override
  bool get fallback => true;
}

class VideoMutedController extends _MediaSwitch {
  @override
  String get key => videoMutedPreferenceKey;

  @override
  bool get fallback => true;
}
