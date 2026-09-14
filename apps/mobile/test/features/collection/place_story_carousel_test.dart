import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/place_stories.dart';
import 'package:indigen_world_mobile/features/collection/place_story_screen.dart';
import 'package:indigen_world_mobile/features/collection/widgets/place_story_carousel.dart';
import 'package:visibility_detector/visibility_detector.dart';

void main() {
  setUp(
    () => VisibilityDetectorController.instance.updateInterval = Duration.zero,
  );
  tearDown(
    () => VisibilityDetectorController.instance.updateInterval = const Duration(
      milliseconds: 500,
    ),
  );

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PlaceStoryCarousel(ad: Center(child: Text('One ad'))),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('advances every three seconds, pauses, and includes one ad', (
    tester,
  ) async {
    await pump(tester);
    final pages = tester.widget<PageView>(find.byType(PageView)).controller!;
    expect(pages.page, 0);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(pages.page, 1);
    await tester.tap(find.byTooltip('Pause slideshow'));
    await tester.pump(const Duration(seconds: 6));
    expect(pages.page, 1);
    await tester.tap(find.byTooltip('Resume slideshow'));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(pages.page, 2);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(pages.page, 3);
    expect(find.text('One ad'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(pages.page, 0);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('opens the full local story and pauses behind its route', (
    tester,
  ) async {
    await pump(tester);
    final pages = tester.widget<PageView>(find.byType(PageView)).controller!;
    await tester.tap(find.text(placeStories.first.title));
    await tester.pumpAndSettle();
    expect(find.byType(PlaceStoryScreen), findsOneWidget);
    expect(find.text(placeStories.first.paragraphs.first), findsOneWidget);
    await tester.pump(const Duration(seconds: 6));
    expect(pages.page, 0);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(PlaceStoryCarousel), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
