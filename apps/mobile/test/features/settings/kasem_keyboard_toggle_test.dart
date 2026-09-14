import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_screen.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_toggle.dart';

void main() {
  testWidgets('toggle stays above an open system keyboard', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: KasemKeyboardToggle(
            platform: _Keyboard(enabled: true),
          ),
        ),
      ),
    );
    await tester.pump();
    expect(
      tester.getBottomLeft(find.byType(SwitchListTile)).dy,
      lessThanOrEqualTo(tester.view.physicalSize.height - 300),
    );
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('enabled keyboard opens picker and reflects actual selection', (
    tester,
  ) async {
    final platform = _Keyboard(enabled: true);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: KasemKeyboardToggle(platform: platform),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.byType(SwitchListTile));
    await tester.pump();
    expect(platform.pickers, 1);
    // Dismissing the picker must not claim Kasem is selected.
    expect(
      tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
      isFalse,
    );
    platform.selected = true;
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();
    expect(
      tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value,
      isTrue,
    );
    await tester.tap(find.byType(SwitchListTile));
    await tester.pump();
    expect(platform.pickers, 2);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('missing setup opens setup then returns to the original field', (
    tester,
  ) async {
    final platform = _Keyboard(enabled: false);
    final focus = FocusNode();
    addTearDown(focus.dispose);
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
    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();
    expect(find.byType(KasemKeyboardScreen), findsOneWidget);
    expect(platform.pickers, 0);
    platform.enabled = true;
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(platform.pickers, 1);
    expect(focus.hasFocus, isTrue);
    await tester.pumpWidget(const SizedBox());
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
