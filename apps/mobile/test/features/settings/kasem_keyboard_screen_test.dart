import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/brand.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard.dart';
import 'package:indigen_world_mobile/features/settings/kasem_keyboard_screen.dart';

void main() {
  testWidgets('shows setup, language controls, shortcuts and privacy', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final platform = _FakeKeyboardPlatform();
    await tester.pumpWidget(_app(KasemKeyboardScreen(platform: platform)));
    await tester.pumpAndSettle();

    for (final label in const [
      'Kasem, wherever you write',
      '1. Enable Kasem keyboard',
      'Default language',
      'Kasem shortcuts',
      'Private by design',
    ]) {
      expect(find.text(label), findsWidgets);
    }
    expect(find.textContaining('does not save or send'), findsOneWidget);
  });

  testWidgets('opens Android settings and persists keyboard preferences', (
    tester,
  ) async {
    final platform = _FakeKeyboardPlatform();
    await tester.pumpWidget(_app(KasemKeyboardScreen(platform: platform)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('1. Enable Kasem keyboard'));
    expect(platform.openedSettings, isTrue);

    final soundTile = find.widgetWithText(SwitchListTile, 'Key sounds');
    await tester.scrollUntilVisible(soundTile, 260);
    await tester.ensureVisible(soundTile);
    await tester.pump();
    await tester.tap(soundTile);
    await tester.pumpAndSettle();

    expect(platform.values['sound'], isTrue);
  });
}

Widget _app(Widget child) => MaterialApp(
  theme: ThemeData.light().copyWith(extensions: const [BrandPalette.light]),
  home: child,
);

class _FakeKeyboardPlatform implements KasemKeyboardPlatform {
  var state = const KasemKeyboardState(
    enabled: false,
    defaultLanguage: 'kasem',
    vibration: true,
    sound: false,
  );
  final values = <String, Object>{};
  bool openedSettings = false;

  @override
  bool get supported => true;

  @override
  Future<KasemKeyboardState> readState() async => state;

  @override
  Future<KasemKeyboardState> setPreference(String key, Object value) async {
    values[key] = value;
    state = state.copyWith(
      defaultLanguage: key == 'defaultLanguage' ? value as String : null,
      vibration: key == 'vibration' ? value as bool : null,
      sound: key == 'sound' ? value as bool : null,
    );
    return state;
  }

  @override
  Future<void> openInputMethodSettings() async {
    openedSettings = true;
  }

  @override
  Future<void> showInputMethodPicker() async {}
}
