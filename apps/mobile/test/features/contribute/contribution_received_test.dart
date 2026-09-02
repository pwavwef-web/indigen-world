// The receipt.
//
// A contribution used to end in a small pane over the form that sent it, with
// the form's own controls still showing round the edges — the same shape the
// app uses when it wants something from you. This screen is the app saying
// thank you, so it takes the whole screen and draws its own tick.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_received_screen.dart';
import 'package:indigen_world_mobile/features/contribute/my_submissions_screen.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

/// Pumps the receipt on top of a plain page, so Done has somewhere to go —
/// which is how it is actually reached: pushed over the form that sent the
/// contribution.
Future<void> pumpReceipt(
  WidgetTester tester, {
  CollectionKind kind = CollectionKind.music,
  bool stillness = false,
}) async {
  tester.view.physicalSize = const Size(800, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ProviderScope(
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<bool>(
                    builder: (context) => MediaQuery(
                      data: MediaQuery.of(context)
                          .copyWith(disableAnimations: stillness),
                      child: ContributionReceivedScreen(kind: kind),
                    ),
                  ),
                ),
                child: const Text('send it'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('send it'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('it names what was sent and where it went', (tester) async {
    await pumpReceipt(tester);

    expect(find.text('Submission received'), findsOneWidget);
    // Named per kind rather than reusing the label written for the middle of
    // a sentence, which produced "Your a song or recording is…".
    expect(
      find.textContaining('Your song is in the review queue'),
      findsOneWidget,
    );
    expect(find.byType(ContributionTick), findsOneWidget);
    expect(find.text('See my submissions'), findsOneWidget);
    expect(find.text('Done'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 900));
  });

  testWidgets('with animations off the tick is drawn already finished', (
    tester,
  ) async {
    await pumpReceipt(tester, stillness: true);

    final tick = tester.widget<TweenAnimationBuilder<double>>(
      find.descendant(
        of: find.byType(ContributionTick),
        matching: find.byType(TweenAnimationBuilder<double>),
      ),
    );
    // Expressed as a tween that begins where it ends, rather than as a zero
    // duration, so there is no first frame drawn empty.
    expect(tick.tween.begin, 1);
    expect(tick.duration, Duration.zero);
    expect(find.text('Submission received'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 400));
  });

  testWidgets('and otherwise draws itself in from nothing', (tester) async {
    await pumpReceipt(tester);

    final tick = tester.widget<TweenAnimationBuilder<double>>(
      find.descendant(
        of: find.byType(ContributionTick),
        matching: find.byType(TweenAnimationBuilder<double>),
      ),
    );
    expect(tick.tween.begin, 0);
    expect(tick.duration, greaterThan(Duration.zero));
    await tester.pump(const Duration(milliseconds: 900));
  });

  testWidgets('Done hands the flow back', (tester) async {
    await pumpReceipt(tester);

    await tester.tap(find.text('Done'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    // A second frame after the transition: the popped route leaves the tree
    // when the navigator finalises it, which is one frame after it stops
    // moving.
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.text('Submission received'), findsNothing);
    expect(find.text('send it'), findsOneWidget);
  });

  testWidgets('See my submissions takes the receipt\'s place', (tester) async {
    await pumpReceipt(tester);

    await tester.tap(find.text('See my submissions'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));

    expect(find.byType(MySubmissionsScreen), findsOneWidget);
    // Replaced, not stacked: backing out of the list must not walk back
    // through a receipt for something already sent.
    expect(find.text('Submission received'), findsNothing);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
