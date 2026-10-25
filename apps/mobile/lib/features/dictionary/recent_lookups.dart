import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the words somebody last opened are written down.
const recentLookupsPreferenceKey = 'indigen_dictionary_recent_v1';

/// How many are kept: a strip's worth, not a history.
const recentLookupsLimit = 12;

/// [ids] with [entryId] moved to the front and the list held to [limit].
@visibleForTesting
List<String> withRecentLookup(
  List<String> ids,
  String entryId, {
  int limit = recentLookupsLimit,
}) => [
  entryId,
  ...ids.where((id) => id != entryId),
].take(limit).toList(growable: false);

/// The words a member opened lately, newest first.
///
/// A learner looks the same word up three times in a week before it sticks,
/// and before this the third time meant typing it again — on a keyboard where
/// half the letters of the word are a long-press away. Ids rather than entries,
/// resolved against the live dictionary each time, so a word that was merged
/// or withdrawn simply leaves the strip. On this phone only: a list of what
/// somebody looked up is theirs, and nothing here needs it anywhere else.
class RecentLookupsController extends Notifier<List<String>> {
  @override
  List<String> build() {
    unawaited(_restore());
    return const <String>[];
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getStringList(recentLookupsPreferenceKey);
      if (stored == null || stored.isEmpty) return;
      state = [
        ...state,
        ...stored.where((id) => !state.contains(id)),
      ].take(recentLookupsLimit).toList(growable: false);
    } on Object catch (error) {
      debugPrint('Recent lookups could not be read: $error');
    }
  }

  Future<void> record(String entryId) async {
    if (entryId.isEmpty || state.firstOrNull == entryId) return;
    state = withRecentLookup(state, entryId);
    await _write();
  }

  Future<void> clear() async {
    state = const <String>[];
    await _write();
  }

  Future<void> _write() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(recentLookupsPreferenceKey, state);
    } on Object {
      // Kept for this session.
    }
  }
}

final recentLookupsProvider =
    NotifierProvider<RecentLookupsController, List<String>>(
      RecentLookupsController.new,
    );

/// The recent ids resolved against the published [entries], in order.
List<DictionaryEntry> resolveRecentLookups(
  List<String> ids,
  List<DictionaryEntry> entries,
) {
  final byId = {for (final entry in entries) entry.id: entry};
  return [for (final id in ids) ?byId[id]];
}
