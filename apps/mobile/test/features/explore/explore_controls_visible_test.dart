import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/explore/explore_chrome.dart';

void main() {
  testWidgets(
    'subdued control is visible, accessible and acts on the first tap without pausing',
    (tester) async {
      final chrome = ExploreChromeController()..setPlaying(true);
      var taps = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ExploreChromeFade(
              controller: chrome,
              child: TextButton(
                onPressed: () => taps++,
                child: const Text('Open menu'),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(seconds: 4));
      await tester.pump(const Duration(milliseconds: 300));
      expect(chrome.value, isFalse);
      expect(
        tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
        0.72,
      );
      expect(find.text('Open menu').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Open menu'));
      await tester.pump();
      expect(taps, 1);
      expect(chrome.value, isTrue);
      chrome.hold('menu');
      await tester.pump(const Duration(seconds: 8));
      expect(chrome.value, isTrue);
      chrome.release('menu');
      await tester.pump(const Duration(seconds: 4));
      expect(chrome.value, isFalse);
      chrome.setPlaying(false);
      expect(chrome.value, isTrue);
      await tester.pumpWidget(const SizedBox());
      chrome.dispose();
    },
  );
}
