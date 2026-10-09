import 'dart:convert';
import 'dart:math' as math;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/auth/auth_repository.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Finding the one queue item a member is looking at, from anywhere.
///
/// Explore offers a word, the dictionary's search comes up empty, a topic page
/// lists what it is missing, Kawuri says it cannot verify something — and all
/// of them should land on the *same* queue item for the same word, so that
/// the answers people give from different doors pile up in one place for one
/// reviewer. That is what [queueWordIdFor] is for: it is the id the seed gave
/// every word, reproduced here, and the id `requestQueueWord` gives a word
/// nobody seeded.

// ── One word, one id ─────────────────────────────────────────────────────────

/// The queue id of an English word — the seed's `wordQueueId`, byte for byte.
String queueWordIdFor(String word) {
  final lower = word.toLowerCase();
  final slug = lower
      .replaceAll(RegExp('[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  final digest = sha1.convert(utf8.encode(lower)).toString().substring(0, 6);
  return '${slug.isEmpty ? 'word' : slug}-$digest';
}

/// What somebody typed, in the form the queue holds English words.
String normaliseQueueEnglish(String typed) =>
    typed.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

/// Whether [typed] could be a queue word at all: English letters, at most
/// three words. A Kasem spelling typed into the search box is a different gap,
/// and the open contribution form is the door for that one.
bool isQueueableEnglish(String typed) {
  final word = normaliseQueueEnglish(typed);
  if (word.isEmpty || word.length > 40 || word.split(' ').length > 3) {
    return false;
  }
  return RegExp(r"^[a-z](?:[a-z' -]*[a-z])?$").hasMatch(word);
}

// ── What a request said ──────────────────────────────────────────────────────

enum QueueWordState {
  /// Waiting for answers; opening it shows the form.
  open,

  /// Already has a verified translation: the member wants the entry.
  translated,

  /// Retired or otherwise not answerable.
  unavailable,
}

@immutable
class QueueWordRequest {
  const QueueWordRequest({
    required this.wordId,
    required this.word,
    required this.state,
    this.created = false,
  });

  final String wordId;
  final String word;
  final QueueWordState state;

  /// True when this request put the word in the queue for the first time.
  final bool created;

  static QueueWordRequest fromMap(Object? raw, {required String asked}) {
    final map = raw is Map ? raw : const <Object?, Object?>{};
    final status = '${map['status'] ?? ''}'.toLowerCase();
    final word = '${map['word'] ?? ''}'.trim();
    return QueueWordRequest(
      wordId: '${map['wordId'] ?? queueWordIdFor(asked)}',
      word: word.isEmpty ? asked : word,
      state: switch (status) {
        'open' => QueueWordState.open,
        'translated' => QueueWordState.translated,
        _ => QueueWordState.unavailable,
      },
      created: map['created'] == true,
    );
  }
}

class QueueLookupFailure implements Exception {
  const QueueLookupFailure(this.message);

  final String message;

  @override
  String toString() => 'QueueLookupFailure($message)';
}

// ── The reads and the one write ──────────────────────────────────────────────

abstract class QueueLookup {
  /// The open queue word with this id, or null when it is not open (answered
  /// and verified, retired) or does not exist.
  Future<QueueWord?> byId(String wordId);

  /// The open queue word for an English word, or null.
  Future<QueueWord?> byEnglish(String english);

  /// Open words people asked for under a dictionary topic, commonest first.
  Future<List<QueueWord>> openForTopic(String topic, {int limit = 20});

  /// A handful of open words for a guest's Explore prompt: a random stretch
  /// of the commoner words, so two guests are not both shown "the".
  Future<List<QueueWord>> promptCandidates({int limit = 10});

  /// Puts a missing word in the queue (or finds it there) and says where it
  /// stands. Needs a signed-in member.
  Future<QueueWordRequest> request(
    String english, {
    String? topic,
    required String source,
  });
}

class FirebaseQueueLookup implements QueueLookup {
  FirebaseQueueLookup(this._firestore, this._functions, {math.Random? random})
    : _random = random ?? math.Random();

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;
  final math.Random _random;

  CollectionReference<Map<String, dynamic>> get _queue =>
      _firestore.collection('wordQueue');

  @override
  Future<QueueWord?> byId(String wordId) async {
    try {
      final snap = await _queue.doc(wordId).get();
      final data = snap.data();
      if (data == null || '${data['status'] ?? 'open'}' != 'open') return null;
      return QueueWord.fromQueueRow(snap.id, data);
    } on FirebaseException catch (error) {
      // The rules serve open words only, so a word that has been answered and
      // verified reads as permission-denied rather than as a document.
      if (error.code == 'permission-denied' || error.code == 'not-found') {
        return null;
      }
      rethrow;
    }
  }

  @override
  Future<QueueWord?> byEnglish(String english) async {
    final word = normaliseQueueEnglish(english);
    if (!isQueueableEnglish(word)) return null;
    return byId(queueWordIdFor(word));
  }

  @override
  Future<List<QueueWord>> openForTopic(String topic, {int limit = 20}) async {
    final snap = await _queue
        .where('topics', arrayContains: topic)
        .where('status', isEqualTo: 'open')
        .orderBy('rank')
        .limit(limit)
        .get();
    return [
      for (final doc in snap.docs) ?QueueWord.fromQueueRow(doc.id, doc.data()),
    ];
  }

  @override
  Future<List<QueueWord>> promptCandidates({int limit = 10}) async {
    // A random start among the first couple of thousand ranks: common words
    // someone is likely to know, and a different stretch for each guest.
    final start = 1 + _random.nextInt(2000);
    Future<List<QueueWord>> from(int rank) async {
      final snap = await _queue
          .where('status', isEqualTo: 'open')
          .orderBy('rank')
          .startAt([rank])
          .limit(limit)
          .get();
      return [
        for (final doc in snap.docs)
          ?QueueWord.fromQueueRow(doc.id, doc.data()),
      ];
    }

    final words = await from(start);
    // Past the end of the open words: wrap round to the start once.
    return words.length >= limit ? words : [...words, ...await from(1)];
  }

  @override
  Future<QueueWordRequest> request(
    String english, {
    String? topic,
    required String source,
  }) async {
    final word = normaliseQueueEnglish(english);
    try {
      final result = await _functions
          .httpsCallable(
            'requestQueueWord',
            options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
          )
          .call<Map<Object?, Object?>>(<String, Object?>{
            'word': word,
            'topic': ?topic,
            'source': source,
          });
      return QueueWordRequest.fromMap(result.data, asked: word);
    } on FirebaseFunctionsException catch (error) {
      throw QueueLookupFailure(switch (error.code) {
        'unauthenticated' => 'Sign in to ask for a word.',
        'invalid-argument' =>
          error.message?.trim().isNotEmpty == true
              ? error.message!.trim()
              : 'That word could not be added.',
        'resource-exhausted' =>
          'That is a lot of words very quickly. Give it a minute.',
        _ =>
          'The word could not be added. Check your connection and try again.',
      });
    } on Object {
      throw const QueueLookupFailure(
        'The word could not be added. Check your connection and try again.',
      );
    }
  }
}

final queueLookupProvider = Provider<QueueLookup?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirebaseQueueLookup(
    FirebaseFirestore.instance,
    FirebaseFunctions.instance,
  );
});

// ── What the member has already turned down or answered ──────────────────────

/// The prompts a member dismissed and the words they answered, on this phone.
///
/// "Never show me that word again" has to survive a restart, and a guest has
/// no server-side record to keep it in. Signed-in members also get the
/// server's own filter (`nextQueueWords` never hands back a word they
/// answered or skipped); this list is what covers the rest.
class QueuePromptMemory {
  QueuePromptMemory(this._prefs);

  final SharedPreferences _prefs;

  static const _dismissedKey = 'loop.dismissedWords';
  static const _answeredKey = 'loop.answeredWords';

  /// The oldest ids are forgotten past this, the same reasoning as the
  /// server's progress lists: a word dismissed hundreds of words ago may well
  /// be one the member knows by now.
  static const maxRemembered = 400;

  Set<String> get dismissed =>
      (_prefs.getStringList(_dismissedKey) ?? const <String>[]).toSet();
  Set<String> get answered =>
      (_prefs.getStringList(_answeredKey) ?? const <String>[]).toSet();

  bool isSettled(String wordId) =>
      dismissed.contains(wordId) || answered.contains(wordId);

  Future<void> dismiss(String wordId) => _remember(_dismissedKey, wordId);
  Future<void> markAnswered(String wordId) => _remember(_answeredKey, wordId);

  Future<void> _remember(String key, String wordId) async {
    final list = [...?_prefs.getStringList(key)]..remove(wordId);
    list.add(wordId);
    final kept = list.length > maxRemembered
        ? list.sublist(list.length - maxRemembered)
        : list;
    await _prefs.setStringList(key, kept);
  }
}

final queuePromptMemoryProvider = FutureProvider<QueuePromptMemory>(
  (ref) async => QueuePromptMemory(await SharedPreferences.getInstance()),
);

/// Open words to offer in Explore this session, minus anything settled.
///
/// Signed in, from `nextQueueWords`, which already leaves out what the member
/// answered or skipped anywhere; a guest, from a random stretch of the queue.
/// Kept for the session: prompts are occasional, and one fetch covers them.
final explorePromptWordsProvider = FutureProvider<List<QueueWord>>((ref) async {
  final memory = await ref.watch(queuePromptMemoryProvider.future);
  final signedIn = ref.watch(isSignedInProvider);
  var words = const <QueueWord>[];
  try {
    if (signedIn) {
      final api = ref.watch(wordQueueApiProvider);
      if (api != null) words = (await api.next(limit: 20)).words;
    } else {
      final lookup = ref.watch(queueLookupProvider);
      if (lookup != null) words = await lookup.promptCandidates();
    }
  } on Object {
    // No connection, a refused query: Explore simply shows no prompt.
    return const <QueueWord>[];
  }
  return [
    for (final word in words)
      if (!memory.isSettled(word.id)) word,
  ];
});
