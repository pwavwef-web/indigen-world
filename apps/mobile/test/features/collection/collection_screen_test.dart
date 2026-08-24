import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';

void main() {
  testWidgets(
    'shows four real-data portals and an empty state without errors',
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
      expect(
        find.text('Live community library · published entries only'),
        findsOneWidget,
      );
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -260));
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.text('Literature'), findsOneWidget);
      expect(find.text('Audiobooks'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, 260));
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
