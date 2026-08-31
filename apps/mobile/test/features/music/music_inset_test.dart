// How much room a screen leaves at the bottom when a song is playing.
//
// The mini-player does not tell seventeen scroll views that it exists. It
// publishes its height once, through `MusicInsetScope`, and these two helpers
// read it back out. The number used to be inferred instead, from the gap
// between `MediaQuery.padding` and `viewPadding` — and the shell's Scaffold
// quietly co-authored that gap, because `extendBody: true` raises
// `padding.bottom` for the body to the height of the bottom navigation bar.
// Every tab in the app then reserved a mini-player nobody was playing. The last
// two tests are that regression, held down with a real Scaffold.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// Pumps a probe under a chosen mini-player lift and system inset, optionally
/// inside a shell-shaped Scaffold, and reads the two helpers from inside it.
Future<({double inset, double reserve})> _measure(
  WidgetTester tester, {
  required double lift,
  double systemInset = 34,
  double keyboard = 0,
  bool underShell = false,
}) async {
  late double inset;
  late double reserve;

  final probe = Builder(
    builder: (context) {
      inset = musicInset(context);
      reserve = shellBottomReserve(context);
      return const SizedBox.shrink();
    },
  );

  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            // What the overlay does: it lifts `padding` so the rail rises, and
            // leaves `viewPadding` alone. Neither is what the helpers read.
            padding: EdgeInsets.only(
              bottom: keyboard > 0 ? 0 : systemInset + lift,
            ),
            viewPadding: EdgeInsets.only(bottom: systemInset),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
          child: MusicInsetScope(
            inset: lift,
            child: underShell
                ? Scaffold(
                    // The shell, in the one detail that matters here.
                    extendBody: true,
                    bottomNavigationBar: SizedBox(
                      height:
                          kFrostedNavBarHeight +
                          kFrostedNavBarBottomGap +
                          systemInset +
                          lift +
                          26,
                    ),
                    body: probe,
                  )
                : probe,
          ),
        ),
      ),
    ),
  );
  return (inset: inset, reserve: reserve);
}

void main() {
  testWidgets('nothing playing reserves exactly the rail', (tester) async {
    final measured = await _measure(tester, lift: 0);

    expect(measured.inset, 0);
    expect(measured.reserve, kFrostedNavBarReservedSpace);
  });

  testWidgets('a playing song adds its own height and no more', (tester) async {
    final measured = await _measure(tester, lift: 66);

    expect(measured.inset, 66);
    expect(measured.reserve, kFrostedNavBarReservedSpace + 66);
  });

  testWidgets('a phone with no system inset still measures the lift', (
    tester,
  ) async {
    // An older handset with hardware buttons has no gesture bar to sit above,
    // so the whole number is the mini-player.
    final measured = await _measure(tester, lift: 66, systemInset: 0);

    expect(measured.inset, 66);
  });

  testWidgets('a keyboard collapsing padding never reserves a negative', (
    tester,
  ) async {
    // `padding.bottom` goes to zero while a keyboard is up and `viewPadding`
    // keeps the gesture bar's height. A screen still has a rail to clear.
    final measured = await _measure(tester, lift: 0, keyboard: 34);

    expect(measured.inset, 0);
    expect(measured.reserve, kFrostedNavBarReservedSpace);
  });

  testWidgets('a screen inside the shell does not reserve the rail twice', (
    tester,
  ) async {
    // The regression: nothing is playing, so nothing is owed, however much
    // `extendBody` has moved the body's own bottom padding.
    final measured = await _measure(tester, lift: 0, underShell: true);

    expect(measured.inset, 0);
    expect(measured.reserve, kFrostedNavBarReservedSpace);
  });

  testWidgets('a song playing under the shell still adds only its own height', (
    tester,
  ) async {
    final measured = await _measure(tester, lift: 66, underShell: true);

    expect(measured.inset, 66);
    expect(measured.reserve, kFrostedNavBarReservedSpace + 66);
  });
}
