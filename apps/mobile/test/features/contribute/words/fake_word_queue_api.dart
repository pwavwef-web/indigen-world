// A word queue with no network in it.
//
// [WordQueueApi] is an interface rather than a class with a test constructor
// precisely so this can exist: the thing worth testing about the guided queue
// is the rhythm — a word arrives, is answered, the next one is already in hand
// — and exercising that against `FirebaseFunctions` would need an emulator, a
// signed-in user and several seconds for what is a list with an index into it.

import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';

/// [count] consecutive words, numbered from [from] so two batches can be made
/// to overlap — which is exactly what a real prefetch does, because
/// `nextQueueWords` filters on progress the member has not written yet.
QueueBatch batchOf(int count, {int from = 0, bool exhausted = false}) =>
    QueueBatch(
      words: [
        for (var index = from; index < from + count; index++)
          QueueWord(
            id: 'id-$index',
            word: 'word-$index',
            sentence: 'A sentence containing word-$index.',
            sentenceSource: 'tatoeba',
            attribution: QueueWordAttribution(
              tatoebaId: '${1000 + index}',
              contributor: 'CK',
              licence: 'CC BY 2.0 FR',
            ),
            rank: index + 1,
          ),
      ],
      exhausted: exhausted,
    );

class FakeWordQueueApi implements WordQueueApi {
  FakeWordQueueApi(
    List<QueueBatch> batches, {
    this.failNextWith,
    this.failSubmitWith,
  }) : queue = [...batches];

  /// Handed out one call at a time. Empty means an empty, non-exhausted reply
  /// — the "the scan ran out of budget" case the backend is careful about.
  final List<QueueBatch> queue;

  /// Set to make the next fetch fail; cleared to let it recover.
  WordQueueFailure? failNextWith;
  WordQueueFailure? failSubmitWith;

  var nextCalls = 0;
  final skips = <(String, WordQueueSkipReason)>[];
  final submissions = <WordTranslationDraft>[];

  @override
  Future<QueueBatch> next({int limit = kQueueBatchSize}) async {
    nextCalls++;
    final failure = failNextWith;
    if (failure != null) throw failure;
    return queue.isEmpty ? QueueBatch.empty : queue.removeAt(0);
  }

  @override
  Future<void> skip({
    required String wordId,
    required WordQueueSkipReason reason,
  }) async {
    skips.add((wordId, reason));
  }

  @override
  Future<WordTranslationReceipt> submit(
    QueueWord word,
    WordTranslationDraft draft,
  ) async {
    final failure = failSubmitWith;
    if (failure != null) throw failure;
    submissions.add(draft);
    return WordTranslationReceipt(
      wordId: word.id,
      word: word.word,
      contributionId: 'contribution-${submissions.length}',
      translations: draft.translations,
    );
  }
}
