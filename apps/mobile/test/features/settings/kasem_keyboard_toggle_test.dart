import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_screen.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_toggle.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  Future<void> prompt(
    WidgetTester tester,
    _Keyboard platform,
    FocusNode focus,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TextField(focusNode: focus),
          bottomNavigationBar: KasemKeyboardToggle(
            platform: platform,
            focusNode: focus,
          ),
        ),
      ),
    );
    await tester.pump();
    focus.requestFocus();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets(
    'only appears for focused text entry and hides on real Kasem selection',
    (tester) async {
      final focus = FocusNode();
      final platform = _Keyboard(enabled: true);
      await prompt(tester, platform, focus);
      expect(find.text('Use Kasem keyboard'), findsOneWidget);
      await tester.tap(find.text('Use Kasem keyboard'));
      await tester.pump();
      expect(platform.pickers, 1);
      platform.selected = true;
      await tester.pump(const Duration(seconds: 1));
      await tester.pump();
      expect(find.text('Use Kasem keyboard'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      focus.dispose();
    },
  );
  testWidgets('dismissal survives a new prompt instance and refocusing', (
    tester,
  ) async {
    final focus = FocusNode();
    final platform = _Keyboard(enabled: true);
    await prompt(tester, platform, focus);
    await tester.tap(find.byTooltip('Dismiss keyboard prompt'));
    await tester.pump();
    expect(find.text('Use Kasem keyboard'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    await prompt(tester, platform, focus);
    expect(find.text('Use Kasem keyboard'), findsNothing);
    final preferences = await SharedPreferences.getInstance();
    expect(
      preferences.getBool('indigen_kasem_keyboard_prompt_dismissed_v1'),
      isTrue,
    );
    await tester.pumpWidget(const SizedBox());
    focus.dispose();
  });
  testWidgets('keyboard setup remains accessible from contextual prompt', (
    tester,
  ) async {
    final focus = FocusNode();
    final platform = _Keyboard(enabled: false);
    await prompt(tester, platform, focus);
    await tester.tap(find.text('Use Kasem keyboard'));
    await tester.pumpAndSettle();
    expect(find.byType(KasemKeyboardScreen), findsOneWidget);
    platform.enabled = true;
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(platform.pickers, 1);
    await tester.pumpWidget(const SizedBox());
    focus.dispose();
  });
}

class _Keyboard implements KasemKeyboardPlatform {
  _Keyboard({required this.enabled});
  bool enabled;
  bool selected = false;
  int pickers = 0;
  @override
  bool get supported => true;
  @override
  Future<KasemKeyboardState> readState() async => KasemKeyboardState(
    enabled: enabled,
    selected: selected,
    defaultLanguage: 'kasem',
    vibration: true,
    sound: false,
  );
  @override
  Future<void> showInputMethodPicker() async {
    pickers++;
  }

  @override
  Future<void> openInputMethodSettings() async {}
  @override
  Future<KasemKeyboardState> setPreference(String key, Object value) =>
      readState();
}
