import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/data/repositories.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Saved words that follow the account.
///
/// ── Why ─────────────────────────────────────────────────────────────────────
/// Signing in promises to carry somebody's learning across devices, and saved
/// words were the one part of it that stayed on the phone: a reinstall, or a
/// second phone, and they were gone. Learn progress already lives on
/// `learnProgress/{uid}`, so the words go beside it, as one list of entry ids.
///
/// ── How ─────────────────────────────────────────────────────────────────────
/// The phone's own table stays the working copy — it is what every screen
/// reads, and it works offline. Signed in, every save and unsave also writes
/// the whole list to the account, so the account always holds the latest set
/// from whichever phone last changed it. On sign-in the two are reconciled
/// once — see [reconcileSavedWords] — and after that the account's copy is the
/// one that counts.
///
/// ── Whose words these are ───────────────────────────────────────────────────
/// A phone can be shared. Words saved as a guest are the guest's own and join
/// the first account that signs in on the phone; words already reconciled with
/// one account never join another. The phone remembers which account it last
/// reconciled with, and that is the whole of the rule.

/// The list is bounded in the rules; the app keeps well inside it.
const int kMaxSyncedSavedWords = 2000;

/// Which account this phone last reconciled its saved words with.
const savedWordsSyncedUidKey = 'indigen_saved_words_synced_uid_v1';

/// The account's copy.
abstract interface class SavedWordsCloud {
  /// The account's saved words, or null when it has never had any written.
  Future<Set<String>?> read(String uid);

  Future<void> write(String uid, Set<String> entryIds);
}

class FirestoreSavedWordsCloud implements SavedWordsCloud {
  const FirestoreSavedWordsCloud(this._firestore);

  final FirebaseFirestore _firestore;

  DocumentReference<Map<String, dynamic>> _doc(String uid) =>
      _firestore.collection('learnProgress').doc(uid);

  @override
  Future<Set<String>?> read(String uid) async {
    final data = (await _doc(uid).get()).data();
    final raw = data?['savedWordIds'];
    if (raw is! List) return null;
    return {
      for (final id in raw)
        if (id is String && id.isNotEmpty) id,
    };
  }

  @override
  Future<void> write(String uid, Set<String> entryIds) {
    final ids = (entryIds.toList()..sort()).take(kMaxSyncedSavedWords).toList();
    // Merged, so learn progress beside it is untouched. The rules for this
    // document insist on `uid` and a `completedLessons` list, and a member who
    // saves a word before finishing any lesson has neither yet — the empty
    // union creates the list without touching one that exists.
    return _doc(uid).set({
      'uid': uid,
      'savedWordIds': ids,
      'completedLessons': FieldValue.arrayUnion(const <String>[]),
    }, SetOptions(merge: true));
  }
}

final savedWordsCloudProvider = Provider<SavedWordsCloud?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirestoreSavedWordsCloud(FirebaseFirestore.instance);
});

/// What the phone and the account should both hold once [uid] has signed in.
///
/// [syncedUid] is the account the phone last reconciled with, or null if it
/// never has — in which case its words were saved as a guest and are the
/// member's to bring with them.
@visibleForTesting
({Set<String> ids, bool writeCloud}) reconcileSavedWords({
  required String uid,
  required Set<String> local,
  required Set<String>? cloud,
  required String? syncedUid,
}) {
  final guestWords = syncedUid == null;
  if (cloud == null) {
    // The account has never had a list. The phone's becomes it, unless the
    // phone's belongs to somebody else.
    final ids = guestWords || syncedUid == uid ? local : const <String>{};
    return (ids: ids, writeCloud: true);
  }
  if (guestWords) {
    final both = {...cloud, ...local};
    return (ids: both, writeCloud: both.length != cloud.length);
  }
  // Reconciled before: every change since was written through, so the
  // account's list is the latest one — from this phone or another.
  return (ids: cloud, writeCloud: false);
}

/// Brings the saved words of whoever is signed in down to this phone, once
/// per sign-in. Watched by the shell, like the push registration.
final savedWordsSyncProvider = FutureProvider<void>((ref) async {
  final uid = ref.watch(authStateProvider).asData?.value?.uid;
  final cloud = ref.watch(savedWordsCloudProvider);
  if (uid == null || cloud == null) return;
  final repository = ref.read(savedEntryRepositoryProvider);
  try {
    final preferences = await SharedPreferences.getInstance();
    final local = {
      for (final id in await repository.getSavedIds())
        if (!id.contains(':')) id,
    };
    final result = reconcileSavedWords(
      uid: uid,
      local: local,
      cloud: await cloud.read(uid),
      syncedUid: preferences.getString(savedWordsSyncedUidKey),
    );
    if (!setEquals(result.ids, local)) {
      await repository.replaceSavedWords(result.ids);
      ref.invalidate(savedEntryIdsProvider);
    }
    if (result.writeCloud) await cloud.write(uid, result.ids);
    await preferences.setString(savedWordsSyncedUidKey, uid);
  } on Object catch (error) {
    // Offline, or refused. The phone keeps what it has, and the next sign-in
    // or launch tries again; nothing is marked reconciled that was not.
    debugPrint('Saved words could not be synced: $error');
  }
});

/// Writes this phone's saved words to the account after a save or an unsave.
///
/// Only once the phone has reconciled with this account. Before that the
/// account may hold words this phone has never seen, and writing the phone's
/// list over them would lose them; the reconciliation folds this change in
/// when it runs.
Future<void> pushSavedWords(WidgetRef ref) async {
  final uid = ref.read(authStateProvider).asData?.value?.uid;
  final cloud = ref.read(savedWordsCloudProvider);
  if (uid == null || cloud == null) return;
  try {
    final preferences = await SharedPreferences.getInstance();
    if (preferences.getString(savedWordsSyncedUidKey) != uid) return;
    final ids = {
      for (final id
          in await ref.read(savedEntryRepositoryProvider).getSavedIds())
        if (!id.contains(':')) id,
    };
    await cloud.write(uid, ids);
  } on Object catch (error) {
    debugPrint('Saved words could not be written to the account: $error');
  }
}
