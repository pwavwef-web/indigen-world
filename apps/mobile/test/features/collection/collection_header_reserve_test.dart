// The Collection heading and the shell's floating controls share one corner,
// and only one of them can see the other. The heading holds the room.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/app/app_theme.dart';
import 'package:indigen_world_mobile/features/collection/collection_screen.dart';
import 'package:indigen_world_mobile/features/downloads/data/downloads_providers.dart';
import 'package:indigen_world_mobile/l10n/app_localizations.dart';
import 'package:indigen_world_mobile/shared/profile_orb.dart';

/// The right inset the tab's heading leaves clear.
double _headingReserve(WidgetTester tester) {
  final ancestors = find.ancestor(
    of: find.text('The Kassena Collection'),
    matching: find.byType(Padding),
  );
  for (final element in ancestors.evaluate()) {
    final padding = (element.widget as Padding).padding.resolve(
      TextDirection.ltr,
    );
    if (padding.left == 20 && padding.top == 22) return padding.right;
  }
  throw StateError('Collection header padding was not found.');
}

Future<void> _pumpCollection(
  WidgetTester tester, {
  bool? offlineListening,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      // A fresh scope per pump, on purpose. One test below pumps the tab twice
      // with a different set of overrides, and Riverpod refuses to have the
      // *number* of overrides on a live scope change under it — a keyed scope
      // is torn down and rebuilt instead of updated, which is what a second
      // launch of the tab actually is.
      key: UniqueKey(),
      overrides: [
        if (offlineListening != null)
          downloadsAllowedProvider.overrideWithValue(offlineListening),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: buildIndigenTheme(),
        home: const CollectionScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 500));
}

void main() {
  testWidgets('the heading clears both the orb and the downloads action', (
    tester,
  ) async {
    await _pumpCollection(tester, offlineListening: true);
    expect(_headingReserve(tester), shellTopRightReserve(withAction: true));
  });

  testWidgets('and holds that room even when the action will never come', (
    tester,
  ) async {
    // The point of the test. Whether the action appears is a subscription
    // answer, and a subscription answer is not available on the first frame —
    // so a reserve that tracked it would shunt the heading sideways in front of
    // every subscriber, on every cold open of the tab. The room is held either
    // way, and the strip of unused margin is the price of a heading that never
    // moves.
    await _pumpCollection(tester, offlineListening: false);
    expect(_headingReserve(tester), shellTopRightReserve(withAction: true));

    // Unresolved, which is what a real launch actually looks like for the first
    // frame or two, gets the same answer again.
    await _pumpCollection(tester);
    expect(_headingReserve(tester), shellTopRightReserve(withAction: true));
  });

  test('the reserve is the cluster, measured from the shell own constants', () {
    // Both numbers used to be one hard-coded 62 in the tab header, which was
    // right until a second control turned up beside the orb.
    expect(
      shellTopRightReserve(withAction: false),
      kProfileOrbInset * 2 + kProfileOrbSize,
    );
    expect(
      shellTopRightReserve(withAction: true) -
          shellTopRightReserve(withAction: false),
      kShellOrbActionExtent,
    );
  });
}
