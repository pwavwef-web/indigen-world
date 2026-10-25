// Conversations in 0.1.36: replies that quote, "Seen", day headings, mute,
// the way back past the newest hundred messages, and a searchable inbox.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/chat_screen.dart';
import 'package:indigen_world_mobile/features/community/data/chat_providers.dart';
import 'package:indigen_world_mobile/features/community/data/chat_repository.dart';
import 'package:indigen_world_mobile/features/community/data/community_providers.dart';
import 'package:indigen_world_mobile/features/community/messages_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _amina = ChatParticipant(
  uid: 'amina',
  displayName: 'Amina',
  username: 'amina',
);

ChatThread _thread(
  String id,
  String name, {
  String last = '',
  bool muted = false,
}) => ChatThread(
  id: id,
  other: ChatParticipant(
    uid: id,
    displayName: name,
    username: name.toLowerCase(),
  ),
  unreadCount: 0,
  lastMessage: last,
  muted: muted,
);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues(const {}));

  group('quoted replies', () {
    test('a long message is cut to an excerpt on one line', () {
      final long = List.filled(60, 'word').join('\n');
      final excerpt = ChatReplyRef.excerptOf(long);
      expect(excerpt.runes.length, ChatReplyRef.maxExcerpt);
      expect(excerpt.endsWith('…'), isTrue);
      expect(excerpt.contains('\n'), isFalse);
      expect(ChatReplyRef.excerptOf('  short  one '), 'short one');
    });

    test('a reply stamp survives the trip through a document', () {
      const reply = ChatReplyRef(
        messageId: 'm1',
        senderId: 'amina',
        excerpt: 'Meet at three',
      );
      final back = ChatReplyRef.fromMap(reply.toMap())!;
      expect(back.messageId, 'm1');
      expect(back.senderId, 'amina');
      expect(back.excerpt, 'Meet at three');
      expect(ChatReplyRef.fromMap({'id': 1}), isNull);
      expect(ChatReplyRef.fromMap(null), isNull);
    });
  });

  group('Seen', () {
    final sent = DateTime(2026, 10, 25, 9);
    final mine = ChatMessage(
      id: 'm',
      senderId: 'me',
      text: 'hi',
      createdAt: sent,
    );

    test('appears once the other side read after it was sent', () {
      expect(
        chatMessageSeen(
          newestMine: mine,
          otherReadAt: sent.add(const Duration(minutes: 1)),
        ),
        isTrue,
      );
      expect(
        chatMessageSeen(
          newestMine: mine,
          otherReadAt: sent.subtract(const Duration(minutes: 1)),
        ),
        isFalse,
      );
    });

    test('never without a read time, or for a message still sending', () {
      expect(chatMessageSeen(newestMine: mine, otherReadAt: null), isFalse);
      expect(
        chatMessageSeen(
          newestMine: const ChatMessage(id: 'x', senderId: 'me', text: 'hi'),
          otherReadAt: sent,
        ),
        isFalse,
      );
    });
  });

  group('day headings', () {
    final now = DateTime(2026, 10, 25, 18);
    ChatMessage at(DateTime when) =>
        ChatMessage(id: '$when', senderId: 'a', text: 't', createdAt: when);

    test('Today, Yesterday, then the weekday and date', () {
      expect(
        chatDayLabel(at(DateTime(2026, 10, 25, 9)), null, now: now),
        'Today',
      );
      expect(
        chatDayLabel(at(DateTime(2026, 10, 24, 9)), null, now: now),
        'Yesterday',
      );
      expect(
        chatDayLabel(at(DateTime(2026, 10, 20, 9)), null, now: now),
        'Tue 20 Oct',
      );
      expect(
        chatDayLabel(at(DateTime(2025, 12, 30, 9)), null, now: now),
        'Tue 30 Dec 2025',
      );
    });

    test('no heading between two messages of the same day', () {
      expect(
        chatDayLabel(
          at(DateTime(2026, 10, 25, 11)),
          at(DateTime(2026, 10, 25, 9)),
          now: now,
        ),
        isNull,
      );
    });
  });

  test('the inbox filter matches name, handle and last message', () {
    final thread = _thread('k', 'Kofi', last: 'The drums are ready');
    expect(thread.matches(''), isTrue);
    expect(thread.matches('kof'), isTrue);
    expect(thread.matches('@kofi'), isTrue);
    expect(thread.matches('DRUMS'), isTrue);
    expect(thread.matches('flute'), isFalse);
  });

  Widget app(
    Widget home, {
    List<ChatThread> inbox = const [],
    List<ChatMessage> messages = const [],
    ChatThread? live,
  }) => ProviderScope(
    overrides: [
      currentUidProvider.overrideWithValue('me'),
      chatRepositoryProvider.overrideWithValue(null),
      chatInboxProvider.overrideWith((ref) => Stream.value(inbox)),
      chatMessagesProvider.overrideWith(
        (ref, threadId) => Stream.value(messages),
      ),
      chatThreadLiveProvider.overrideWith(
        (ref, threadId) => Stream.value(live),
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

  testWidgets('a reply quotes what it answers, and the day is headed', (
    tester,
  ) async {
    final today = DateTime.now();
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
        messages: [
          ChatMessage(
            id: 'm2',
            senderId: 'me',
            text: 'See you there',
            createdAt: today,
            replyTo: const ChatReplyRef(
              messageId: 'm1',
              senderId: 'amina',
              excerpt: 'Meet at the market at three',
            ),
          ),
          ChatMessage(
            id: 'm1',
            senderId: 'amina',
            text: 'Meet at the market at three',
            createdAt: today.subtract(const Duration(minutes: 5)),
          ),
        ],
        live: ChatThread(
          id: 'amina_me',
          other: _amina,
          unreadCount: 0,
          otherReadAt: today.add(const Duration(minutes: 1)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const Key('chat-quote')), findsOneWidget);
    expect(find.text('Amina'), findsWidgets);
    expect(find.text('Today'), findsOneWidget);
    // Read after the newest message, which is mine.
    expect(find.byKey(const Key('chat-seen')), findsOneWidget);

    // Long press offers Reply, which raises the reply bar.
    await tester.longPress(find.text('Meet at the market at three').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('chat-menu-reply')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('chat-reply-bar')), findsOneWidget);
    expect(find.text('Replying to Amina'), findsOneWidget);
    await tester.tap(find.byKey(const Key('chat-reply-cancel')));
    await tester.pump();
    expect(find.byKey(const Key('chat-reply-bar')), findsNothing);
  });

  testWidgets('Seen is not shown when read receipts are off', (tester) async {
    SharedPreferences.setMockInitialValues({
      chatReadReceiptsPreferenceKey: false,
    });
    final now = DateTime.now();
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
        messages: [
          ChatMessage(id: 'm', senderId: 'me', text: 'Hello', createdAt: now),
        ],
        live: ChatThread(
          id: 'amina_me',
          other: _amina,
          unreadCount: 0,
          otherReadAt: now.add(const Duration(minutes: 1)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('chat-seen')), findsNothing);
  });

  testWidgets('a muted conversation says so, and offers to unmute', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
        live: const ChatThread(
          id: 'amina_me',
          other: _amina,
          unreadCount: 0,
          muted: true,
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('chat-muted-icon')), findsOneWidget);
    await tester.tap(find.byKey(const Key('chat-menu')));
    await tester.pumpAndSettle();
    expect(find.text('Unmute alerts'), findsOneWidget);
  });

  testWidgets('a full window offers the messages before it', (tester) async {
    final now = DateTime.now();
    await tester.pumpWidget(
      app(
        const ChatScreen(
          threadId: 'amina_me',
          otherUid: 'amina',
          otherName: 'Amina',
        ),
        messages: [
          for (var index = 0; index < ChatRepository.messagePageSize; index++)
            ChatMessage(
              id: 'm$index',
              senderId: index.isEven ? 'me' : 'amina',
              text: 'message $index',
              createdAt: now.subtract(Duration(minutes: index)),
            ),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.scrollUntilVisible(
      find.byKey(const Key('chat-load-earlier')),
      600,
      scrollable: find.descendant(
        of: find.byKey(const Key('chat-messages')),
        matching: find.byType(Scrollable),
      ),
    );
    expect(find.byKey(const Key('chat-load-earlier')), findsOneWidget);
  });

  testWidgets('the inbox narrows as somebody types, and shows who is muted', (
    tester,
  ) async {
    await tester.pumpWidget(
      app(
        const MessagesScreen(),
        inbox: [
          _thread('a', 'Amina', last: 'See you at three'),
          _thread('b', 'Kofi', last: 'The drums', muted: true),
          _thread('c', 'Esi'),
          _thread('d', 'Yaw'),
          _thread('e', 'Abena'),
          _thread('f', 'Kwame'),
        ],
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const ValueKey('inbox-muted-b')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('inbox-search')), 'drums');
    await tester.pump();
    expect(find.text('Kofi'), findsOneWidget);
    expect(find.text('Amina'), findsNothing);

    await tester.enterText(find.byKey(const Key('inbox-search')), 'nobody');
    await tester.pump();
    expect(find.text('No conversation matches'), findsOneWidget);
  });
}
