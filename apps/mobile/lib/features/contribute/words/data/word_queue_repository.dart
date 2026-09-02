import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';

/// The three callables the guided queue talks to, and nothing else.
///
/// An interface rather than a concrete class with a `@visibleForTesting`
/// constructor, because the thing worth testing about this screen is the
/// *rhythm* — a word arrives, is answered, the next one is already in hand —
/// and exercising that against `FirebaseFunctions` means a network, an
/// emulator and a signed-in user for what is a queue with an index in it. The
/// controller depends on this; a widget test overrides one provider and drives
/// the whole flow in a few milliseconds.

/// How many words one `nextQueueWords` call asks for.
///
/// ── Why the batch exists at all ──────────────────────────────────────────
/// One word per call is the obvious design and it is unusable on the
/// connections this screen is for. A callable round trip on rural mobile data
/// is a second on a good day and five on a normal one, so a member who answers
/// six words in a sitting spends half of that sitting looking at a spinner —
/// and the value of the whole flow is the rhythm of one word after another,
/// which a spinner between every pair destroys.
///
/// Twenty is enough to cover a long sitting without the prefetch ever being
/// noticed, and small enough that the batch arrives quickly and nothing is
/// wasted when somebody answers two and leaves. It matches
/// `DEFAULT_QUEUE_BATCH` on the backend, which caps the request at 50.
const int kQueueBatchSize = 20;

/// Fetch the next batch when this many buffered words are left.
///
/// Five rather than one: at one, a member on a slow connection catches up with
/// the fetch and waits anyway, which is the exact failure the buffer exists to
/// prevent. Five words is roughly a minute of answering, which is longer than
/// any round trip this app has ever measured.
const int kQueuePrefetchThreshold = 5;

/// Something the member needs told, in words they can act on.
///
/// [movePastWord] is the part that matters to the controller. Some failures
/// are about the connection and the member should try the same word again;
/// others mean *this particular word is finished* — somebody else's
/// translation was approved while this one was being typed, the member already
/// answered it on another device, the row was retired. Making the caller
/// pattern-match on `FirebaseFunctionsException.code` strings at three call
/// sites was the alternative, and it put the knowledge of which codes mean
/// "advance" in the widget layer where it does not belong.
class WordQueueFailure implements Exception {
  const WordQueueFailure(this.message, {this.movePastWord = false});

  final String message;
  final bool movePastWord;

  @override
  String toString() => 'WordQueueFailure($message)';
}

abstract class WordQueueApi {
  /// The next words this member has not already answered or skipped.
  Future<QueueBatch> next({int limit = kQueueBatchSize});

  /// Passes on a word. Cheap, unjudged and idempotent on the backend, which is
  /// what lets the screen advance before this resolves.
  Future<void> skip({
    required String wordId,
    required WordQueueSkipReason reason,
  });

  /// Answers a word. [word] is passed alongside the draft so the receipt can
  /// say which English word was just answered — the callable has no reason to
  /// echo the prompt back, and the confirmation strip is worthless without it.
  Future<WordTranslationReceipt> submit(
    QueueWord word,
    WordTranslationDraft draft,
  );
}

/// The real one.
class FirebaseWordQueueApi implements WordQueueApi {
  const FirebaseWordQueueApi(this._functions);

  final FirebaseFunctions _functions;

  /// Long enough for a cold start on a bad connection, short enough that a
  /// member is not left holding a dead screen. The queue callables scan up to
  /// a few hundred rows, so a cold `nextQueueWords` is the slowest of the
  /// three and sets the number.
  static const _timeout = Duration(seconds: 45);

  HttpsCallable _callable(String name) => _functions.httpsCallable(
    name,
    options: HttpsCallableOptions(timeout: _timeout),
  );

  @override
  Future<QueueBatch> next({int limit = kQueueBatchSize}) => _guard(() async {
    final result = await _callable('nextQueueWords')
        .call<Map<Object?, Object?>>(<String, Object?>{'limit': limit});
    return QueueBatch.fromMap(result.data);
  }, whenOffline: 'The next words did not arrive. Check your connection.');

  @override
  Future<void> skip({
    required String wordId,
    required WordQueueSkipReason reason,
  }) => _guard(() async {
    await _callable('skipQueueWord').call<Map<Object?, Object?>>(
      <String, Object?>{'wordId': wordId, 'reason': reason.wire},
    );
  }, whenOffline: 'That skip was not recorded, but you can carry on.');

  @override
  Future<WordTranslationReceipt> submit(
    QueueWord word,
    WordTranslationDraft draft,
  ) => _guard(
    () async {
      final result = await _callable('submitWordTranslation')
          .call<Map<Object?, Object?>>(draft.toPayload());
      return WordTranslationReceipt.fromMap(result.data, on: word);
    },
    whenOffline:
        'The translation was not sent. Check your connection and try again.',
  );

  /// Turns a callable's failure into something a member can read.
  ///
  /// `FirebaseFunctionsException.message` is written for whoever is reading
  /// the logs and reaches the screen as "INTERNAL" often enough that showing
  /// it raw is not an option; the codes below are the ones this backend
  /// actually raises, and each maps to a sentence that says what happened and
  /// what to do about it.
  Future<T> _guard<T>(
    Future<T> Function() run, {
    required String whenOffline,
  }) async {
    try {
      return await run();
    } on FirebaseFunctionsException catch (error) {
      throw switch (error.code) {
        // The member answered this word already — on another device, or on a
        // send that succeeded and whose reply was lost. Either way the answer
        // is in; the only wrong thing to do is make them type it again.
        'already-exists' => const WordQueueFailure(
          'You have already answered this word. Here is the next one.',
          movePastWord: true,
        ),
        // Approved, retired, or otherwise no longer open.
        'failed-precondition' || 'not-found' => const WordQueueFailure(
          'That word has left the queue. Here is the next one.',
          movePastWord: true,
        ),
        'unauthenticated' => const WordQueueFailure(
          'Sign in to send translations.',
        ),
        'resource-exhausted' => const WordQueueFailure(
          'That is a lot of words very quickly. Give it a minute and carry on.',
        ),
        // Raised when the client and the backend disagree about the word-class
        // list — see the warning at the top of parts_of_speech.dart. Said
        // plainly rather than blamed on the member, who chose from a list we
        // gave them.
        'invalid-argument' => WordQueueFailure(
          error.message?.trim().isNotEmpty == true
              ? error.message!.trim()
              : 'That answer was not accepted. Check the fields and try again.',
        ),
        _ => WordQueueFailure(whenOffline),
      };
    } on Object {
      // A timeout, a dead socket, a platform channel that gave up. All of them
      // are the connection as far as somebody holding the phone is concerned.
      throw WordQueueFailure(whenOffline);
    }
  }
}

/// Null until Firebase is up, matching every other repository in the app.
///
/// Null is not an error state here: it is what a widget test, a first launch
/// with no network and an offline device all see, and the controller turns it
/// into an honest "the queue needs a connection" card rather than a crash or
/// an empty screen that looks like the queue ran out.
final wordQueueApiProvider = Provider<WordQueueApi?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirebaseWordQueueApi(FirebaseFunctions.instance);
});
