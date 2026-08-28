import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/contribute_screen.dart';

void main() {
  testWidgets('offers every collection type and explicit consent controls', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(home: ContributeScreen(standalone: true)),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    for (final label in const [
      'Music',
      'Dictionary',
      'Literature',
      'Audiobooks',
      'Video',
    ]) {
      expect(find.text(label), findsOneWidget);
    }

    expect(find.text('English or source word'), findsOneWidget);
    expect(find.text('Kasem word or phrase'), findsOneWidget);
    expect(find.text('Kasem example (optional)'), findsOneWidget);
    expect(find.text('English example (optional)'), findsOneWidget);

    // A dictionary word carries nobody else's work, so the borrowed-material
    // question is not asked of it — but the consent and rights attestations
    // are asked of every kind, and they are what has to survive the trim.
    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.textContaining('has agreed to it being shared'),
      220,
      scrollable: scrollable,
    );
    await tester.pump();

    expect(find.text("Does this use someone else's material?"), findsNothing);
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

  testWidgets(
    'switching collection type shows the matching contribution form',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: ContributeScreen(standalone: true)),
        ),
      );
      await tester.pump(const Duration(milliseconds: 400));

      await tester.tap(find.text('Music'));
      await tester.pump(const Duration(milliseconds: 220));
      expect(find.text('Song or recording title'), findsOneWidget);
      expect(find.text('Description and cultural context'), findsOneWidget);
      // A song is its recording, so the form asks for the file itself.
      expect(find.text('The recording'), findsOneWidget);
      expect(find.text('Choose the audio'), findsOneWidget);

      await tester.ensureVisible(find.text('Literature'));
      await tester.tap(find.text('Literature'));
      await tester.pump(const Duration(milliseconds: 220));
      expect(find.text('Work title'), findsOneWidget);
      expect(find.text('Text, excerpt, or synopsis'), findsOneWidget);

      await tester.ensureVisible(find.text('Audiobooks'));
      await tester.tap(find.text('Audiobooks'));
      await tester.pump(const Duration(milliseconds: 220));
      expect(find.text('Audiobook title'), findsOneWidget);
      expect(find.text('Synopsis and narration details'), findsOneWidget);
      expect(find.text('The narration'), findsOneWidget);

      await tester.ensureVisible(find.text('Video'));
      await tester.tap(find.text('Video'));
      await tester.pump(const Duration(milliseconds: 220));
      expect(find.text('Video title'), findsOneWidget);
      expect(find.text('The footage'), findsOneWidget);
      expect(find.text('Choose the video'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
    },
  );
}
