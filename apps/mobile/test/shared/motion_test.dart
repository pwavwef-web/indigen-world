// The shared motion helpers.
//
// Two promises matter more than how anything looks: somebody who asked the
// phone for less motion gets none, and a press animation never gets between a
// finger and the button under it.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/shared/motion.dart';

Widget _app(Widget child, {bool reduceMotion = false}) => MaterialApp(
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
      child: Scaffold(body: Center(child: child)),
    ),
  ),
);

double _entranceOpacity(WidgetTester tester) {
  final opacity = find.descendant(
    of: find.byType(Entrance),
    matching: find.byType(Opacity),
  );
  if (opacity.evaluate().isEmpty) return 1;
  return tester.widget<Opacity>(opacity.first).opacity;
}

void main() {
  testWidgets(
    'system accessibility navigation disables shared motion without hiding content',
    (tester) async {
      bool? allowed;
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(accessibleNavigation: true),
            child: Builder(
              builder: (context) {
                allowed = motionAllowed(context);
                return const EntranceGate(
                  child: Entrance(child: Text('Ready')),
                );
              },
            ),
          ),
        ),
      );
      expect(allowed, isFalse);
      expect(find.text('Ready'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('an entrance fades its child in, once', (tester) async {
    await tester.pumpWidget(_app(const Entrance(child: Text('hello'))));

    expect(_entranceOpacity(tester), lessThan(0.2));
    await tester.pump(const Duration(milliseconds: 500));
    expect(_entranceOpacity(tester), 1);
  });

  testWidgets('nothing enters for somebody who asked for less motion', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(const Entrance(child: Text('hello')), reduceMotion: true),
    );

    expect(find.byType(Opacity), findsNothing);
  });

  testWidgets('list rows arrive together without delaying long lists', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        const Column(
          children: [
            Entrance(index: 0, child: Text('first')),
            Entrance(index: 8, child: Text('eighth')),
            Entrance(index: 40, child: Text('fortieth')),
          ],
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    double opacityOf(String text) => tester
        .widget<Opacity>(
          find.ancestor(of: find.text(text), matching: find.byType(Opacity)),
        )
        .opacity;
    expect(opacityOf('first'), opacityOf('eighth'));
    // Later rows use the same brief feedback as the first.
    expect(opacityOf('fortieth'), opacityOf('eighth'));
    await tester.pump(const Duration(milliseconds: 800));
  });

  testWidgets('a closed gate lets things appear without entering', (
    tester,
  ) async {
    var show = false;
    late StateSetter update;
    await tester.pumpWidget(
      _app(
        EntranceGate(
          window: const Duration(milliseconds: 100),
          child: StatefulBuilder(
            builder: (context, setState) {
              update = setState;
              return show
                  ? const Entrance(child: Text('late'))
                  : const SizedBox.shrink();
            },
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    // Built after the window closed — a row scrolled back into view.
    update(() => show = true);
    await tester.pump();
    expect(find.text('late'), findsOneWidget);
    expect(_entranceOpacity(tester), 1);
  });

  testWidgets('a pressed button still gets its tap', (tester) async {
    var taps = 0;
    await tester.pumpWidget(
      _app(
        PressScale(
          child: ElevatedButton(
            onPressed: () => taps++,
            child: const Text('press'),
          ),
        ),
      ),
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.text('press')),
    );
    // Two frames: the first is where the ticker starts counting.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    final held = tester.widget<ScaleTransition>(
      find.descendant(
        of: find.byType(PressScale),
        matching: find.byType(ScaleTransition),
      ),
    );
    expect(held.scale.value, lessThan(1));

    await gesture.up();
    await tester.pumpAndSettle();
    expect(taps, 1);
    expect(held.scale.value, 1);
  });

  testWidgets('a finger that starts to scroll lets the card spring back', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(const PressScale(child: SizedBox.square(dimension: 120))),
    );

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(PressScale)),
    );
    await tester.pump(const Duration(milliseconds: 150));
    await gesture.moveBy(const Offset(0, 40));
    await tester.pumpAndSettle();

    final scale = tester.widget<ScaleTransition>(
      find.descendant(
        of: find.byType(PressScale),
        matching: find.byType(ScaleTransition),
      ),
    );
    expect(scale.scale.value, 1);
    await gesture.up();
  });
}
