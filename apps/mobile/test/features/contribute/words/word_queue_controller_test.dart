// The buffer, which is the only reason the guided queue is worth building.
//
// Everything visible on the screen is a form. What makes the flow work is that
// answering a word and getting the next one is instant, and that is only true
// if the next one was already on the phone. So these tests are about the
// invisible half: twenty fetched at a time, served one at a time, topped up
// while five are still in hand, and four different honest things to say when
// there is nothing left.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_controller.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_models.dart';
import 'package:indigen_world_mobile/features/contribute/words/data/word_queue_repository.dart';

import 'fake_word_queue_api.dart';

/// Keeps the auto-disposed controller alive for the length of a test and hands
/// back a container to read it through.
///
/// The listener is not optional: [wordQueueControllerProvider] disposes itself
/// the moment nothing is watching, and a bare `read` in a loop would build a
/// fresh controller — and fire a fresh first fetch — on every line of the test.
ProviderContainer harness(WordQueueApi api) {
  final container = ProviderContainer(
    overrides: [wordQueueApiProvider.overrideWithValue(api)],
  );
  addTearDown(container.dispose);
  container.listen(wordQueueControllerProvider, (_, _) {});
  return container;
}

WordQueueState read(ProviderContainer container) =>
    container.read(wordQueueControllerProvider);

WordQueueController driver(ProviderContainer container) =>
    container.read(wordQueueControllerProvider.notifier);

void main() {
  test('the first batch arrives and the first word is on screen', () async {
    final api = FakeWordQueueApi([batchOf(20)]);
    final container = harness(api);
    await pumpEventQueue();

    final state = read(container);
    expect(state.stage, WordQueueStage.ready);
    expect(state.word?.word, 'word-0');
    // Nineteen more already in hand, which is the whole point.
    expect(state.buffered, 19);
    expect(api.nextCalls, 1);
  });

  test('a whole batch is served without going back to the network', () async {
    final api = FakeWordQueueApi([batchOf(20)]);
    final container = harness(api);
    await pumpEventQueue();

    // Fourteen skips leaves five buffered, which is the threshold — so the
    // fetch that follows is the prefetch, not a stall.
    for (var index = 0; index < 14; index++) {
      await driver(container).skip(WordQueueSkipReason.unknown);
    }
    await pumpEventQueue();

    expect(read(container).word?.word, 'word-14');
    expect(api.nextCalls, 2, reason: 'topped up at the threshold, not before');
  });

  test('the top-up lands before the member ever waits', () async {
    final api = FakeWordQueueApi([batchOf(20), batchOf(20, from: 20)]);
    final container = harness(api);
    await pumpEventQueue();

    for (var index = 0; index < 19; index++) {
      await driver(container).skip(WordQueueSkipReason.unsure);
    }
    await pumpEventQueue();

    final state = read(container);
    // The twentieth word is on screen and there are twenty behind it: the
    // member has never seen a spinner between two words.
    expect(state.stage, WordQueueStage.ready);
    expect(state.word?.word, 'word-19');
    expect(state.buffered, 20);
    expect(state.skipped, 19);
  });

  test('a top-up that repeats words already served drops the repeats', () async {
    // `nextQueueWords` filters on what the member has answered or skipped,
    // which is written when they act — so a prefetch fired while five words
    // are still unanswered asks a backend that has not heard about those five.
    final api = FakeWordQueueApi([batchOf(8), batchOf(8, from: 5)]);
    final container = harness(api);
    await pumpEventQueue();

    for (var index = 0; index < 3; index++) {
      await driver(container).skip(WordQueueSkipReason.unknown);
    }
    await pumpEventQueue();

    // Eight fetched, eight more offered of which three had already been
    // served: thirteen distinct words, three skipped, one on screen, nine
    // behind it. Without the drop it would be sixteen, and three of them
    // would come round a second time inside the same sitting.
    expect(read(container).buffered, 9);
    expect(read(container).word?.word, 'word-3');
  });

  test('the end of the queue is called an end, not an absence', () async {
    final api = FakeWordQueueApi([
      batchOf(2),
      const QueueBatch(words: <QueueWord>[], exhausted: true),
    ]);
    final container = harness(api);
    await pumpEventQueue();

    await driver(container).skip(WordQueueSkipReason.unknown);
    await driver(container).skip(WordQueueSkipReason.unknown);
    await pumpEventQueue();

    expect(read(container).stage, WordQueueStage.finished);
  });

  test('an empty reply that is not the end says so differently', () async {
    // The backend sets `exhausted` only when the scan reached the actual end
    // of the open rows. An empty batch without it means the scan ran out of
    // budget, and telling somebody they had finished the whole queue would be
    // a much stronger claim than anything we know.
    final api = FakeWordQueueApi([batchOf(1), QueueBatch.empty]);
    final container = harness(api);
    await pumpEventQueue();

    await driver(container).skip(WordQueueSkipReason.unsure);
    await pumpEventQueue();

    expect(read(container).stage, WordQueueStage.quiet);
  });

  test(
    'a stalled queue stops asking rather than spinning at the limiter',
    () async {
      final api = FakeWordQueueApi([batchOf(1), QueueBatch.empty]);
      final container = harness(api);
      await pumpEventQueue();
      await driver(container).skip(WordQueueSkipReason.unsure);
      await pumpEventQueue();

      final settled = api.nextCalls;
      await pumpEventQueue();
      expect(api.nextCalls, settled);

      // And Try again does ask, and recovers.
      api.queue.add(batchOf(3, from: 90));
      await driver(container).refresh();
      await pumpEventQueue();
      expect(read(container).stage, WordQueueStage.ready);
      expect(read(container).word?.word, 'word-90');
    },
  );

  test('no Firebase is an honest empty queue, not a crash', () async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    container.listen(wordQueueControllerProvider, (_, _) {});
    await pumpEventQueue();

    // `wordQueueApiProvider` is null when Firebase never came up, which is
    // what a widget test and a first offline launch both see.
    expect(read(container).stage, WordQueueStage.unavailable);
    expect(read(container).word, isNull);
  });

  test(
    'a first fetch that fails offers a retry rather than an empty screen',
    () async {
      final api = FakeWordQueueApi(
        [],
        failNextWith: const WordQueueFailure(
          'The next words did not arrive. Check your connection.',
        ),
      );
      final container = harness(api);
      await pumpEventQueue();

      expect(read(container).stage, WordQueueStage.failed);
      expect(read(container).message, contains('did not arrive'));

      api
        ..failNextWith = null
        ..queue.add(batchOf(2));
      await driver(container).refresh();
      await pumpEventQueue();
      expect(read(container).stage, WordQueueStage.ready);
    },
  );

  test('a top-up that fails is not told to a member mid-word', () async {
    final api = FakeWordQueueApi([batchOf(3)]);
    final container = harness(api);
    await pumpEventQueue();

    api.failNextWith = const WordQueueFailure('nothing arrived');
    await driver(container).skip(WordQueueSkipReason.unknown);
    await pumpEventQueue();

    // There is still a word to answer, so nothing has gone wrong from where
    // the member is sitting.
    expect(read(container).stage, WordQueueStage.ready);
    expect(read(container).message, isNull);
  });

  group('submitting', () {
    test('advances, counts the sitting, and keeps the receipt', () async {
      final api = FakeWordQueueApi([batchOf(3)]);
      final container = harness(api);
      await pumpEventQueue();

      final sent = await driver(container).submit(
        const WordTranslationDraft(
          wordId: 'id-0',
          translations: ['kʋm', 'na-kʋm'],
          partOfSpeech: 'noun',
          dialect: 'Navrongo',
        ),
      );

      expect(sent, isTrue);
      final state = read(container);
      expect(state.answered, 1);
      expect(state.word?.word, 'word-1');
      expect(state.receipt?.word, 'word-0');
      expect(state.receipt?.translations, ['kʋm', 'na-kʋm']);
      // Ten points a word, and only if a reviewer approves it.
      expect(state.pointsIfApproved, kApprovedWordPoints);
      expect(api.submissions.single.partOfSpeech, 'noun');
    });

    test('a failure keeps the word so the answer is not retyped', () async {
      final api = FakeWordQueueApi([batchOf(3)])
        ..failSubmitWith = const WordQueueFailure(
          'The translation was not sent.',
        );
      final container = harness(api);
      await pumpEventQueue();

      final sent = await driver(container).submit(
        const WordTranslationDraft(
          wordId: 'id-0',
          translations: ['kʋm'],
          partOfSpeech: 'noun',
          dialect: 'Paga',
        ),
      );

      expect(sent, isFalse);
      expect(read(container).word?.word, 'word-0');
      expect(read(container).answered, 0);
      expect(read(container).message, contains('was not sent'));
    });

    test(
      'a word that has left the queue moves on rather than looping',
      () async {
        // Approved elsewhere, retired, or already answered by this member on
        // another device. Keeping it on screen would invite a retry that can
        // only fail the same way.
        final api = FakeWordQueueApi([batchOf(3)])
          ..failSubmitWith = const WordQueueFailure(
            'That word has left the queue. Here is the next one.',
            movePastWord: true,
          );
        final container = harness(api);
        await pumpEventQueue();

        await driver(container).submit(
          const WordTranslationDraft(
            wordId: 'id-0',
            translations: ['kʋm'],
            partOfSpeech: 'noun',
            dialect: 'Paga',
          ),
        );

        expect(read(container).word?.word, 'word-1');
        // Not counted: nothing was contributed.
        expect(read(container).answered, 0);
      },
    );
  });

  test('skipping records the reason it was given', () async {
    final api = FakeWordQueueApi([batchOf(3)]);
    final container = harness(api);
    await pumpEventQueue();

    await driver(container).skip(WordQueueSkipReason.unsure);
    await pumpEventQueue();

    expect(api.skips.single.$1, 'id-0');
    // The two reasons are different signal and the backend keeps them apart:
    // a word a hundred people did not know may not be Kasem at all, while a
    // hundred "not sure enough" marks say the sentence is bad.
    expect(api.skips.single.$2, WordQueueSkipReason.unsure);
  });
}
