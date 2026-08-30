import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/community/community_screen.dart';

/// How far off its resting place the composer has slid.
double _fabSlide(WidgetTester tester) => tester
    .widget<AnimatedSlide>(
      find.ancestor(
        of: find.byType(FloatingActionButton),
        matching: find.byType(AnimatedSlide),
      ),
    )
    .offset
    .dy;

/// Tells the feed it has moved to [pixels].
///
/// The feed is empty in a test — Firestore is unavailable, so there is nothing
/// to scroll and a real drag never leaves offset zero. Dispatching the
/// notification the feed would have sent exercises the same listener with the
/// offsets that matter, which is the part worth pinning down.
Future<void> scrollTo(WidgetTester tester, double pixels) async {
  final context = tester.element(find.byType(CustomScrollView));
  ScrollUpdateNotification(
    context: context,
    metrics: FixedScrollMetrics(
      minScrollExtent: 0,
      maxScrollExtent: 4000,
      pixels: pixels,
      viewportDimension: 600,
      axisDirection: AxisDirection.down,
      devicePixelRatio: 1,
    ),
  ).dispatch(context);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  Future<void> pumpCommunity(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: buildIndigenTheme(),
          home: const CommunityScreen(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('the composer starts on screen', (tester) async {
    await pumpCommunity(tester);
    expect(find.byType(FloatingActionButton), findsOneWidget);
    expect(_fabSlide(tester), 0);
  });

  testWidgets(
    'reading on hides the composer, and turning back brings it out',
    (tester) async {
      await pumpCommunity(tester);

      await scrollTo(tester, 240);
      expect(_fabSlide(tester), greaterThan(0));

      await scrollTo(tester, 120);
      expect(_fabSlide(tester), 0);
    },
  );

  testWidgets('a nudge too small to be a scroll is ignored', (tester) async {
    await pumpCommunity(tester);

    await scrollTo(tester, 240);
    expect(_fabSlide(tester), greaterThan(0));

    // Under the threshold: a thumb settling at the end of a fling must not
    // flicker the button back on.
    await scrollTo(tester, 234);
    expect(_fabSlide(tester), greaterThan(0));
  });

  testWidgets('the top of the feed always offers the composer', (
    tester,
  ) async {
    await pumpCommunity(tester);

    await scrollTo(tester, 500);
    expect(_fabSlide(tester), greaterThan(0));

    // Arriving back at the top with nothing left to read past.
    await scrollTo(tester, 0);
    expect(_fabSlide(tester), 0);
  });
}
