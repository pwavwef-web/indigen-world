import 'package:flutter/widgets.dart';

/// Gives decoded images back when the app stops being looked at.
///
/// ── Why this exists ───────────────────────────────────────────────────────
/// Google Play measures bitmap memory per app *state*, and from February 2027
/// treats holding too much of it outside the foreground as bad behaviour —
/// with reduced store visibility as the consequence. The reasoning is hard to
/// argue with: a decoded bitmap that no screen is drawing is memory that
/// cannot become a pixel.
///
/// This app is more exposed to that than most. The music player runs a media
/// foreground service, so it has a long-lived *user-perceived service* state
/// that an app without background playback simply never enters — somebody
/// listening to an audiobook with their phone in a pocket is in it for hours.
/// Explore and Collection fill Flutter's image cache with full-bleed artwork on
/// the way there.
///
/// ── Why Flutter does not already do this ──────────────────────────────────
/// It half does. The engine forwards Android's memory-pressure signals and
/// `WidgetsBinding.handleMemoryPressure` empties the cache when one arrives —
/// but those signals mean "the device is running low", and they are not sent
/// when an app merely goes to the background. So the cache survives being
/// backgrounded, at up to its full 100 MB budget, for as long as the process
/// does. Which is precisely the state being measured.
///
/// ── What is released, and what is not ─────────────────────────────────────
/// [ImageCache.clear] drops images nothing is currently drawing. Images a live
/// widget still holds are untouched — they are reachable and would be decoded
/// again the moment the app returned — so this frees the backlog rather than
/// the screen. The cost of being wrong is a re-decode on the way back in; the
/// cost of not doing it is a threshold this app has no way to see itself
/// crossing.
class ImageMemoryTrimmer with WidgetsBindingObserver {
  ImageMemoryTrimmer();

  /// Starts listening. Call once, from `main`.
  void attach() => WidgetsBinding.instance.addObserver(this);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      // `hidden` arrives first on the way out and `paused` follows, so both
      // are named: on the platforms that send only one of them, the cache is
      // still released.
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
        PaintingBinding.instance.imageCache.clear();
      case AppLifecycleState.resumed:
      case AppLifecycleState.inactive:
        break;
    }
  }
}
