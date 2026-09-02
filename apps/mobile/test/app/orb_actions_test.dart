// The furniture the shell pins in the top-right corner.
//
// The orb has been there since it stopped being a "You" tab. Collection now
// hangs a Downloads shortcut beside it for members whose subscription includes
// offline listening — and, crucially, hangs nothing there for everybody else.
// These tests hold that pairing in place from three sides: the tab it belongs
// to, the subscription that earns it, and the tap that has to lead somewhere.

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_shell.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/data/local/app_database.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/features/downloads/downloads_screen.dart';
import 'package:indigen_world_mobile/features/downloads/widgets/downloads_orb_action.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

void main() {
  late AppDatabase database;

  // The downloads index is a real drift database even here: the action reads it
  // for its count badge, and an in-memory one answers that honestly without
  // going anywhere near the platform channel a file-backed one would need.
  setUp(() => database = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => database.close());

  Future<void> pumpShell(
    WidgetTester tester, {
    required bool offlineListening,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appDatabaseProvider.overrideWithValue(database),
          // Stands in for the whole entitlement chain — a live subscription,
          // the benefits behind it and the download limit they grant — none of
          // which exists in a test with no Firebase.
          downloadsAllowedProvider.overrideWithValue(offlineListening),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: buildIndigenTheme(),
          home: const AppShell(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// Moves to Collection by tapping its rail entry.
  ///
  /// Deliberately not `AppShell(initialIndex: 3)`: the index is the shell's own
  /// business, and a test that names it is a test that has to be edited the day
  /// a destination is reordered. The rail entry is what a member taps.
  Future<void> openCollection(WidgetTester tester) async {
    await tester.tap(find.text('Collection'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// Takes the shell down while there is still a frame to pump.
  ///
  /// Drift schedules a zero-duration timer the moment the last listener of a
  /// query stream goes away, and the downloads action is the first thing in the
  /// shell to hold one. The framework disposes the tree in its own teardown,
  /// *after* the last chance to pump — so that timer is still pending when the
  /// "no timers left" invariant runs, and a test that has already made every
  /// assertion it came to make fails on the way out. Unmounting here and
  /// letting the clock move lets drift finish closing.
  ///
  /// The pump has to carry a duration. A bare `pump()` flushes microtasks and
  /// draws a frame but never advances the fake clock, so a zero-duration timer
  /// sits there just as pending as before — which is exactly the shape this
  /// helper was written to fix, and exactly the shape it had on the first try.
  Future<void> closeShell(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  }

  testWidgets('a subscriber gets the downloads action on Collection', (
    tester,
  ) async {
    await pumpShell(tester, offlineListening: true);
    await openCollection(tester);

    expect(find.byType(DownloadsOrbAction), findsOneWidget);
    // Beside the orb, not instead of it, and to its left: the account control
    // keeps the corner it has always had.
    expect(find.byType(ProfileOrb), findsOneWidget);
    final action = tester.getRect(find.byType(DownloadsOrbAction));
    final orb = tester.getRect(find.byType(ProfileOrb));
    expect(action.right, lessThanOrEqualTo(orb.left));
    expect(orb.left - action.right, kShellOrbActionGap);
    expect(action.top, orb.top);

    await closeShell(tester);
  });

  testWidgets('tapping it opens the downloads screen', (tester) async {
    await pumpShell(tester, offlineListening: true);
    await openCollection(tester);

    await tester.tap(find.byType(DownloadsOrbAction));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(DownloadsScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    await closeShell(tester);
  });

  testWidgets('a member with no subscription is shown nothing at all', (
    tester,
  ) async {
    await pumpShell(tester, offlineListening: false);
    await openCollection(tester);

    // Not a padlock, not a greyed circle, not a control that opens the paywall.
    // The place to sell offline listening is the download button on a track.
    expect(find.byType(DownloadsOrbAction), findsNothing);
    expect(find.byType(ProfileOrb), findsOneWidget);
    await closeShell(tester);
  });

  testWidgets('it does not follow the subscriber onto another tab', (
    tester,
  ) async {
    await pumpShell(tester, offlineListening: true);

    // The shell opens on Community, which has no business offering a shortcut
    // into the archive's offline audio.
    expect(find.byType(DownloadsOrbAction), findsNothing);

    await openCollection(tester);
    expect(find.byType(DownloadsOrbAction), findsOneWidget);

    await tester.tap(find.text('Community'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(DownloadsOrbAction), findsNothing);
    await closeShell(tester);
  });

  testWidgets('the badge counts what is actually on the phone', (tester) async {
    // Written straight into the index rather than through
    // `DownloadsRepository.download`, which would want a network and a
    // documents directory. The badge's only job is to report the index.
    await database.upsertDownload(
      DownloadedTrackRecordsCompanion.insert(
        trackId: 'track-1',
        title: 'Ayaa',
        album: 'Kassena songs',
        kind: 'music',
        sourceUrl: 'https://example.test/ayaa.mp3',
        fileName: 'track-1.mp3',
        sizeBytes: 2400000,
        downloadedAt: DateTime.utc(2026, 4, 2),
      ),
    );

    await pumpShell(tester, offlineListening: true);
    await openCollection(tester);

    expect(
      find.descendant(
        of: find.byType(DownloadsOrbAction),
        matching: find.text('1'),
      ),
      findsOneWidget,
    );
    await closeShell(tester);
  });

  testWidgets('an empty index gets no badge at all', (tester) async {
    await pumpShell(tester, offlineListening: true);
    await openCollection(tester);

    expect(
      find.descendant(
        of: find.byType(DownloadsOrbAction),
        matching: find.byType(Text),
      ),
      findsNothing,
    );
    await closeShell(tester);
  });

  testWidgets('a hidden chrome takes the action with it, taps and all', (
    tester,
  ) async {
    await pumpShell(tester, offlineListening: true);
    await openCollection(tester);

    // Whatever the shell pins up there leaves together. A shortcut left
    // hovering over a tab the rest of the chrome had vacated is the exact bug
    // the orb was folded into this cluster to stop.
    final slide = find.ancestor(
      of: find.byType(DownloadsOrbAction),
      matching: find.byType(AnimatedSlide),
    );
    final orbSlide = find.ancestor(
      of: find.byType(ProfileOrb),
      matching: find.byType(AnimatedSlide),
    );
    expect(tester.widget<AnimatedSlide>(slide.first).offset, Offset.zero);
    expect(
      tester.widget<AnimatedSlide>(slide.first).offset,
      tester.widget<AnimatedSlide>(orbSlide.first).offset,
    );
    expect(
      tester
          .widget<IgnorePointer>(
            find
                .ancestor(
                  of: find.byType(DownloadsOrbAction),
                  matching: find.byType(IgnorePointer),
                )
                .first,
          )
          .ignoring,
      isFalse,
    );
    await closeShell(tester);
  });
}
