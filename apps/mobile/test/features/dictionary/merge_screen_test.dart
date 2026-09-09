// Two entries for one word, and the decision about which one keeps its id.
//
// The rule this screen is built around is conservative and is the reason a
// wrong merge is survivable: the kept entry keeps every answer it already has
// and gains only the ones it was missing. So the test that matters is not that
// the button works — it is that a reviewer who touches nothing sends no
// choices, and that the destructive disposition is an admin key.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/dictionary/data/dictionary_admin.dart';
import 'package:indigen_world_mobile/features/dictionary/merge_screen.dart';

import 'entry_editor_screen_test.dart' show FakeDictionaryAdmin;

/// A fake that answers the preview and records the merge it was asked for.
class RecordingAdmin extends FakeDictionaryAdmin {
  RecordingAdmin(this._preview);

  final MergePreview _preview;

  String? mergedTarget;
  String? mergedSource;
  Map<String, String>? mergedChoices;
  MergeDisposition? mergedDisposition;
  var merges = 0;

  @override
  Future<MergePreview> preview({
    required String targetId,
    required String sourceId,
  }) async => _preview;

  @override
  Future<void> merge({
    required String targetId,
    required String sourceId,
    required String reason,
    Map<String, String> choices = const <String, String>{},
    MergeDisposition disposition = MergeDisposition.retire,
  }) async {
    merges++;
    mergedTarget = targetId;
    mergedSource = sourceId;
    mergedChoices = choices;
    mergedDisposition = disposition;
    lastReason = reason;
  }
}

const _preview = MergePreview(
  targetHeadword: 'bu',
  sourceHeadword: 'bu',
  rows: <MergeRow>[
    MergeRow(field: 'englishText', target: 'child', source: 'baby', conflict: true),
    MergeRow(field: 'ipa', target: '', source: 'bu', conflict: false),
  ],
);

void main() {
  late RecordingAdmin admin;

  Future<void> pumpMerge(WidgetTester tester, {bool canDelete = false}) async {
    admin = RecordingAdmin(_preview);
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dictionaryAdminRepositoryProvider.overrideWithValue(admin),
          canEditDictionaryProvider.overrideWithValue(true),
          canDeleteDictionaryProvider.overrideWithValue(canDelete),
        ],
        child: const MaterialApp(
          home: MergeEntriesScreen(
            keepId: 'entry_bu',
            keepHeadword: 'bu',
            duplicateId: 'entry_bu_2',
            duplicateHeadword: 'bu',
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  final reasonBox = find.ancestor(
    of: find.text('Why these are one word'),
    matching: find.byType(TextField),
  );

  Future<void> scrollTo(WidgetTester tester, Finder target) async {
    await tester.scrollUntilVisible(
      target,
      240,
      scrollable: find.byType(Scrollable).first,
    );
  }

  testWidgets('the conflicting field is the one a reviewer is asked about', (
    tester,
  ) async {
    await pumpMerge(tester);
    // The row labels itself in capitals, the way the screen draws headings.
    await scrollTo(tester, find.text('MEANING'));

    // Both sides said something and they differ: a decision.
    expect(find.text('MEANING'), findsWidgets);
    expect(find.text('child'), findsWidgets);
    expect(find.text('baby'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('merging without a reason sends nothing', (tester) async {
    await pumpMerge(tester);

    final button = find.widgetWithText(FilledButton, 'Merge into “bu”');
    await scrollTo(tester, button);
    await tester.tap(button);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(admin.merges, 0);
    expect(
      find.textContaining('Say why these are the same word'),
      findsWidgets,
    );
  });

  testWidgets('a reviewer who touches no row sends no choices at all', (
    tester,
  ) async {
    await pumpMerge(tester);

    await scrollTo(tester, reasonBox);
    await tester.enterText(reasonBox, 'The same word entered twice.');
    await tester.pump();

    final button = find.widgetWithText(FilledButton, 'Merge into “bu”');
    await scrollTo(tester, button);
    await tester.tap(button);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The confirmation, then the merge.
    final confirm = find.widgetWithText(FilledButton, 'Merge');
    await tester.ensureVisible(confirm);
    await tester.tap(confirm);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(admin.merges, 1);
    expect(admin.mergedTarget, 'entry_bu');
    expect(admin.mergedSource, 'entry_bu_2');
    expect(
      admin.mergedChoices,
      isEmpty,
      reason: 'the kept entry keeps every answer it already had',
    );
    expect(
      admin.mergedDisposition,
      MergeDisposition.retire,
      reason: 'retire is the default, so an old link still leads somewhere',
    );
  });

  testWidgets('deleting the duplicate is an admin key', (tester) async {
    // Scrolled to the reason box, which sits directly below the two
    // dispositions — so if "Delete it" existed it would be on screen.
    await pumpMerge(tester);
    await scrollTo(tester, reasonBox);
    expect(find.text('Retire it'), findsOneWidget);
    expect(find.text('Delete it'), findsNothing);

    await pumpMerge(tester, canDelete: true);
    await scrollTo(tester, reasonBox);
    expect(find.text('Delete it'), findsOneWidget);
  });
}
