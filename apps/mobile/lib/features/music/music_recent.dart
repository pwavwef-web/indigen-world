import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the last few things somebody played are written down.
const musicRecentPreferenceKey = 'indigen_music_recent_v1';

/// How many are kept. Long enough to be a shelf, short enough that it is still
/// "what I have been listening to" rather than a second copy of the archive.
const musicRecentLimit = 12;

/// The songs somebody actually came back for, newest first.
///
/// ── Why this is not the resume point ──────────────────────────────────────
/// `MusicResumePoint` answers "what was I in the middle of", which is one
/// track and a position, and it is replaced every time anything else plays.
/// This answers a different question — "what have I been listening to" — and a
/// player without it opens on the same undifferentiated grid on the hundredth
/// visit as on the first.
///
/// Track ids rather than tracks, deliberately. A stored copy of a publication
/// record is stale the moment the artwork changes or the piece is unpublished;
/// an id is resolved against the live collection every time the shelf is
/// drawn, so a record that has left the archive simply stops appearing.
class RecentlyPlayedController extends Notifier<List<String>> {
  @override
  List<String> build() {
    unawaited(_restore());
    return const <String>[];
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getStringList(musicRecentPreferenceKey);
      if (stored == null || stored.isEmpty) return;
      // Anything played since launch wins: this read can land after somebody
      // has already started something, and restoring over it would put the
      // shelf a session behind.
      state = [
        ...state,
        ...stored.where((id) => !state.contains(id)),
      ].take(musicRecentLimit).toList(growable: false);
    } on Object catch (error) {
      // A recent list is a convenience. Losing it costs nothing a member can
      // name; failing a launch over it would cost them the app.
      debugPrint('Recently played could not be read: $error');
    }
  }

  /// Moves [trackId] to the front, whether or not it was already there.
  Future<void> record(String trackId) async {
    final id = trackId.trim();
    if (id.isEmpty) return;
    state = [
      id,
      ...state.where((existing) => existing != id),
    ].take(musicRecentLimit).toList(growable: false);

    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(musicRecentPreferenceKey, state);
    } on Object {
      // Kept for this session, lost on the next. Still better than nothing.
    }
  }

  Future<void> clear() async {
    state = const <String>[];
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.remove(musicRecentPreferenceKey);
    } on Object {
      // Nothing further to do: the list is already gone from this session.
    }
  }
}

final recentlyPlayedProvider =
    NotifierProvider<RecentlyPlayedController, List<String>>(
      RecentlyPlayedController.new,
    );

/// The recently played ids resolved against [items], in the order they were
/// played and with anything no longer published quietly dropped.
List<PublishedReel> resolveRecent(
  List<String> ids,
  List<PublishedReel> items,
) {
  final byId = {for (final item in items) item.id: item};
  return List.unmodifiable([for (final id in ids) ?byId[id]]);
}
