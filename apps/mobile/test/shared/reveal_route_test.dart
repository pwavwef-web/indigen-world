// A page that grows out of what was tapped, and a rail that stays put while it
// does.
//
// The reason `RevealPageRoute` exists rather than the `animations` package's
// container transform is the second test: heroes only fly between *page*
// routes, and the app rail's hand-off into Music is a hero.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';
import 'package:indigen_world_mobile/shared/reveal_route.dart';

const _tileKey = Key('tile');

Widget _home({required Widget Function(BuildContext) page}) => MaterialApp(
  theme: buildIndigenTheme(),
  home: Scaffold(
    body: Align(
      alignment: Alignment.topLeft,
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Builder(
          builder: (tile) => SizedBox(
            key: _tileKey,
            width: 120,
            height: 90,
            child: ElevatedButton(
              onPressed: () => Navigator.of(tile).push(
                RevealPageRoute<void>(
                  origin: globalRectOf(tile),
                  originColor: Colors.teal,
                  builder: page,
                ),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
    bottomNavigationBar: FrostedNavBar(
      currentIndex: 0,
      onTap: (_) {},
      heroTag: kAppRailHeroTag,
      items: const [
        FrostedNavBarItem(icon: Icons.home_outlined, label: 'Shell one'),
        FrostedNavBarItem(icon: Icons.forum_outlined, label: 'Shell two'),
      ],
    ),
  ),
);

/// The clip window the reveal is drawing the page through.
Rect _window(WidgetTester tester) =>
    tester.getRect(find.byType(ClipRRect).last);

void main() {
  testWidgets('the page grows out of the tile and ends as the screen', (
    tester,
  ) async {
    await tester.pumpWidget(
      _home(page: (context) => const Scaffold(body: Text('the page'))),
    );
    final tile = tester.getRect(find.byKey(_tileKey));

    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));

    // A moment in, the window is still about the tile's size and place.
    final early = _window(tester);
    expect(early.width, lessThan(tile.width * 1.6));
    expect((early.center - tile.center).distance, lessThan(80));

    await tester.pumpAndSettle();
    expect(find.text('the page'), findsOneWidget);
    expect(_window(tester), Offset.zero & tester.view.physicalSize / 3);

    // And back into the tile it came from.
    Navigator.of(tester.element(find.text('the page'))).pop();
    await tester.pumpAndSettle();
    expect(find.text('the page'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a rail on both pages stays on screen and hands over', (
    tester,
  ) async {
    await tester.pumpWidget(
      _home(
        page: (context) => Scaffold(
          body: const Text('channel'),
          bottomNavigationBar: FrostedNavBar(
            currentIndex: 0,
            onTap: (_) {},
            heroTag: kAppRailHeroTag,
            items: const [
              FrostedNavBarItem(icon: Icons.home_rounded, label: 'Home'),
              FrostedNavBarItem(icon: Icons.search_rounded, label: 'Search'),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    // Mid-flight both sets of destinations are drawn, in the one place: the
    // rail is cross-fading, not being covered.
    expect(find.text('Shell one'), findsWidgets);
    expect(find.text('Home'), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Shell one'), findsNothing);

    Navigator.of(tester.element(find.text('channel'))).pop();
    await tester.pumpAndSettle();
    expect(find.text('Shell one'), findsOneWidget);
    expect(find.text('Home'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('with less motion asked for, the page simply fades in', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpWidget(
      _home(page: (context) => const Scaffold(body: Text('page'))),
    );

    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));

    // No growing window at all.
    expect(
      find.descendant(
        of: find.byType(Overlay),
        matching: find.byType(OverflowBox),
      ),
      findsNothing,
    );
    await tester.pumpAndSettle();
    expect(find.text('page'), findsOneWidget);
  });
}
