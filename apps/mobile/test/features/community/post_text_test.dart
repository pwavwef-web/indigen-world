import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/widgets/post_text.dart';

void main() {
  group('mentionPattern', () {
    // The pattern has to agree with `mentionedHandles` in
    // services/functions/src/community-notifications.ts. If the app highlights
    // something the backend does not notify — or the reverse — a member either
    // sees a dead link or is pinged with no visible reason.
    List<String> handles(String text) => PostText.mentionPattern
        .allMatches(text)
        .map((match) => match.group(1)!.toLowerCase())
        .toList();

    test('finds handles at the start, middle and in punctuation', () {
      expect(handles('@amina_paga de zaanem'), ['amina_paga']);
      expect(handles('ko gara @nyaaba'), ['nyaaba']);
      expect(handles('(@nyaaba) said so'), ['nyaaba']);
      expect(handles('@amina and @nyaaba'), ['amina', 'nyaaba']);
    });

    test('does not treat an email address as a mention', () {
      expect(handles('write to me@example.com'), isEmpty);
      expect(handles('a@b.co'), isEmpty);
    });

    test('respects the registry handle length', () {
      expect(handles('@ab'), isEmpty);
      expect(handles('@abc'), ['abc']);
    });
  });

  group('PostText', () {
    testWidgets('renders the whole body, mentions included', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildIndigenTheme(),
          home: const Scaffold(
            body: PostText(
              text: 'De zaanem @nyaaba, ko gara.',
              onOpenHandle: null,
            ),
          ),
        ),
      );
      await tester.pump();

      final text = tester.widget<Text>(find.byType(Text));
      expect(text.textSpan!.toPlainText(), 'De zaanem @nyaaba, ko gara.');
    });

    testWidgets('a mention reports the handle it was tapped for', (
      tester,
    ) async {
      final tapped = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: buildIndigenTheme(),
          home: Scaffold(
            body: PostText(
              text: 'Ask @Nyaaba about it',
              onOpenHandle: tapped.add,
            ),
          ),
        ),
      );
      await tester.pump();

      // Handles are stored lowercase in the registry, so the lookup has to be
      // lowercase however the member typed it.
      final span = tester.widget<Text>(find.byType(Text)).textSpan!;
      var recognizerFound = false;
      span.visitChildren((child) {
        final recognizer = child is TextSpan ? child.recognizer : null;
        if (recognizer is TapGestureRecognizer) {
          recognizerFound = true;
          recognizer.onTap!();
        }
        return true;
      });

      expect(recognizerFound, isTrue);
      expect(tapped, ['nyaaba']);
    });

    testWidgets('text with no mention still renders as one plain body', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildIndigenTheme(),
          home: const Scaffold(
            body: PostText(text: 'Ko gara.', onOpenHandle: null),
          ),
        ),
      );
      await tester.pump();

      expect(
        tester.widget<Text>(find.byType(Text)).textSpan!.toPlainText(),
        'Ko gara.',
      );
    });

    testWidgets('a web link is tappable without swallowing punctuation', (
      tester,
    ) async {
      final opened = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          theme: buildIndigenTheme(),
          home: Scaffold(
            body: PostText(
              text: 'Read https://indigenworld.com/learn, then return.',
              onOpenHandle: null,
              onOpenLink: opened.add,
            ),
          ),
        ),
      );
      await tester.pump();

      final span = tester.widget<Text>(find.byType(Text)).textSpan!;
      span.visitChildren((child) {
        final recognizer = child is TextSpan ? child.recognizer : null;
        if (recognizer is TapGestureRecognizer) recognizer.onTap!();
        return true;
      });
      expect(opened, ['https://indigenworld.com/learn']);
    });
  });
}
