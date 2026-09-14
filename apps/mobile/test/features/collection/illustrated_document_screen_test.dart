import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/illustrated_document_screen.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

void main() {
  test('a corrupt page does not silently shorten the story', () {
    expect(
      documentPageUrlsFromData(['https://example.test/1.jpg', null]),
      isEmpty,
    );
    expect(
      documentPageUrlsFromData(['https://example.test/1.jpg', 'file:///2.jpg']),
      isEmpty,
    );
    expect(documentPageUrlsFromData(null), isEmpty);
    expect(
      documentPageUrlsFromData([
        'https://example.test/2.jpg',
        'https://example.test/1.jpg',
      ]),
      ['https://example.test/2.jpg', 'https://example.test/1.jpg'],
    );
  });

  testWidgets('reader turns pages and disables controls at the ends', (
    tester,
  ) async {
    const item = PublishedReel(
      id: 'story',
      title: 'Kasem story',
      creatorName: 'Storyteller',
      mediaType: 'document',
      documentPageUrls: [
        'https://example.test/1.jpg',
        'https://example.test/2.jpg',
      ],
    );
    await tester.pumpWidget(
      const MaterialApp(home: IllustratedDocumentScreen(item: item)),
    );
    expect(find.text('Page 1 of 2'), findsOneWidget);
    expect(
      tester
          .widget<IconButton>(
            find.byWidgetPredicate(
              (w) => w is IconButton && w.tooltip == 'Previous page',
            ),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.byTooltip('Next page'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Page 2 of 2'), findsOneWidget);
    expect(
      tester
          .widget<IconButton>(
            find.byWidgetPredicate(
              (w) => w is IconButton && w.tooltip == 'Next page',
            ),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.byTooltip('Previous page'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Page 1 of 2'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('an empty document has a useful message', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: IllustratedDocumentScreen(
          item: PublishedReel(
            id: 'empty',
            title: 'Empty',
            creatorName: 'Storyteller',
          ),
        ),
      ),
    );
    expect(find.text('No illustrated pages are available.'), findsOneWidget);
    expect(find.byType(PageView), findsNothing);
  });
}
