import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_offline_guide.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';

void main() {
  KawuriMessage you(String text) => KawuriMessage(
    id: text,
    role: KawuriRole.you,
    text: text,
    sentAt: DateTime(2026, 8, 23),
  );

  KawuriMessage kawuri(String text) => KawuriMessage(
    id: text,
    role: KawuriRole.kawuri,
    text: text,
    sentAt: DateTime(2026, 8, 23),
  );

  group('offlineGuideAnswer', () {
    test('answers app questions it genuinely knows', () {
      final answer = offlineGuideAnswer('How do I contribute a word?');
      expect(answer, contains('Contributing a word'));
      expect(answer, contains('Contribute tab'));
      expect(answer, isNot(contains('points')));
    });

    test('never guesses at Kasem', () {
      // The whole governance model exists to keep unverified language out. A
      // fallback that improvises a translation would be the single worst thing
      // this feature could do.
      final answer = offlineGuideAnswer('How do you say thank you in Kasem?');
      expect(answer, contains('will not guess'));
      expect(answer, contains('dictionary'));
      expect(answer, contains('Community tab'));
    });

    test('says what it can do when it does not recognise the question', () {
      final answer = offlineGuideAnswer('Tell me about quantum mechanics');
      expect(answer, contains('I am Kawuri'));
      expect(answer, contains('Right now I can help with'));
    });

    test('always names that it is working from what is on the phone', () {
      for (final question in const [
        'How do I contribute?',
        'How do you say hello?',
        'Something else entirely',
      ]) {
        expect(
          offlineGuideAnswer(question),
          contains('lives on your phone'),
          reason: question,
        );
      }
    });

    test('an empty question gets the capability statement, not a preamble', () {
      final answer = offlineGuideAnswer('   ');
      expect(answer, startsWith('I am Kawuri'));
    });

    test('explains open publishing when asked about Explore', () {
      final answer = offlineGuideAnswer('How does Explore work?');
      expect(answer, contains('do not need to be verified'));
      expect(answer, contains('Campaigns are the exception'));
      expect(answer, isNot(contains('rewards')));
    });
  });

  group('KawuriService.recentTurns', () {
    test('keeps the whole thread when it is short', () {
      final turns = [you('one'), kawuri('two')];
      expect(KawuriService.recentTurns(turns), turns);
    });

    test('keeps the tail, not the head, when the thread is long', () {
      // The recent turns are the ones carrying the thread; dropping them would
      // make Kawuri answer a question two topics ago.
      final turns = [
        for (var index = 0; index < 30; index++) you('turn $index'),
      ];
      final recent = KawuriService.recentTurns(turns);
      expect(recent, hasLength(KawuriService.contextWindow));
      expect(recent.last.text, 'turn 29');
      expect(recent.first.text, 'turn ${30 - KawuriService.contextWindow}');
    });

    test('drops blank turns rather than sending empty parts', () {
      final recent = KawuriService.recentTurns([
        you('real'),
        you('   '),
        kawuri(''),
      ]);
      expect(recent.map((message) => message.text), ['real']);
    });
  });

  group('KawuriSession.titleFor', () {
    test('titles a conversation by its opening question', () {
      expect(
        KawuriSession.titleFor([you('What is the Fao festival?')]),
        'What is the Fao festival?',
      );
    });

    test('ignores an opening answer and finds the first question', () {
      expect(
        KawuriSession.titleFor([kawuri('Hello'), you('Tell me about Paga')]),
        'Tell me about Paga',
      );
    });

    test('collapses whitespace and truncates a long opening', () {
      final title = KawuriSession.titleFor([
        you(
          '  a  question   that runs on well past what a list row can show '
          'without wrapping into three lines ',
        ),
      ]);
      expect(title.length, lessThanOrEqualTo(42));
      expect(title, endsWith('…'));
      expect(title, isNot(contains('  ')));
    });

    test('a conversation with nothing asked still gets a name', () {
      expect(KawuriSession.titleFor(const []), 'New conversation');
      expect(KawuriSession.titleFor([kawuri('hi')]), 'New conversation');
    });
  });

  group('session round-trip', () {
    test('survives being written to and read back from preferences', () {
      final session = KawuriSession(
        id: 's1',
        title: 'Greetings',
        messages: [you('How do greetings work?'), kawuri('Elders first.')],
        updatedAt: DateTime(2026, 8, 23, 12),
      );

      final restored = KawuriSession.fromJson(session.toJson())!;
      expect(restored.id, 's1');
      expect(restored.title, 'Greetings');
      expect(restored.messages.map((m) => m.text), [
        'How do greetings work?',
        'Elders first.',
      ]);
      expect(restored.messages.first.isYou, isTrue);
      expect(restored.messages.last.isYou, isFalse);
      expect(restored.updatedAt, DateTime(2026, 8, 23, 12));
    });

    test('a session with no usable messages decodes to nothing', () {
      expect(
        KawuriSession.fromJson({'id': 'x', 'messages': <Object?>[]}),
        isNull,
      );
      expect(KawuriSession.fromJson({'id': 'x'}), isNull);
    });

    test('the offline flag round-trips so the label is not lost', () {
      final message = KawuriMessage(
        id: 'm',
        role: KawuriRole.kawuri,
        text: 'From the guide.',
        sentAt: DateTime(2026, 8, 23),
        fromOfflineGuide: true,
      );
      expect(KawuriMessage.fromJson(message.toJson()).fromOfflineGuide, isTrue);
    });
  });
}
