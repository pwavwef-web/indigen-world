import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether the shell's own furniture is on screen: the glass rail at the bottom
/// of every tab, and the composer that floats above it.
///
/// One flag for both, because they are one gesture. A reader who has moved on
/// into a feed gets the whole bottom of the screen back and gets it again the
/// moment they turn around — and a composer left hovering over a rail that has
/// already gone, or a rail sitting under a button that has not, reads as a bug
/// rather than as either thing behaving.
///
/// It lives at the shell rather than in a screen because the rail is the
/// shell's, while the scroll that hides it happens inside a tab. Every screen
/// that does not touch it simply leaves it true.
class ShellChromeVisibility extends Notifier<bool> {
  @override
  bool build() => true;

  /// Puts the rail and composer where [visible] says, on a frame where doing so
  /// is legal.
  ///
  /// Scroll notifications mostly arrive between frames, where this is an
  /// ordinary state change. A few — a position corrected while the viewport is
  /// being laid out — arrive during the frame itself, and marking an ancestor
  /// that has already built dirty at that point is an error rather than a late
  /// repaint. Those are deferred to the end of the same frame, which nobody can
  /// see the difference of.
  void set(bool visible) {
    if (state == visible) return;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (state != visible) state = visible;
      });
      return;
    }
    state = visible;
  }

  /// Brings both back. Called when a tab changes, so a rail hidden by one
  /// screen's scroll is never inherited by the next one.
  void reveal() => set(true);
}

final shellChromeVisibilityProvider =
    NotifierProvider<ShellChromeVisibility, bool>(ShellChromeVisibility.new);
