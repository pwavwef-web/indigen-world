// How much room a screen leaves at the bottom when a song is playing.
//
// The mini-player does not tell seventeen scroll views that it exists. It
// inflates `MediaQuery.padding.bottom` and leaves `viewPadding.bottom` alone,
// and these two helpers read the difference back out. That trick is the whole
// mechanism, and it is quiet enough to break without anybody noticing — which
// is what this file is for.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/shared/frosted_nav_bar.dart';

/// Pumps a subtree under a chosen padding/viewPadding pair and reads the two
/// helpers from inside it.
Future<({double inset, double reserve})> _measure(
  WidgetTester tester, {
  required double padding,
  required double viewPadding,
}) async {
  late double inset;
  late double reserve;
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(
        padding: EdgeInsets.only(bottom: padding),
        viewPadding: EdgeInsets.only(bottom: viewPadding),
      ),
      child: Builder(
        builder: (context) {
          inset = musicInset(context);
          reserve = shellBottomReserve(context);
          return const SizedBox.shrink();
        },
      ),
    ),
  );
  return (inset: inset, reserve: reserve);
}

void main() {
  testWidgets('nothing playing reserves exactly the rail', (tester) async {
    // The untouched case: padding and viewPadding agree, because nobody has
    // inflated anything.
    final measured = await _measure(tester, padding: 34, viewPadding: 34);

    expect(measured.inset, 0);
    expect(measured.reserve, kFrostedNavBarReservedSpace);
  });

  testWidgets('a playing song adds its own height and no more', (tester) async {
    final measured = await _measure(tester, padding: 34 + 66, viewPadding: 34);

    expect(measured.inset, 66);
    expect(measured.reserve, kFrostedNavBarReservedSpace + 66);
  });

  testWidgets('a phone with no system inset still measures the lift', (
    tester,
  ) async {
    // An older handset with hardware buttons has no gesture bar to sit above,
    // so both numbers start at zero and the whole delta is the mini-player.
    final measured = await _measure(tester, padding: 66, viewPadding: 0);

    expect(measured.inset, 66);
  });

  testWidgets('a keyboard shrinking padding never reserves a negative', (
    tester,
  ) async {
    // `padding.bottom` goes to zero while a keyboard is up, and `viewPadding`
    // keeps the gesture bar's height. Without the clamp the difference is
    // negative and every scroll view in the app would reserve *less* than the
    // rail it has to clear.
    final measured = await _measure(tester, padding: 0, viewPadding: 34);

    expect(measured.inset, 0);
    expect(measured.reserve, kFrostedNavBarReservedSpace);
  });
}
