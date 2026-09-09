// The editor that rewrites a published word, pumped as a screen.
//
// 0.1.16 shipped this with the note "an editor that can rewrite a published
// word deserves one before it is used in anger" and no test at all, because
// standing the screen up meant standing up `FirebaseFunctions`. It does not any
// more: `DictionaryAdminRepository` is an interface and this file supplies a
// fake, so the two rules the screen exists to enforce can be held —
//
//   1. only what somebody actually changed is sent, and
//   2. a refusal is never written somewhere the reviewer cannot see it.
//
// The second is the whole of a bug a phone found: the delete demanded a reason
// and gave nowhere to write it, and the save wrote its refusal into a line
// twelve boxes below the button.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/domain/dictionary_entry.dart';
import 'package:indigen_world_mobile/features/dictionary/data/dictionary_admin.dart';
import 'package:indigen_world_mobile/features/dictionary/entry_editor_screen.dart';

/// A repository that records what the screen asked of it and answers at once.
class FakeDictionaryAdmin implements DictionaryAdminRepository {
  FakeDictionaryAdmin({this.matches = ExistingEntries.empty, this.failWith});

  final ExistingEntries matches;

  /// When set, every write refuses with this message — the server saying no.
  final String? failWith;

  EntryPatch? lastPatch;
  String? lastReason;
  String? deletedId;
  var edits = 0;
  var deletes = 0;

  @override
  Future<ExistingEntries> findMatches({
    String? headword,
    String? submissionId,
    String? excludeEntryId,
  }) async => matches;

  @override
  Future<MergePreview> preview({
    required String targetId,
    required String sourceId,
  }) async => const MergePreview(
    targetHeadword: '',
    sourceHeadword: '',
    rows: <MergeRow>[],
  );

  @override
  Future<List<String>> edit({
    required String entryId,
    required EntryPatch patch,
    required String reason,
  }) async {
    edits++;
    lastPatch = patch;
    lastReason = reason;
    if (failWith != null) throw DictionaryAdminFailure(failWith!);
    return patch.toJson().keys.toList(growable: false);
  }

  @override
  Future<void> merge({
    required String targetId,
    required String sourceId,
    required String reason,
    Map<String, String> choices = const <String, String>{},
    MergeDisposition disposition = MergeDisposition.retire,
  }) async {}

  @override
  Future<void> delete({
    required String entryId,
    required String reason,
  }) async {
    deletes++;
    deletedId = entryId;
    lastReason = reason;
    if (failWith != null) throw DictionaryAdminFailure(failWith!);
  }
}

/// Filed with the part of speech spelled the way the picker spells it.
///
/// Deliberate: `partOfSpeech` is free text as each contributor's own client
/// sent it, and the editor sends the picker's *label*. So an entry stored
/// `noun` has a non-empty patch the moment it is opened — normalisation, not a
/// change anybody made, and pinned as its own test below.
DictionaryEntry testEntry({String partOfSpeech = 'Noun'}) => DictionaryEntry(
  id: 'entry_bu',
  headword: 'bu',
  translation: 'child',
  translations: const <String>[],
  renderings: const <String>[],
  partOfSpeech: partOfSpeech,
  dialect: 'Kasem',
  pronunciation: '',
  example: '',
  exampleTranslation: '',
  attribution: 'test',
  pluralForm: '',
  definiteForm: '',
  audioUrl: '',
  ipa: '',
  homographIndex: 0,
  etymology: 'from Proto-Gur',
);

void main() {
  late FakeDictionaryAdmin admin;

  Future<void> pumpEditor(
    WidgetTester tester, {
    bool canDelete = true,
    String? failWith,
    ExistingEntries matches = ExistingEntries.empty,
    String partOfSpeech = 'Noun',
    Size size = const Size(360, 640),
  }) async {
    admin = FakeDictionaryAdmin(matches: matches, failWith: failWith);
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dictionaryAdminRepositoryProvider.overrideWithValue(admin),
          canEditDictionaryProvider.overrideWithValue(true),
          canDeleteDictionaryProvider.overrideWithValue(canDelete),
        ],
        child: MaterialApp(
          home: EntryEditorScreen(entry: testEntry(partOfSpeech: partOfSpeech)),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  /// The box with this label, wherever the form has scrolled it to.
  Finder box(String label) => find.ancestor(
    of: find.text(label),
    matching: find.byType(TextField),
  );

  /// Scrolls to a box the way a reviewer would and types in it.
  ///
  /// The form is a `ListView`, so a box twelve rows down does not exist in the
  /// tree until something scrolls to it — which is the same fact that made the
  /// off-screen refusal such a good hiding place.
  Future<void> fill(WidgetTester tester, String label, String text) async {
    final target = box(label);
    await tester.scrollUntilVisible(
      target,
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(target, text);
    await tester.pump();
  }

  Future<void> tapSave(WidgetTester tester) async {
    final save = find.widgetWithText(FilledButton, 'Save and republish');
    await tester.scrollUntilVisible(
      save,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(save);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  /// Taps something that may have been pushed below the fold of its own card.
  Future<void> press(WidgetTester tester, Finder target) async {
    await tester.ensureVisible(target);
    await tester.pump();
    await tester.tap(target);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('the screen stands up on a 720p phone without overflowing', (
    tester,
  ) async {
    await pumpEditor(tester);

    expect(find.text('Edit entry'), findsOneWidget);
    expect(tester.takeException(), isNull);
    // The bar that covered this form is not on screen until a Kasem box has
    // the cursor, and when it arrives it is a strip.
    expect(find.text('Headword (Kasem)'), findsOneWidget);
  });

  testWidgets('saving with no reason refuses, says so, and shows the box', (
    tester,
  ) async {
    await pumpEditor(tester);

    await tapSave(tester);

    expect(admin.edits, 0, reason: 'nothing may be sent without a reason');
    // Said out loud, so a refusal cannot happen off screen.
    expect(
      find.text('Say what you changed and why — it is the only record of it.'),
      findsWidgets,
    );
    // And the box it is about was brought to the reviewer.
    expect(box('What you changed, and why'), findsOneWidget);
  });

  testWidgets('a reason and a change is all it takes, and only the change is sent', (
    tester,
  ) async {
    await pumpEditor(tester);

    await fill(tester, 'Meaning (English)', 'child, offspring');
    await fill(
      tester,
      'What you changed, and why',
      'Adding the second gloss a speaker gave.',
    );
    await tapSave(tester);

    expect(admin.edits, 1);
    expect(admin.lastReason, 'Adding the second gloss a speaker gave.');
    final sent = admin.lastPatch!.toJson();
    expect(sent['englishText'], 'child, offspring');
    // The rule the whole screen is built around: the etymology was never
    // touched, so it is not in the patch and the backend leaves it alone.
    expect(sent.containsKey('etymology'), isFalse);
    expect(sent.containsKey('senses'), isFalse);
  });

  testWidgets('an unchanged form refuses rather than sending an empty patch', (
    tester,
  ) async {
    await pumpEditor(tester);

    await fill(
      tester,
      'What you changed, and why',
      'Opened it and changed my mind.',
    );
    await tapSave(tester);

    expect(admin.edits, 0);
    expect(find.text('Nothing has changed yet.'), findsWidgets);
  });

  testWidgets('a word class stored in lower case is normalised on save', (
    tester,
  ) async {
    // Not a change the reviewer made, and worth knowing: `partOfSpeech` is free
    // text as whichever client wrote it, and the editor sends the picker's
    // label. So an entry filed as `noun` is republished as `Noun` by any save.
    await pumpEditor(tester, partOfSpeech: 'noun');

    await fill(
      tester,
      'What you changed, and why',
      'Opened it and changed my mind.',
    );
    await tapSave(tester);

    expect(admin.edits, 1);
    expect(admin.lastPatch!.toJson()['partOfSpeech'], 'Noun');
  });

  testWidgets('a refusal from the server is said out loud, not filed away', (
    tester,
  ) async {
    await pumpEditor(tester, failWith: 'That entry has been merged into another.');

    await fill(tester, 'Meaning (English)', 'child, offspring');
    await fill(
      tester,
      'What you changed, and why',
      'Adding the second gloss a speaker gave.',
    );
    await tapSave(tester);

    expect(admin.edits, 1);
    expect(find.text('That entry has been merged into another.'), findsWidgets);
  });

  testWidgets('the bin is an admin key, and it asks in a box you can type in', (
    tester,
  ) async {
    await pumpEditor(tester);

    await tester.tap(find.byTooltip('Delete entry'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // The prompt, with its own reason box — not a demand pointing off screen.
    expect(find.byType(DeleteReasonPrompt), findsOneWidget);
    final confirm = find.widgetWithText(FilledButton, 'Delete');
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);

    await tester.enterText(
      find.descendant(
        of: find.byType(DeleteReasonPrompt),
        matching: find.byType(TextField),
      ),
      'A test row pasted into the wrong box.',
    );
    await tester.pump();
    await press(tester, confirm);

    expect(admin.deletes, 1);
    expect(admin.deletedId, 'entry_bu');
    expect(admin.lastReason, 'A test row pasted into the wrong box.');
  });

  testWidgets('a validator who is not an admin is offered no bin at all', (
    tester,
  ) async {
    await pumpEditor(tester, canDelete: false);

    expect(find.byTooltip('Delete entry'), findsNothing);
  });

  testWidgets('what else is filed under this spelling is shown in the editor', (
    tester,
  ) async {
    await pumpEditor(
      tester,
      matches: const ExistingEntries(
        headword: 'bu',
        exactCount: 1,
        matches: <ExistingEntry>[
          ExistingEntry(
            id: 'entry_bu_other',
            kasemText: 'bu',
            englishText: 'goat',
            partOfSpeech: 'noun',
            dialect: 'Kasem',
            homographIndex: 2,
            isPublished: true,
            hasAudio: false,
            similarity: 1,
            exact: true,
          ),
        ],
      ),
    );

    expect(find.text('This word is already in the dictionary'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Compare and merge'), findsOneWidget);
  });
}
