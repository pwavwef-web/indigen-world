import 'dart:ui' show Offset, Rect, Size;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// Where the player sits, and which of its two shapes it is in.
///
/// ── Why this is not part of `MusicSessionState` ───────────────────────────
/// Nothing in this file can reach the handler, and that is the feature. A
/// member who minimises the bar is saying something about the screen, never
/// about the song: the queue, the position, the volume and the playing state
/// are not consulted here and cannot be changed from here, so there is no way
/// for a shape change to become a playback change by accident.
@immutable
class MusicBarPlacement {
  const MusicBarPlacement({this.collapsed = false, this.dock});

  /// True once the bar has been minimised into the floating bubble.
  final bool collapsed;

  /// Where the bubble was last dragged to, or null while it is parked in the
  /// corner it picks for itself.
  final MusicBubbleDock? dock;

  MusicBarPlacement copyWith({bool? collapsed, MusicBubbleDock? dock}) =>
      MusicBarPlacement(
        collapsed: collapsed ?? this.collapsed,
        dock: dock ?? this.dock,
      );
}

/// A dragged bubble's resting place.
@immutable
class MusicBubbleDock {
  const MusicBubbleDock({required this.onLeft, required this.topFraction});

  /// Which edge it snapped to when the finger let go. A bubble left in the
  /// middle would be sitting over the middle of whatever is being read.
  final bool onLeft;

  /// How far down its travel it rests, 0 at the top and 1 at the bottom.
  ///
  /// A fraction rather than a y, because the screen it was dropped on is not
  /// necessarily the screen it will next be drawn on: a rotation, a keyboard,
  /// a split-screen window. Fractions survive all three; pixels do not.
  final double topFraction;

  @override
  bool operator ==(Object other) =>
      other is MusicBubbleDock &&
      other.onLeft == onLeft &&
      other.topFraction == topFraction;

  @override
  int get hashCode => Object.hash(onLeft, topFraction);
}

/// The bubble is square and exactly as tall as the bar, so the two shapes
/// differ only in width and corner radius — which is what lets the morph
/// between them be a single rectangle tween.
const double kMusicBubbleSize = kMiniPlayerHeight;

/// The margin the bar and the bubble both keep from the side of the screen.
const double kMusicBarMargin = 10;

/// The gap between the bar and the system inset under it.
const double kMusicBarBottomGap = 6;

/// How far the parked bubble stays clear of the bottom-right corner.
///
/// Six screens keep a floating action button down there — compose, contribute,
/// new community — and a bubble that parked on one would be covering the
/// button somebody opened the screen to press. This is that button's height
/// and its margin, measured up from the top of the nav rail, so the bubble
/// comes to rest immediately above it rather than on it. Dragging overrides
/// this; nothing about it is a rule, it is only a better first guess than the
/// corner itself.
const double kMusicBubbleFabClearance = 72;

/// Where the bar and the bubble are allowed to be on a screen of a given size.
///
/// Pure arithmetic, kept out of the widgets so the corner it parks in and the
/// edge a drag lands on can be tested without pumping anything.
@immutable
class MusicBubbleBounds {
  const MusicBubbleBounds({
    required this.box,
    required this.safeTop,
    required this.safeBottom,
  });

  /// The overlay's own box — the whole window, since it is mounted above the
  /// Navigator.
  final Size box;

  /// The system insets. `viewPadding`, never `padding`: the overlay inflates
  /// `padding` itself to make room for the bar.
  final double safeTop;
  final double safeBottom;

  double get minTop => safeTop + kMusicBarMargin;

  /// The lowest the bubble may sit: exactly where the bar's own top edge is,
  /// so dragging it to the bottom puts it back where it came from.
  double get maxTop =>
      box.height - safeBottom - kMusicBarBottomGap - kMusicBubbleSize;

  double get leftX => kMusicBarMargin;

  double get rightX => box.width - kMusicBarMargin - kMusicBubbleSize;

  /// The bar: full width, along the bottom.
  Rect get barRect => Rect.fromLTWH(
    kMusicBarMargin,
    box.height - safeBottom - kMusicBarBottomGap - kMiniPlayerHeight,
    box.width - kMusicBarMargin * 2,
    kMiniPlayerHeight,
  );

  /// Where the bubble goes when nobody has moved it: the bottom-right, above
  /// the rail and above whatever floating button the screen keeps there.
  Rect get homeRect => Rect.fromLTWH(
    rightX,
    clampTop(
      box.height -
          safeBottom -
          kFrostedNavBarReservedSpace -
          kMusicBubbleFabClearance -
          kMusicBubbleSize,
    ),
    kMusicBubbleSize,
    kMusicBubbleSize,
  );

  Rect rectFor(MusicBubbleDock? dock) => dock == null
      ? homeRect
      : Rect.fromLTWH(
          dock.onLeft ? leftX : rightX,
          clampTop(minTop + (maxTop - minTop) * dock.topFraction),
          kMusicBubbleSize,
          kMusicBubbleSize,
        );

  /// Which dock a bubble let go of at [topLeft] settles into: the nearer edge,
  /// at the height the finger left it.
  MusicBubbleDock dockFor(Offset topLeft) => MusicBubbleDock(
    onLeft: topLeft.dx + kMusicBubbleSize / 2 < box.width / 2,
    topFraction: maxTop <= minTop
        ? 0
        : ((topLeft.dy - minTop) / (maxTop - minTop)).clamp(0.0, 1.0),
  );

  /// Keeps a finger from dragging the bubble off the screen.
  Offset clamp(Offset topLeft) => Offset(
    topLeft.dx.clamp(leftX, rightX < leftX ? leftX : rightX),
    clampTop(topLeft.dy),
  );

  double clampTop(double top) =>
      maxTop <= minTop ? minTop : top.clamp(minTop, maxTop);
}

/// The shape the player is in, and where it was last put.
final musicBarPlacementProvider =
    NotifierProvider<MusicBarPlacementNotifier, MusicBarPlacement>(
      MusicBarPlacementNotifier.new,
    );

class MusicBarPlacementNotifier extends Notifier<MusicBarPlacement> {
  @override
  MusicBarPlacement build() => const MusicBarPlacement();

  /// Minimise the bar into the bubble. Playback is not told, because playback
  /// is not affected.
  void collapse() => state = state.copyWith(collapsed: true);

  /// Put the bar back, in the state the member left it playing in.
  void expand() => state = state.copyWith(collapsed: false);

  /// Remember where a drag finished.
  void dockAt(MusicBubbleDock dock) => state = state.copyWith(dock: dock);
}
