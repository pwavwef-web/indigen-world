import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/profile/saved_words_sync.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the songs somebody liked are written down on this phone.
const musicLikedPreferenceKey = 'indigen_music_liked_v1';

/// Which account this phone last reconciled its liked songs with.
const musicLikedSyncedUidKey = 'indigen_music_liked_synced_uid_v1';

/// The list is bounded in the rules; the app keeps inside it.
const int kMaxLikedSongs = 1000;

/// The songs a member decided to keep, newest decision first.
///
/// ── Why this exists beside "Recently played" ──────────────────────────────
/// Recently played is a trace of behaviour; it forgets anything not played in
/// the last dozen sittings. A like is a decision, and the library tab said as
/// much while it had nowhere to put one. Track ids rather than tracks, for the
/// reason [RecentlyPlayedController] gives: an id is resolved against the live
/// collection each time, so a song that leaves the archive leaves the shelf.
///
/// ── Whose likes these are ─────────────────────────────────────────────────
/// The same rule as saved words, and the same code deciding it — see
/// [reconcileSavedWords]. Likes made as a guest join the first account that
/// signs in on the phone; likes reconciled with one account never join
/// another.
class LikedSongsController extends Notifier<List<String>> {
  @override
  List<String> build() {
    unawaited(_restore());
    return const <String>[];
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      final stored = preferences.getStringList(musicLikedPreferenceKey);
      if (stored == null || stored.isEmpty) return;
      // A like made before this read lands is newer than anything stored.
      state = [
        ...state,
        ...stored.where((id) => !state.contains(id)),
      ].take(kMaxLikedSongs).toList(growable: false);
    } on Object catch (error) {
      debugPrint('Liked songs could not be read: $error');
    }
  }

  bool isLiked(String trackId) => state.contains(trackId);

  /// The list as it stands, for a caller holding the controller rather than
  /// a ref.
  List<String> get ids => state;

  /// Likes [trackId], or takes the like back. Returns whether it is liked now.
  Future<bool> toggle(String trackId) async {
    final id = trackId.trim();
    if (id.isEmpty) return false;
    final liked = !state.contains(id);
    await replace(
      liked
          ? [id, ...state.where((existing) => existing != id)]
          : state.where((existing) => existing != id).toList(),
    );
    return liked;
  }

  /// Makes the phone's list exactly [ids], in that order.
  Future<void> replace(List<String> ids) async {
    state = ids.take(kMaxLikedSongs).toList(growable: false);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setStringList(musicLikedPreferenceKey, state);
    } on Object {
      // Kept for this session. The account copy, if any, still has it.
    }
  }
}

final likedSongsProvider = NotifierProvider<LikedSongsController, List<String>>(
  LikedSongsController.new,
);

/// Whether one song is liked — cheap to watch from a row.
final isSongLikedProvider = Provider.family<bool, String>(
  (ref, trackId) =>
      ref.watch(likedSongsProvider.select((ids) => ids.contains(trackId))),
);

/// The account's copy of the liked songs.
abstract interface class LikedSongsCloud {
  /// The account's liked songs, newest first, or null when it has never had
  /// any written.
  Future<List<String>?> read(String uid);

  Future<void> write(String uid, List<String> trackIds);
}

class FirestoreLikedSongsCloud implements LikedSongsCloud {
  const FirestoreLikedSongsCloud(this._firestore);

  final FirebaseFirestore _firestore;

  DocumentReference<Map<String, dynamic>> _doc(String uid) =>
      _firestore.collection('learnProgress').doc(uid);

  @override
  Future<List<String>?> read(String uid) async {
    final raw = (await _doc(uid).get()).data()?['likedSongIds'];
    if (raw is! List) return null;
    return [
      for (final id in raw)
        if (id is String && id.isNotEmpty) id,
    ];
  }

  @override
  Future<void> write(String uid, List<String> trackIds) =>
      // Merged, beside the saved words and the learning record, for the same
      // reason `FirestoreSavedWordsCloud.write` gives.
      _doc(uid).set({
        'uid': uid,
        'likedSongIds': trackIds.take(kMaxLikedSongs).toList(),
        'completedLessons': FieldValue.arrayUnion(const <String>[]),
      }, SetOptions(merge: true));
}

final likedSongsCloudProvider = Provider<LikedSongsCloud?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirestoreLikedSongsCloud(FirebaseFirestore.instance);
});

/// [reconcileSavedWords]'s answer, put back into an order.
///
/// The phone's order first — it is the order the likes were made in here —
/// then whatever the account adds, in the account's order.
@visibleForTesting
List<String> orderLikedSongs({
  required Set<String> keep,
  required List<String> local,
  required List<String> cloud,
}) {
  final ordered = <String>[];
  for (final id in [...local, ...cloud]) {
    if (keep.contains(id) && !ordered.contains(id)) ordered.add(id);
  }
  return ordered;
}

/// Brings the liked songs of whoever is signed in down to this phone, once per
/// sign-in. Watched by the shell, beside the saved words.
final likedSongsSyncProvider = FutureProvider<void>((ref) async {
  final uid = ref.watch(authStateProvider).asData?.value?.uid;
  final cloud = ref.watch(likedSongsCloudProvider);
  if (uid == null || cloud == null) return;
  try {
    final preferences = await SharedPreferences.getInstance();
    final local =
        preferences.getStringList(musicLikedPreferenceKey) ?? const <String>[];
    final remote = await cloud.read(uid);
    final result = reconcileSavedWords(
      uid: uid,
      local: local.toSet(),
      cloud: remote?.toSet(),
      syncedUid: preferences.getString(musicLikedSyncedUidKey),
    );
    final ordered = orderLikedSongs(
      keep: result.ids,
      local: local,
      cloud: remote ?? const <String>[],
    );
    if (!listEquals(ordered, local)) {
      await ref.read(likedSongsProvider.notifier).replace(ordered);
    }
    if (result.writeCloud) await cloud.write(uid, ordered);
    await preferences.setString(musicLikedSyncedUidKey, uid);
  } on Object catch (error) {
    // Offline, or refused: the phone keeps what it has and tries next launch.
    debugPrint('Liked songs could not be synced: $error');
  }
});

/// Likes or unlikes [trackId] here, and writes the list to the account once
/// this phone has reconciled with it. Returns whether the song is liked now.
Future<bool> toggleLikedSong(WidgetRef ref, String trackId) async {
  // Everything read from [ref] before the first await: the song menu closes
  // as it calls this, and a ref is not to be used once its widget has gone.
  final likes = ref.read(likedSongsProvider.notifier);
  final uid = ref.read(authStateProvider).asData?.value?.uid;
  final cloud = ref.read(likedSongsCloudProvider);
  final liked = await likes.toggle(trackId);
  if (uid != null && cloud != null) {
    try {
      final preferences = await SharedPreferences.getInstance();
      // Before the first reconcile the account may hold likes this phone has
      // never seen, and writing over them would lose them.
      if (preferences.getString(musicLikedSyncedUidKey) == uid) {
        await cloud.write(uid, likes.ids);
      }
    } on Object catch (error) {
      debugPrint('Liked songs could not be written to the account: $error');
    }
  }
  return liked;
}
