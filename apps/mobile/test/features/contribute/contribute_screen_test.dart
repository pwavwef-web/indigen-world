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
    ]) {
      expect(find.text(label), findsOneWidget);
    }

    expect(find.text('English or source word'), findsOneWidget);
    expect(find.text('Kasem word or phrase'), findsOneWidget);
    expect(find.text('Kasem example (optional)'), findsOneWidget);
    expect(find.text('English example (optional)'), findsOneWidget);

    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.text('Does this involve anyone under 18?'),
      220,
      scrollable: scrollable,
    );
    await tester.pump();

    expect(find.text('Does this involve anyone under 18?'), findsOneWidget);
    expect(find.text("Does this use someone else's material?"), findsOneWidget);
    expect(
      find.textContaining('People named, quoted, or recorded have agreed'),
      findsOneWidget,
    );
    expect(
      find.textContaining('may publish this in the public Collection'),
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
      expect(find.text('Recording link (optional)'), findsOneWidget);

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
      expect(find.text('Recording link (optional)'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 500));
    },
  );
}
