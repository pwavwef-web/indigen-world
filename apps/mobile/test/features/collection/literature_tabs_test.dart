import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_data.dart';
import 'package:indigen_world_mobile/features/collection/collection_detail_screens.dart';
import 'package:indigen_world_mobile/features/explore/published_content.dart';

const _folktale = PublishedReel(
  id: 'kasem-sky-far-away',
  title: 'Kolo ŋwane kunkwanu tem na ye yiga yiga to',
  creatorName: 'Indigen World',
  mediaType: 'document',
  category: 'Folktale',
  body: 'The written folktale.',
);

PublishedReel _piece(String id, String category) => PublishedReel(
  id: id,
  title: id,
  creatorName: 'Test writer',
  category: category,
  body: 'Written work.',
);

Widget _harness(
  AsyncValue<List<PublishedReel>> items, {
  TextScaler textScaler = TextScaler.noScaling,
  CollectionKind kind = CollectionKind.literature,
  Future<void> Function()? onReload,
}) => ProviderScope(
  child: MaterialApp(
    theme: buildIndigenTheme(),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: textScaler),
      child: child!,
    ),
    home: PublishedCollectionScreen(
      kind: kind,
      items: items,
      onReload: onReload ?? () async {},
    ),
  ),
);

Future<void> _select(WidgetTester tester, String id) async {
  final tab = find.byKey(ValueKey('literature-tab-$id'));
  final tabScroll = tester.state<ScrollableState>(
    find.descendant(of: find.byType(TabBar), matching: find.byType(Scrollable)),
  );
  await tabScroll.position.ensureVisible(tester.renderObject(tab));
  await tester.pumpAndSettle();
  await tester.tap(tab);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('one folktale stays readable and empty tabs offer a way back', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const AsyncData([_folktale])));
    await tester.pumpAndSettle();
    expect(find.text(_folktale.title), findsOneWidget);
    expect(
      find.byKey(const ValueKey('literature-tab-short-stories')),
      findsNothing,
    );
    await _select(tester, 'folktales');
    expect(find.text(_folktale.title), findsOneWidget);

    await _select(tester, 'poetry');
    expect(find.text(_folktale.title), findsNothing);
    expect(find.text('No poetry published yet'), findsOneWidget);
    await tester.tap(find.text('View all literature'));
    await tester.pumpAndSettle();
    expect(find.text(_folktale.title), findsOneWidget);

    await tester.ensureVisible(find.text(_folktale.title));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_folktale.title));
    await tester.pumpAndSettle();
    expect(find.byType(CollectionItemDetailScreen), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('The written folktale.'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(find.text('The written folktale.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('each genre filters the list and search stays inside its tab', (
    tester,
  ) async {
    final items = [
      _folktale,
      _piece('Market morning', 'Short story'),
      _piece('A family play', 'Drama'),
      _piece('Rain poem', 'Poetry'),
      _piece('Millet porridge', 'Cooking recipes'),
      _piece('An elder remembers', 'oral-history'),
    ];
    await tester.pumpWidget(_harness(AsyncData(items)));
    await tester.pumpAndSettle();
    for (final entry in {
      'short-stories': 'Market morning',
      'drama': 'A family play',
      'poetry': 'Rain poem',
      'recipes': 'Millet porridge',
      'oral-history': 'An elder remembers',
    }.entries) {
      await _select(tester, entry.key);
      expect(find.text(entry.value), findsOneWidget);
      expect(find.text(_folktale.title), findsNothing);
    }

    await _select(tester, 'poetry');
    final search = find.byKey(const Key('published-collection-search'));
    await tester.enterText(search, 'Millet');
    await tester.pumpAndSettle();
    expect(find.text('No matches in Poetry'), findsOneWidget);
    expect(find.text('Millet porridge'), findsNothing);
    await _select(tester, 'recipes');
    expect(find.text('Millet porridge'), findsOneWidget);
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    expect(find.text('Millet porridge'), findsOneWidget);
    expect(find.text('Rain poem'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('new categories and a removed selected category update safely', (
    tester,
  ) async {
    await tester.pumpWidget(_harness(const AsyncData([_folktale])));
    await tester.pumpAndSettle();
    final items = [_folktale, _piece('An elder remembers', 'oral-history')];
    await tester.pumpWidget(_harness(AsyncData(items)));
    await tester.pumpAndSettle();
    await _select(tester, 'oral-history');
    expect(find.text('An elder remembers'), findsOneWidget);
    await tester.pumpWidget(_harness(const AsyncData([_folktale])));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('literature-tab-oral-history')),
      findsNothing,
    );
    expect(find.text(_folktale.title), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'counts describe the shelf and refreshing retains the selection',
    (tester) async {
      var reloads = 0;
      await tester.pumpWidget(
        _harness(
          AsyncData([_folktale, _piece('Rain poem', 'Poem')]),
          onReload: () async {
            reloads++;
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('literature-tab-all')),
          matching: find.text('2'),
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('literature-tab-folktales')),
          matching: find.text('1'),
        ),
        findsOneWidget,
      );
      await _select(tester, 'poetry');
      final scrollable = find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          )
          .first;
      tester.state<ScrollableState>(scrollable).position.jumpTo(0);
      await tester.pump();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 550));
      await tester.pumpAndSettle();
      expect(reloads, 1);
      expect(find.text('Rain poem'), findsOneWidget);
      expect(find.text(_folktale.title), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('tabs fit a narrow screen with large text', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      _harness(
        const AsyncData([_folktale]),
        textScaler: const TextScaler.linear(2),
      ),
    );
    await tester.pumpAndSettle();
    await _select(tester, 'recipes');
    expect(find.text('No food & recipes published yet'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('loading and errors keep tabs without claiming zero counts', (
    tester,
  ) async {
    var reloads = 0;
    await tester.pumpWidget(_harness(const AsyncLoading()));
    await tester.pump();
    expect(find.byType(TabBar), findsOneWidget);
    expect(find.text('0'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpWidget(
      _harness(
        AsyncError(Exception('Offline'), StackTrace.empty),
        onReload: () async {
          reloads++;
        },
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Try again'));
    await tester.pump();
    expect(reloads, 1);
    expect(find.byType(TabBar), findsOneWidget);
    expect(find.text('0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('other channels keep their existing layout', (tester) async {
    await tester.pumpWidget(
      _harness(const AsyncData([]), kind: CollectionKind.video),
    );
    await tester.pumpAndSettle();
    expect(find.byType(TabBar), findsNothing);
    expect(
      find.text('Video is ready for its first published piece'),
      findsOneWidget,
    );
  });
}
