// One form per kind, and the artwork a song now carries.
//
// The form used to sit under a picker that could change its mind at any
// moment, so these tests used to work by tapping between five tiles. The kind
// is settled before the screen opens now, so each case pumps the form it means
// and checks that it asks for that and only that — plus the consent and rights
// pledges, which are asked of every kind and are what has to survive any trim.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_form_screen.dart';
import 'package:indigen_world_mobile/features/contribute/contribution_kinds.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';

Future<void> pumpForm(
  WidgetTester tester,
  CollectionKind kind, {
  String? relatedEntryId,
  LexicalKind? lexicalKind,
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
        home: ContributionFormScreen(
          kind: kind,
          lexicalKind: lexicalKind,
          relatedEntryId: relatedEntryId,
        ),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('a word is asked what a word needs', (tester) async {
    await pumpForm(tester, CollectionKind.dictionary);

    // The English side is the first MEANING now, not a single "word" box.
    // A word has as many meanings as it has, and the form that asked once
    // stored "toy, plaything, small dog" as one meaning with one sentence
    // attached to none of them.
    expect(find.text('What it means in English'), findsOneWidget);
    expect(find.text('English or source word'), findsNothing);
    expect(find.text('Kasem word or phrase'), findsOneWidget);

    // The example boxes moved inside the meaning they illustrate. There is
    // exactly one meaning on a fresh form, so they are not numbered yet.
    expect(find.text('Kasem example (optional)'), findsOneWidget);
    expect(find.text('English for that sentence (optional)'), findsOneWidget);

    // One meaning costs no extra taps: no number, no detail boxes, and the
    // offer of a second meaning phrased as an invitation rather than a step.
    expect(find.text('Meaning 1'), findsNothing);
    expect(find.text('How is it said?'), findsNothing);
    expect(
      find.text('This word means something else too'),
      findsOneWidget,
    );

    // A dictionary word carries nobody else's work, and has nothing for a
    // cover to be the cover of.
    expect(find.text("Does this use someone else's material?"), findsNothing);
    expect(find.text('Cover art'), findsNothing);

    expect(
      find.textContaining('Anyone whose knowledge this is has agreed'),
      findsOneWidget,
    );
    expect(
      find.text('I have permission to share this for community review.'),
      findsOneWidget,
    );
    expect(
      find.text('Indigen World may publish this if approved.'),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('a word can be given several meanings, each with its own '
      'example', (tester) async {
    await pumpForm(tester, CollectionKind.dictionary);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'What it means in English'),
      'plaything',
    );
    await tester.pump();

    await tester.tap(find.text('This word means something else too'));
    await tester.pumpAndSettle();

    // Both meanings are now numbered, and the second one asks for its own
    // sentence by number so a contributor can see which it belongs to.
    expect(find.text('Meaning 1'), findsOneWidget);
    expect(find.text('Meaning 2'), findsOneWidget);
    expect(find.text('What else it means'), findsOneWidget);
    expect(find.text('Kasem example for meaning 2 (optional)'), findsOneWidget);

    // The button relabels once there is a list to add to.
    expect(find.text('Add another meaning'), findsOneWidget);

    // A second meaning opens its detail already unfolded, because somebody who
    // pressed Add is telling this meaning apart from the first and the labels
    // are how they do it.
    expect(find.text('How is it said?'), findsOneWidget);
    expect(find.text('What is it about?'), findsOneWidget);
    expect(
      find.text('Word class for this meaning (optional)'),
      findsOneWidget,
    );
  });

  testWidgets('an empty extra meaning is removed without a confirmation', (
    tester,
  ) async {
    await pumpForm(tester, CollectionKind.dictionary);

    await tester.tap(find.text('This word means something else too'));
    await tester.pumpAndSettle();
    expect(find.text('Meaning 2'), findsOneWidget);

    // The cross on the second meaning. Nothing has been typed into it, so it
    // goes without a dialog -- a confirmation about discarding nothing is the
    // case that happens most, and it is the one worth not asking about.
    await tester.tap(find.byTooltip('Remove this meaning').last);
    await tester.pumpAndSettle();

    expect(find.text('Meaning 2'), findsNothing);
    expect(find.text('Meaning 1'), findsNothing);
    expect(find.text('What it means in English'), findsOneWidget);
  });

  testWidgets('a saying is not offered several meanings', (tester) async {
    await pumpForm(
      tester,
      CollectionKind.dictionary,
      lexicalKind: LexicalKind.proverb,
    );

    // A proverb has a meaning rather than a translation, and it very rarely
    // has several. Four numbered senses on a proverb is almost always somebody
    // misreading the box.
    expect(find.text('What it means in English'), findsOneWidget);
    expect(find.text('This word means something else too'), findsNothing);
    expect(find.text('Add another meaning'), findsNothing);
  });

  testWidgets('a song is asked for the recording and its artwork', (
    tester,
  ) async {
    await pumpForm(tester, CollectionKind.music);

    expect(find.text('Song or recording title'), findsOneWidget);
    expect(find.text('Description and cultural context'), findsOneWidget);
    // A song is its recording, so the form asks for the file itself.
    expect(find.text('The recording'), findsOneWidget);
    expect(find.text('Choose the audio'), findsOneWidget);
    expect(find.text('REQUIRED'), findsOneWidget);

    // The artwork is optional, and the copy says what it is actually for
    // rather than calling it an image.
    expect(find.text('Cover art'), findsOneWidget);
    expect(find.text('OPTIONAL'), findsOneWidget);
    expect(find.text('Choose a picture'), findsOneWidget);
    expect(
      find.textContaining('Now Playing screen and on their lock screen'),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('a written work and a film keep their own questions', (
    tester,
  ) async {
    await pumpForm(tester, CollectionKind.literature);
    expect(find.text('Work title'), findsOneWidget);
    expect(find.text('Text, excerpt, or synopsis'), findsOneWidget);
    expect(find.text('Manuscript (optional)'), findsOneWidget);
    expect(find.text('Cover art'), findsNothing);
    await tester.pump(const Duration(milliseconds: 400));

    await pumpForm(tester, CollectionKind.video);
    expect(find.text('Video title'), findsOneWidget);
    expect(find.text('The footage'), findsOneWidget);
    expect(find.text('Choose the video'), findsOneWidget);
    expect(
      find.text("Is any of this footage or music somebody else's?"),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('every required field is still refused when empty', (
    tester,
  ) async {
    await pumpForm(tester, CollectionKind.dictionary);

    await tester.ensureVisible(find.text('Submit for review'));
    await tester.pump();
    await tester.tap(find.text('Submit for review'));
    await tester.pump(const Duration(milliseconds: 400));

    // The three text fields a word cannot be sent without, plus the two
    // dropdowns, plus the sentence naming the pledge that was not ticked —
    // which a highlighted field cannot say, because a checkbox has no
    // validator to hang an error on.
    expect(find.text('This field is required.'), findsNWidgets(3));
    // The dictionary's word class is the searchable picker now rather than a
    // six-item dropdown, so it refuses an empty answer in its own words.
    expect(find.text('Choose a word class.'), findsOneWidget);
    expect(find.text('Choose a dialect.'), findsOneWidget);
    expect(
      find.text('Confirm that you have permission to share this contribution.'),
      findsOneWidget,
    );
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('a correction keeps the heading it has always had', (
    tester,
  ) async {
    await pumpForm(
      tester,
      CollectionKind.dictionary,
      relatedEntryId: 'entry-1',
    );

    expect(find.text('Suggest a correction.'), findsOneWidget);
    expect(find.text('CONTRIBUTE'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 500));
  });
}
