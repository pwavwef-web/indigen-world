// The glass rail gets out of the way while somebody reads.
//
// The composer already did, and a button sliding off a bar that stayed put gave
// back the smaller half of the screen — the strip of feed under the rail is the
// part a reader actually loses. Both now move on one flag, so the pair can
// never be caught disagreeing, and the rail comes back the moment the reader
// turns around.

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/app/shell_chrome.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// How far off its resting place the rail has slid.
double _railSlide(WidgetTester tester) => tester
    .widget<AnimatedSlide>(
      find.ancestor(
        of: find.byType(FrostedNavBar),
        matching: find.byType(AnimatedSlide),
      ),
    )
    .offset
    .dy;

/// Tells the community feed it has moved to [pixels].
///
/// The feed is empty in a test — Firestore is unavailable, so there is nothing
/// to scroll and a real drag never leaves offset zero. Dispatching the
/// notification the feed would have sent exercises the same listener with the
/// offsets that matter.
Future<void> scrollFeedTo(WidgetTester tester, double pixels) async {
  final context = tester.element(find.byType(CustomScrollView).first);
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
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  late AppDatabase database;

  setUp(() => database = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => database.close());

  Future<void> pumpShell(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [appDatabaseProvider.overrideWithValue(database)],
        child: MaterialApp(theme: buildIndigenTheme(), home: const AppShell()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
  }

  testWidgets('the rail starts on screen', (tester) async {
    await pumpShell(tester);
    expect(find.byType(FrostedNavBar), findsOneWidget);
    expect(_railSlide(tester), 0);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('reading on takes the rail away, and turning back returns it', (
    tester,
  ) async {
    await pumpShell(tester);

    await scrollFeedTo(tester, 240);
    expect(_railSlide(tester), greaterThan(0));

    await scrollFeedTo(tester, 120);
    expect(_railSlide(tester), 0);
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('the rail and the composer move together', (tester) async {
    await pumpShell(tester);

    await scrollFeedTo(tester, 300);
    final composerSlide = tester
        .widget<AnimatedSlide>(
          find.ancestor(
            of: find.byType(FloatingActionButton),
            matching: find.byType(AnimatedSlide),
          ),
        )
        .offset
        .dy;
    expect(composerSlide, greaterThan(0));
    expect(_railSlide(tester), greaterThan(0));
    await tester.pump(const Duration(milliseconds: 500));
  });

  testWidgets('a rail on its way out takes no taps with it', (tester) async {
    await pumpShell(tester);

    await scrollFeedTo(tester, 400);
    final ignoring = tester
        .widget<IgnorePointer>(
          // Nearest first: the shell wraps other things in one of these too.
          find
              .ancestor(
                of: find.byType(FrostedNavBar),
                matching: find.byType(IgnorePointer),
              )
              .first,
        )
        .ignoring;
    // Half off the screen it is still half on it, and a destination changed by
    // a thumb that was reaching for a post is the worst kind of surprise.
    expect(ignoring, isTrue);
    await tester.pump(const Duration(milliseconds: 500));
  });

  test('a tab change brings a hidden rail back with it', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final chrome = container.read(shellChromeVisibilityProvider.notifier);

    chrome.set(false);
    expect(container.read(shellChromeVisibilityProvider), isFalse);

    // The rail is untappable while it is away, so a scroll is the only gesture
    // that can bring it back — which means a destination reached any other way
    // would otherwise open with no way out of it.
    chrome.reveal();
    expect(container.read(shellChromeVisibilityProvider), isTrue);
  });
}
