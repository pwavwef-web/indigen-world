import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

void main() {
  const items = [
    FrostedNavBarItem(
      icon: Icons.play_circle_outline_rounded,
      selectedIcon: Icons.play_circle_fill_rounded,
      label: 'Explore',
    ),
    FrostedNavBarItem(
      icon: Icons.school_outlined,
      selectedIcon: Icons.school_rounded,
      label: 'Learn',
    ),
    FrostedNavBarItem(
      icon: Icons.forum_outlined,
      selectedIcon: Icons.forum_rounded,
      label: 'Community',
      badgeCount: 3,
    ),
    FrostedNavBarItem(
      icon: Icons.add_circle_outline_rounded,
      label: 'Contribute',
      showIndicatorDot: true,
    ),
  ];

  Future<int?> pumpBar(
    WidgetTester tester, {
    int currentIndex = 0,
    List<FrostedNavBarItem> destinations = items,
  }) async {
    int? tapped;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,

        theme: buildIndigenTheme(),
        home: Scaffold(
          body: const SizedBox.expand(),
          bottomNavigationBar: FrostedNavBar(
            currentIndex: currentIndex,
            onTap: (index) => tapped = index,
            items: destinations,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return tapped;
  }

  testWidgets('renders every destination label', (tester) async {
    await pumpBar(tester);

    for (final item in items) {
      expect(find.text(item.label), findsOneWidget);
    }
  });

  testWidgets('the selected destination uses its filled icon', (tester) async {
    await pumpBar(tester, currentIndex: 1);

    expect(find.byIcon(Icons.school_rounded), findsOneWidget);
    expect(find.byIcon(Icons.school_outlined), findsNothing);
    // Unselected destinations keep their outline icon.
    expect(find.byIcon(Icons.play_circle_outline_rounded), findsOneWidget);
  });

  testWidgets('an item without a selected icon reuses its default', (
    tester,
  ) async {
    await pumpBar(tester, currentIndex: 3);

    expect(find.byIcon(Icons.add_circle_outline_rounded), findsOneWidget);
  });

  testWidgets('a badge count renders, and caps at 99+', (tester) async {
    await pumpBar(tester);
    expect(find.text('3'), findsOneWidget);

    await pumpBar(
      tester,
      destinations: const [
        FrostedNavBarItem(
          icon: Icons.forum_outlined,
          label: 'Community',
          badgeCount: 240,
        ),
      ],
    );
    expect(find.text('99+'), findsOneWidget);
  });

  testWidgets('tapping a destination reports its index', (tester) async {
    int? tapped;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,

        theme: buildIndigenTheme(),
        home: Scaffold(
          body: const SizedBox.expand(),
          bottomNavigationBar: FrostedNavBar(
            currentIndex: 0,
            onTap: (index) => tapped = index,
            items: items,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    await tester.tap(find.text('Community'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    expect(tapped, 2);
  });

  testWidgets('dragging the rail switches destination', (tester) async {
    int? tapped;
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,

        theme: buildIndigenTheme(),
        home: Scaffold(
          body: const SizedBox.expand(),
          bottomNavigationBar: FrostedNavBar(
            currentIndex: 0,
            onTap: (index) => tapped = index,
            items: items,
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    final slotWidth = tester.getSize(find.byType(FrostedNavBar)).width / 4;
    await tester.drag(find.text('Explore'), Offset(slotWidth * 2, 0));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(tapped, 2);
  });

  testWidgets('a channel rail wears the channel colour', (tester) async {
    const teal = Color(0xFF0E7490);
    await tester.pumpWidget(
      MaterialApp(
        theme: buildIndigenTheme(),
        home: Scaffold(
          bottomNavigationBar: FrostedNavBar(
            currentIndex: 0,
            onTap: (_) {},
            accent: teal,
            items: items,
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));

    final selected = tester.widget<Icon>(
      find.byIcon(Icons.play_circle_fill_rounded),
    );
    expect(selected.color, teal);
  });

  testWidgets('a live badge is drawn at the shoulder, below a count', (
    tester,
  ) async {
    await pumpBar(
      tester,
      destinations: const [
        FrostedNavBarItem(
          icon: Icons.collections_bookmark_outlined,
          label: 'Collection',
          badge: SizedBox(key: Key('live'), width: 8, height: 8),
        ),
        FrostedNavBarItem(
          icon: Icons.forum_outlined,
          label: 'Community',
          badgeCount: 2,
          badge: SizedBox(key: Key('hidden'), width: 8, height: 8),
        ),
      ],
    );

    expect(find.byKey(const Key('live')), findsOneWidget);
    // A number to read beats a mark to notice.
    expect(find.byKey(const Key('hidden')), findsNothing);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('a destination plays its movement once as it is chosen, and '
      'leaves nothing running', (tester) async {
    const destinations = [
      FrostedNavBarItem(
        icon: Icons.play_circle_outline_rounded,
        label: 'Explore',
        motion: NavIconMotion.spin,
      ),
      FrostedNavBarItem(
        icon: Icons.collections_bookmark_outlined,
        label: 'Collection',
        motion: NavIconMotion.flip,
      ),
    ];
    Widget bar(int index) => MaterialApp(
      theme: buildIndigenTheme(),
      home: Scaffold(
        bottomNavigationBar: FrostedNavBar(
          currentIndex: index,
          onTap: (_) {},
          items: destinations,
        ),
      ),
    );

    await tester.pumpWidget(bar(0));
    await tester.pump(const Duration(milliseconds: 600));
    Finder turning() => find.descendant(
      of: find.byType(FrostedNavBar),
      matching: find.byWidgetPredicate(
        (widget) => widget is Transform && widget.child is AnimatedSwitcher,
      ),
    );
    expect(turning(), findsNothing);

    await tester.pumpWidget(bar(1));
    await tester.pump(const Duration(milliseconds: 100));
    expect(turning(), findsOneWidget);

    // Small steps, so the slide, the landing wiggle and the movement each
    // get the frames they finish on.
    for (var step = 0; step < 24; step++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(turning(), findsNothing);
    expect(tester.binding.hasScheduledFrame, isFalse);
  });

  testWidgets('a rail with a hero tag is a hero, and one without is not', (
    tester,
  ) async {
    await pumpBar(tester);
    expect(find.byType(Hero), findsNothing);

    await tester.pumpWidget(
      MaterialApp(
        theme: buildIndigenTheme(),
        home: Scaffold(
          bottomNavigationBar: FrostedNavBar(
            currentIndex: 0,
            onTap: (_) {},
            heroTag: kAppRailHeroTag,
            items: items,
          ),
        ),
      ),
    );
    expect(tester.widget<Hero>(find.byType(Hero)).tag, kAppRailHeroTag);
  });

  testWidgets('each destination is announced as a selectable button', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await pumpBar(tester, currentIndex: 1);

    final learn = tester.getSemantics(find.text('Learn'));
    expect(learn.label, 'Learn');
    expect(learn.flagsCollection.isButton, isTrue);
    expect(learn.flagsCollection.isSelected, Tristate.isTrue);

    // The unselected destinations are announced as not selected.
    expect(
      tester.getSemantics(find.text('Explore')).flagsCollection.isSelected,
      Tristate.isFalse,
    );

    // A badge is spoken, not left as a silent visual.
    expect(
      tester.getSemantics(find.text('Community')).label,
      'Community, 3 new',
    );
    handle.dispose();
  });
}
