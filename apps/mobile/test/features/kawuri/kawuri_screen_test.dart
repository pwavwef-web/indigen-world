import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_models.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_screen.dart';
import 'package:indigen_world_mobile/features/kawuri/kawuri_service.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A stand-in for the callable so no test ever reaches Firebase.
class FakeKawuriService implements KawuriService {
  FakeKawuriService({required this.answer, this.fromOfflineGuide = false});

  final String answer;
  final bool fromOfflineGuide;
  final asked = <List<KawuriMessage>>[];

  @override
  FirebaseFunctions? get functions => null;

  @override
  Future<KawuriAnswer> ask(List<KawuriMessage> conversation) async {
    asked.add(List.of(conversation));
    return KawuriAnswer(text: answer, fromOfflineGuide: fromOfflineGuide);
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<FakeKawuriService> pump(
    WidgetTester tester, {
    String answer = 'Elders are greeted first.',
    bool fromOfflineGuide = false,
  }) async {
    final service = FakeKawuriService(
      answer: answer,
      fromOfflineGuide: fromOfflineGuide,
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [kawuriServiceProvider.overrideWithValue(service)],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          theme: buildIndigenTheme(),
          home: const KawuriScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    return service;
  }

  testWidgets('opens on a welcome with starters, not an empty box', (
    tester,
  ) async {
    await pump(tester);

    expect(find.text('Kawuri'), findsOneWidget);
    expect(find.text('Ask me anything.'), findsOneWidget);
    expect(find.text('Greetings'), findsOneWidget);
    expect(find.text('Festivals'), findsOneWidget);
    expect(find.text('Ask Kawuri…'), findsOneWidget);
  });

  testWidgets('says plainly that it can be wrong about the language', (
    tester,
  ) async {
    // The dictionary and the community are the record; the assistant is not.
    await pump(tester);

    expect(find.textContaining('Kawuri can be wrong'), findsOneWidget);
  });

  testWidgets('asking a question shows both turns', (tester) async {
    final service = await pump(tester);

    await tester.enterText(find.byType(TextField), 'How do greetings work?');
    await tester.pump();
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('How do greetings work?'), findsOneWidget);
    expect(find.text('Elders are greeted first.'), findsOneWidget);
    expect(service.asked, hasLength(1));
    expect(service.asked.single.single.text, 'How do greetings work?');
  });

  testWidgets('a starter chip asks its full prompt', (tester) async {
    final service = await pump(tester);

    await tester.tap(find.text('Festivals'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(service.asked, hasLength(1));
    expect(service.asked.single.single.text, contains('Fao festival'));
  });

  testWidgets('an answer from the on-device guide is labelled as one', (
    tester,
  ) async {
    // A fallback that looked like a full answer would quietly mislead.
    await pump(
      tester,
      answer: 'Here is what I can tell you from your phone.',
      fromOfflineGuide: true,
    );

    await tester.enterText(find.byType(TextField), 'anything');
    await tester.pump();
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Answered from what is on your phone'), findsOneWidget);
  });

  testWidgets('the send button stays inert until there is something to send', (
    tester,
  ) async {
    await pump(tester);

    expect(find.byIcon(Icons.arrow_upward_rounded), findsOneWidget);
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // Nothing was sent, so the welcome is still on screen.
    expect(find.text('Ask me anything.'), findsOneWidget);
  });

  testWidgets('Kawuri answers on the same ground as your own turn', (
    tester,
  ) async {
    // The answer bubble used to be a near-white card. This screen is always
    // the night theme, so the palette ink inside it resolved to near-white too
    // and the reply was white on white — unreadable rather than merely low
    // contrast.
    await pump(tester, answer: 'Elders are greeted first.');
    await tester.enterText(find.byType(TextField), 'Who do I greet first?');
    await tester.pump();
    await tester.tap(find.byIcon(Icons.arrow_upward_rounded));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final bubbles = tester
        .widgetList<Container>(find.byType(Container))
        .map((container) => container.decoration)
        .whereType<BoxDecoration>()
        .where((decoration) => decoration.gradient == kKawuriBubbleGradient)
        .toList();

    // Both turns — the question and the answer — are drawn on it.
    expect(bubbles.length, greaterThanOrEqualTo(2));

    // And every one of them is opaque green, never a white plate.
    for (final decoration in bubbles) {
      expect(decoration.color, isNull);
    }
  });

  group('KawuriText', () {
    Future<void> pumpText(WidgetTester tester, String text) async {
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,

          theme: buildIndigenTheme(),
          home: Scaffold(body: KawuriText(text: text)),
        ),
      );
      await tester.pump();
    }

    testWidgets('renders bullets with a hanging marker', (tester) async {
      await pumpText(tester, 'Greetings\n\n• Elders first\n• Then the rest');

      expect(find.text('Greetings'), findsOneWidget);
      expect(find.text('•'), findsNWidgets(2));
      expect(find.text('Elders first'), findsOneWidget);
    });

    testWidgets('renders numbered steps with their own markers', (
      tester,
    ) async {
      await pumpText(tester, '1. Open Contribute\n2. Write the Kasem');

      expect(find.text('1.'), findsOneWidget);
      expect(find.text('2.'), findsOneWidget);
      expect(find.text('Open Contribute'), findsOneWidget);
    });

    testWidgets('never shows raw markdown emphasis to a reader', (
      tester,
    ) async {
      // The model is asked for plain text but may still emit markdown; showing
      // the asterisks would look broken.
      await pumpText(
        tester,
        '## Heading\nThis is **important** and *this* too',
      );

      expect(find.text('Heading'), findsOneWidget);
      expect(find.text('This is important and this too'), findsOneWidget);
    });
  });
}
