import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where the member's appearance choice is kept.
const themeModePreferenceKey = 'indigen_theme_mode_v1';

/// The appearance choice: follow the device, or pin light or dark.
///
/// Read from storage in `main()` and handed to the [ProviderScope] as an
/// override, so a member who chose dark never sees a white flash on the way to
/// their own theme.
final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(
  ThemeModeController.new,
);

class ThemeModeController extends Notifier<ThemeMode> {
  @override
  ThemeMode build() => ThemeMode.system;

  Future<void> setMode(ThemeMode mode) async {
    if (state == mode) return;
    state = mode;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(themeModePreferenceKey, mode.name);
  }
}

/// The stored choice, or [ThemeMode.system] when there is none — which is also
/// what a first launch and a failed read both mean.
Future<ThemeMode> readStoredThemeMode() async {
  try {
    final preferences = await SharedPreferences.getInstance();
    final stored = preferences.getString(themeModePreferenceKey);
    return ThemeMode.values.firstWhere(
      (mode) => mode.name == stored,
      orElse: () => ThemeMode.system,
    );
  } on Object {
    return ThemeMode.system;
  }
}

/// The label shown against each choice in Settings.
String themeModeLabel(ThemeMode mode) => switch (mode) {
  ThemeMode.system => 'Match device',
  ThemeMode.light => 'Light',
  ThemeMode.dark => 'Dark',
};

IconData themeModeIcon(ThemeMode mode) => switch (mode) {
  ThemeMode.system => Icons.brightness_auto_rounded,
  ThemeMode.light => Icons.light_mode_rounded,
  ThemeMode.dark => Icons.dark_mode_rounded,
};
