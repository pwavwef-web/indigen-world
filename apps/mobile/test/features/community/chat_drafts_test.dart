import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_drafts.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Unsent words in a conversation survive leaving it, and the inbox says so;
/// any message can be copied.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  ProviderContainer container({String? uid = 'me'}) {
    final created = ProviderContainer(
      overrides: [currentUidProvider.overrideWithValue(uid)],
    );
    addTearDown(created.dispose);
    created.read(chatDraftsProvider);
    return created;
  }

  group('the store', () {
    test('keeps a draft per conversation and forgets a blank one', () async {
      final store = container();
      final drafts = store.read(chatDraftsProvider.notifier);
      await drafts.save('a_me', 'I will come at');
      await drafts.save('b_me', 'Thank you');
      expect(await drafts.read('a_me'), 'I will come at');
      expect(store.read(chatDraftsProvider).keys, {'a_me', 'b_me'});

      await drafts.save('a_me', '   ');
      expect(await drafts.read('a_me'), isNull);
      await drafts.clear('b_me');
      expect(store.read(chatDraftsProvider), isEmpty);
    });

    test('a draft survives the app closing', () async {
      await container().read(chatDraftsProvider.notifier).save('a_me', 'Hello');
      final reopened = container();
      expect(
        await reopened.read(chatDraftsProvider.notifier).read('a_me'),
        'Hello',
      );
    });

    test('one account never sees another\'s unsent words', () async {
      await container(uid: 'amina')
          .read(chatDraftsProvider.notifier)
          .save('t', 'private');
      final kofi = container(uid: 'kofi');
      expect(await kofi.read(chatDraftsProvider.notifier).read('t'), isNull);
    });

    test('the oldest draft goes once there are too many', () async {
      final drafts = container().read(chatDraftsProvider.notifier);
      for (var index = 0; index <= maxChatDrafts; index++) {
        await drafts.save('thread_$index', 'draft $index');
      }
      expect(await drafts.read('thread_0'), isNull);
      expect(
        await drafts.read('thread_$maxChatDrafts'),
        'draft $maxChatDrafts',
      );
    });
  });

  Widget app(Widget home, {List<ChatThread> inbox = const []}) => ProviderScope(
    overrides: [
      currentUidProvider.overrideWithValue('me'),
      chatRepositoryProvider.overrideWithValue(null),
      chatInboxProvider.overrideWith((ref) => Stream.value(inbox)),
      chatMessagesProvider.overrideWith(
        (ref, threadId) => Stream.value(const [
          ChatMessage(id: 'm1', senderId: 'amina', text: 'Meet at Paga, 3pm'),
          ChatMessage(id: 'm2', senderId: 'me', text: 'See you there'),
        ]),
      ),
      communityProfileProvider.overrideWith((ref, uid) => Stream.value(null)),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: buildIndigenTheme(),
      home: home,
    ),
  );

  testWidgets('the inbox shows a half-written reply as a draft', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      chatDraftsKey('me'): '{"amina_me":"I will bring the"}',
    });
    await tester.pumpWidget(
      app(
        const MessagesScreen(),
        inbox: const [
          ChatThread(
            id: 'amina_me',
            other: ChatParticipant(
              uid: 'amina',
              displayName: 'Amina',
              username: 'amina',
            ),
            unreadCount: 0,
            lastMessage: 'Meet at Paga, 3pm',
          ),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.textContaining('Draft: '), findsOneWidget);
    expect(find.textContaining('I will bring the'), findsOneWidget);
    expect(find.textContaining('Meet at Paga'), findsNothing);
  });

  testWidgets('a conversation reopens with what was being written', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      chatDraftsKey('me'): '{"amina_me":"I will bring the"}',
    });
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('I will bring the'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'I will bring the drums');
    await tester.pump(const Duration(milliseconds: 500));
    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getString(chatDraftsKey('me')),
      contains('I will bring the drums'),
    );
  });

  testWidgets('any message can be copied; only your own deleted', (
    tester,
  ) async {
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add((call.arguments as Map)['text'] as String);
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.longPress(find.text('Meet at Paga, 3pm'));
    await tester.pumpAndSettle();
    expect(find.text('Copy text'), findsOneWidget);
    expect(find.text('Delete'), findsNothing);
    await tester.tap(find.text('Copy text'));
    await tester.pumpAndSettle();
    expect(copied, ['Meet at Paga, 3pm']);
    // The toast that confirms it.
    await tester.pump(const Duration(seconds: 3));
    unawaited(tester.binding.delayed(const Duration(seconds: 1)));
    await tester.pumpAndSettle();

    await tester.longPress(find.text('See you there'));
    await tester.pumpAndSettle();
    expect(find.text('Copy text'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);
  });
}
