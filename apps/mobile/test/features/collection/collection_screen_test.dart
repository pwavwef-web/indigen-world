import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';

void main() {
  testWidgets(
    'shows every real-data portal and an empty state without errors',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: buildIndigenTheme(),
            home: const CollectionScreen(),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(find.text('Music'), findsOneWidget);
      expect(find.text('Dictionary'), findsOneWidget);
      expect(find.text('Live · published only'), findsOneWidget);

      // Scrolled to rather than dragged by a fixed offset: the tiles got
      // shorter when the three-line description came off them, and a hard-coded
      // drag distance is a test that has to be re-tuned every time the layout
      // breathes.
      for (final label in const ['Literature', 'Audiobooks', 'Video']) {
        await tester.scrollUntilVisible(
          find.text(label),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(label), findsOneWidget);
      }
      expect(tester.takeException(), isNull);

      await tester.scrollUntilVisible(
        find.text('Music'),
        -180,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.text('Music'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('Hear the rhythm of home.'), findsOneWidget);
      expect(
        find.text('Music is ready for its first published piece'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'collection portals remain usable with large accessibility text',
    (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: buildIndigenTheme(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            ),
            home: const CollectionScreen(),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      for (final label in const [
        'Music',
        'Dictionary',
        'Literature',
        'Audiobooks',
        'Video',
      ]) {
        await tester.scrollUntilVisible(
          find.text(label),
          180,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.text(label), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    },
  );
}
