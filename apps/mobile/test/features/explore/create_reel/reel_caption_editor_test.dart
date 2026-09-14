import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/core/timed_captions.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_caption_editor.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_draft.dart';
import 'package:indigen_world_mobile/features/explore/create_reel/reel_editor_controller.dart';

import 'reel_test_fakes.dart';

void main() {
  Future<ReelEditorController> openEditor(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(320, 568)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final editor = buildTestEditor();
    addTearDown(editor.controller.dispose);
    await tester.runAsync(() async {
      await editor.controller.start();
      await editor.controller.pickVideo(record: false);
    });
    await tester.pumpWidget(
      MaterialApp(
        theme: buildIndigenDarkTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () =>
                    openReelCaptionEditor(context, editor.controller),
                child: const Text('captions'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('captions'));
    await tester.pumpAndSettle();
    return editor.controller;
  }

  testWidgets('captions are written, timed, checked and saved', (tester) async {
    final controller = await openEditor(tester);
    expect(find.text('No captions yet'), findsOneWidget);
    expect(
      find.text(
        'Automatic captions are not available yet.',
        skipOffstage: false,
      ),
      findsOneWidget,
    );

    await controller.seekTo(const Duration(seconds: 4));
    await tester.tap(find.text('Add caption at playhead'));
    await tester.pumpAndSettle();
    expect(find.textContaining('0:04.0 – 0:07.0'), findsOneWidget);

    // The keyboard over a short screen breaks nothing.
    tester.view.viewInsets = const FakeViewPadding(bottom: 260);
    addTearDown(tester.view.resetViewInsets);
    await tester.enterText(find.byType(TextField).first, 'Welcome, everyone');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();

    final check = find.byType(CheckboxListTile);
    await tester.scrollUntilVisible(
      check,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(check);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done').first);
    await tester.pumpAndSettle();

    final captions = controller.draft.captions!;
    expect(captions.reviewed, isTrue);
    expect(captions.source, CaptionSource.manual);
    expect(
      captions.cues.single,
      const CaptionCue(startMs: 4000, endMs: 7000, text: 'Welcome, everyone'),
    );
    expect(controller.issuesFor(ReelStage.media), isEmpty);
    // Let the autosave the edit scheduled run before the test ends.
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('an edit after checking unticks the check', (tester) async {
    final controller = await openEditor(tester);
    controller.setCaptions(
      const CaptionTrack(
        language: 'xsm',
        reviewed: true,
        cues: [CaptionCue(startMs: 0, endMs: 2000, text: 'Hello')],
      ),
    );
    // Reopen so the editor starts from the checked captions.
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('captions'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Hello there');
    await tester.pumpAndSettle();
    expect(
      find.text(
        'You changed the captions, so check them again.',
        skipOffstage: false,
      ),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Close'));
    await tester.pumpAndSettle();
    expect(find.text('Discard caption changes?'), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(controller.draft.captions?.cues.single.text, 'Hello');
    expect(controller.draft.captions?.reviewed, isTrue);
    await tester.pump(const Duration(seconds: 1));
  });
}
