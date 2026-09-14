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
class FakeKawuriService extends KawuriService {
  FakeKawuriService({required this.answer, this.fromOfflineGuide = false})
    : super(null);

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
    expect(find.text('What shall we create or discover?'), findsOneWidget);
    expect(find.text('Ask Kawuri'), findsOneWidget);
    expect(find.text('Translate'), findsOneWidget);
    expect(find.text('Message Kawuri…'), findsOneWidget);
  });

  testWidgets('says plainly that it can be wrong about the language', (
    tester,
  ) async {
    // The dictionary and the community are the record; the assistant is not.
    await pump(tester);

    await tester.drag(find.byType(ListView).first, const Offset(0, -500));
    await tester.pump(const Duration(milliseconds: 300));
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

  testWidgets('a suggestion fills an editable draft without sending', (
    tester,
  ) async {
    final service = await pump(tester);

    await tester.ensureVisible(
      find.text('Explain the meaning of this festival'),
    );
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Explain the meaning of this festival'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(service.asked, isEmpty);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      contains('this festival'),
    );
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
    expect(find.text('What shall we create or discover?'), findsOneWidget);
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

  for (final width in [320.0, 360.0, 412.0]) {
    testWidgets('composer avoids keyboard at $width logical pixels', (
      tester,
    ) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = Size(width, 720);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      await pump(tester);
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      await tester.tap(find.byType(TextField));
      await tester.enterText(
        find.byType(TextField),
        'A multiline draft\nwith another line',
      );
      await tester.pump(const Duration(milliseconds: 300));
      final sendRect = tester.getRect(find.byTooltip('Send to Kawuri'));
      expect(sendRect.bottom, lessThanOrEqualTo(440));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'large text and narrow screen remain scrollable without overflow',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 720);
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await pump(tester);
      await tester.drag(find.byType(ListView).first, const Offset(0, -400));
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'attachment control explains unavailability without collecting media',
    (tester) async {
      final service = await pump(tester);
      await tester.enterText(find.byType(TextField), 'Keep this draft');
      // No capability manifest has arrived, so the tool is not offered.
      await tester.tap(find.byTooltip('Attach media · Checking…'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Analyse media · Checking…'), findsWidgets);
      expect(service.asked, isEmpty);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'Keep this draft',
      );
    },
  );

  testWidgets('history opens with search and deletion requires confirmation', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'Save this conversation');
    await tester.pump();
    await tester.tap(find.byTooltip('Send to Kawuri'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byTooltip('New conversation'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.byTooltip('Past conversations'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Search history'), findsOneWidget);
    await tester.tap(find.byTooltip('Conversation options'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Delete'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Delete conversation?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Save this conversation'), findsOneWidget);
    expect(tester.takeException(), isNull);
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
