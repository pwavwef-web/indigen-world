import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The shortcuts a long press on the app icon offers.
///
/// ── Why these four ────────────────────────────────────────────────────────
/// Each is something people open the app to do and then have to walk to: the
/// dictionary is a tile inside Collection, the composer a button inside
/// Community, messages and alerts a level below that. A shortcut is one press
/// from the home screen instead of three taps after the app has loaded. The
/// order is the order Android lists them in, most used nearest the icon.
///
/// Published as dynamic shortcuts from the running app rather than declared in
/// a static XML file, because a static shortcut names its target package and
/// this app ships under three — production, staging and development — that
/// would each need their own copy of the file.
@immutable
class AppShortcut {
  const AppShortcut({
    required this.id,
    required this.shortLabel,
    required this.longLabel,
    required this.route,
    required this.icon,
  });

  /// Stable across releases: Android keeps a shortcut somebody pinned to
  /// their home screen by this id, and a renamed id orphans it.
  final String id;

  /// At most ten characters, which is what fits under an icon.
  final String shortLabel;

  /// At most twenty-five, shown in the long-press list when there is room.
  final String longLabel;

  /// The in-app route it opens, reached through `indigen://open/<id>`.
  final String route;

  /// The drawable resource it wears (android/app/src/main/res/drawable).
  final String icon;

  /// The link Android fires when the shortcut is pressed. Read back by
  /// `appRouteForLink`, the same path a shared post link takes.
  String get uri => 'indigen://open/$id';

  Map<String, String> toChannel() => {
    'id': id,
    'shortLabel': shortLabel,
    'longLabel': longLabel,
    'uri': uri,
    'icon': icon,
  };
}

const appShortcuts = <AppShortcut>[
  AppShortcut(
    id: 'dictionary',
    shortLabel: 'Look up',
    longLabel: 'Search the dictionary',
    route: '/dictionary?focus=search',
    icon: 'ic_shortcut_search',
  ),
  AppShortcut(
    id: 'compose',
    shortLabel: 'New post',
    longLabel: 'Write a post',
    route: '/compose',
    icon: 'ic_shortcut_compose',
  ),
  AppShortcut(
    id: 'messages',
    shortLabel: 'Messages',
    longLabel: 'Your messages',
    route: '/messages',
    icon: 'ic_shortcut_messages',
  ),
  AppShortcut(
    id: 'notifications',
    shortLabel: 'Alerts',
    longLabel: 'Your notifications',
    route: '/notifications',
    icon: 'ic_shortcut_notifications',
  ),
];

/// The route a shortcut id opens, or null for an id this build does not
/// publish — a shortcut pinned by an older build that has since been retired.
String? routeForShortcut(String id) {
  for (final shortcut in appShortcuts) {
    if (shortcut.id == id) return shortcut.route;
  }
  return null;
}

const _channel = MethodChannel('world.indigen.mobile/app_shortcuts');

/// Publishes [appShortcuts] once per launch. Watched by the shell; Android
/// only, and best-effort — a launcher that ignores shortcuts costs nothing.
final appShortcutsProvider = Provider<void>((ref) {
  if (defaultTargetPlatform != TargetPlatform.android) return;
  unawaited(
    _channel
        .invokeMethod<void>('publish', [
          for (final shortcut in appShortcuts) shortcut.toChannel(),
        ])
        .catchError((Object error) {
          debugPrint('App shortcuts unavailable (continuing): $error');
        }),
  );
});
