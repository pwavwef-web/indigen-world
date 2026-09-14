import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_controller.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_tasks.dart';
import 'package:shared_preferences/shared_preferences.dart';

class PendingService extends KawuriService {
  PendingService() : super(null);
  final answers = <Completer<KawuriAnswer>>[];
  @override
  Future<KawuriAnswer> ask(List<KawuriMessage> conversation) {
    final answer = Completer<KawuriAnswer>();
    answers.add(answer);
    return answer.future;
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  Future<ProviderContainer> create(
    PendingService service, {
    String? uid,
  }) async {
    final container = ProviderContainer(
      overrides: [
        kawuriServiceProvider.overrideWithValue(service),
        currentUidProvider.overrideWithValue(uid),
      ],
    );
    addTearDown(container.dispose);
    container.read(kawuriControllerProvider);
    for (
      var i = 0;
      i < 30 && !container.read(kawuriControllerProvider).restored;
      i++
    ) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    return container;
  }

  test('new chat preserves a pending reply in its original history', () async {
    final service = PendingService();
    final container = await create(service);
    final controller = container.read(kawuriControllerProvider.notifier);
    final first = controller.send('first');
    await controller.startNewConversation();
    final second = controller.send('second');
    service.answers[0].complete(const KawuriAnswer(text: 'first answer'));
    await first;
    expect(container.read(kawuriControllerProvider).thinking, isTrue);
    expect(
      container.read(kawuriControllerProvider).messages.single.text,
      'second',
    );
    expect(
      container
          .read(kawuriControllerProvider)
          .history
          .single
          .messages
          .last
          .text,
      'first answer',
    );
    service.answers[1].complete(const KawuriAnswer(text: 'second answer'));
    await second;
    expect(
      container.read(kawuriControllerProvider).messages.last.text,
      'second answer',
    );
  });
  test(
    'duplicate sends do not create extra requests; stop ignores late result',
    () async {
      final service = PendingService();
      final container = await create(service);
      final controller = container.read(kawuriControllerProvider.notifier);
      final first = controller.send('first');
      await controller.send('duplicate');
      expect(service.answers, hasLength(1));
      controller.stop();
      service.answers.single.complete(const KawuriAnswer(text: 'late'));
      await first;
      expect(
        container.read(kawuriControllerProvider).messages.last.text,
        contains('Stopped waiting'),
      );
      expect(container.read(kawuriControllerProvider).thinking, isFalse);
    },
  );
  test(
    'history survives rename and reopening without duplicate sessions',
    () async {
      final service = PendingService();
      final container = await create(service);
      final controller = container.read(kawuriControllerProvider.notifier);
      final sent = controller.send('hello');
      service.answers.single.complete(const KawuriAnswer(text: 'hi'));
      await sent;
      await controller.startNewConversation();
      await controller.renameSession(
        container.read(kawuriControllerProvider).history.single,
        'Custom title',
      );
      await controller.openSession(
        container.read(kawuriControllerProvider).history.single,
      );
      await controller.startNewConversation();
      expect(
        container.read(kawuriControllerProvider).history.single.title,
        'Custom title',
      );
      final restored = await create(PendingService());
      expect(
        restored.read(kawuriControllerProvider).history.single.title,
        'Custom title',
      );
      await controller.deleteSession(
        container.read(kawuriControllerProvider).history.single,
      );
      expect(container.read(kawuriControllerProvider).history, isEmpty);
    },
  );
  test('account history is isolated and restores only to its owner', () async {
    final service = PendingService();
    final a = await create(service, uid: 'a');
    final sent = a.read(kawuriControllerProvider.notifier).send('private');
    service.answers.single.complete(const KawuriAnswer(text: 'reply'));
    await sent;
    final b = await create(PendingService(), uid: 'b');
    expect(b.read(kawuriControllerProvider).messages, isEmpty);
    final aAgain = await create(PendingService(), uid: 'a');
    expect(
      aAgain.read(kawuriControllerProvider).messages.first.text,
      'private',
    );
  });
  test(
    'unavailable modes preserve draft without making a provider call',
    () async {
      final service = PendingService();
      final container = await create(service);
      final controller = container.read(kawuriControllerProvider.notifier);
      controller.configure(KawuriTaskType.videoGeneration, draft: 'scene');
      await controller.send('scene');
      expect(service.answers, isEmpty);
      expect(container.read(kawuriControllerProvider).draft, 'scene');
      controller.configure(KawuriTaskType.storyHelp);
      expect(container.read(kawuriControllerProvider).draft, 'scene');
    },
  );
  test('failure preserves prompt and explicit failure status', () async {
    final service = PendingService();
    final container = await create(service);
    final sent = container
        .read(kawuriControllerProvider.notifier)
        .send('question');
    service.answers.single.completeError(StateError('network'));
    await sent;
    final state = container.read(kawuriControllerProvider);
    expect(state.messages.first.text, 'question');
    expect(state.messages.last.failed, isTrue);
    expect(state.thinking, isFalse);
  });
  test('draft mode and interrupted requests recover after reopening', () async {
    final service = PendingService();
    final container = await create(service);
    final controller = container.read(kawuriControllerProvider.notifier);
    controller.configure(
      KawuriTaskType.languagePractice,
      draft: 'greetings',
      options: {'level': 'Intermediate'},
    );
    await controller.flush();
    final restored = await create(PendingService());
    expect(restored.read(kawuriControllerProvider).draft, 'greetings');
    expect(
      restored.read(kawuriControllerProvider).options['level'],
      'Intermediate',
    );
    final pending = controller.send('question');
    await controller.flush();
    final reopened = await create(PendingService());
    expect(reopened.read(kawuriControllerProvider).thinking, isFalse);
    expect(
      reopened.read(kawuriControllerProvider).messages.last.failed,
      isTrue,
    );
    expect(
      reopened.read(kawuriControllerProvider).messages.last.text,
      contains('interrupted'),
    );
    service.answers.single.complete(const KawuriAnswer(text: 'answer'));
    await pending;
  });
}
