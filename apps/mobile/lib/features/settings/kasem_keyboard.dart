import 'dart:io' show Platform;

import 'package:flutter/services.dart';

class KasemKeyboardState {
  const KasemKeyboardState({
    required this.enabled,
    required this.defaultLanguage,
    required this.vibration,
    required this.sound,
  });

  factory KasemKeyboardState.fromMap(Map<Object?, Object?> map) =>
      KasemKeyboardState(
        enabled: map['enabled'] == true,
        defaultLanguage: map['defaultLanguage'] == 'english'
            ? 'english'
            : 'kasem',
        vibration: map['vibration'] != false,
        sound: map['sound'] == true,
      );

  final bool enabled;
  final String defaultLanguage;
  final bool vibration;
  final bool sound;

  KasemKeyboardState copyWith({
    bool? enabled,
    String? defaultLanguage,
    bool? vibration,
    bool? sound,
  }) => KasemKeyboardState(
    enabled: enabled ?? this.enabled,
    defaultLanguage: defaultLanguage ?? this.defaultLanguage,
    vibration: vibration ?? this.vibration,
    sound: sound ?? this.sound,
  );
}

abstract interface class KasemKeyboardPlatform {
  bool get supported;

  Future<KasemKeyboardState> readState();

  Future<KasemKeyboardState> setPreference(String key, Object value);

  Future<void> openInputMethodSettings();

  Future<void> showInputMethodPicker();
}

/// Setup-only bridge to the Android IME. It deliberately has no method that
/// accepts or returns text typed through the keyboard.
class MethodChannelKasemKeyboard implements KasemKeyboardPlatform {
  const MethodChannelKasemKeyboard();

  static const _channel = MethodChannel('world.indigen.mobile/kasem_keyboard');

  @override
  bool get supported => Platform.isAndroid;

  @override
  Future<KasemKeyboardState> readState() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>('state');
    return KasemKeyboardState.fromMap(value ?? const {});
  }

  @override
  Future<KasemKeyboardState> setPreference(String key, Object value) async {
    final state = await _channel.invokeMapMethod<Object?, Object?>(
      'setPreference',
      {'key': key, 'value': value},
    );
    return KasemKeyboardState.fromMap(state ?? const {});
  }

  @override
  Future<void> openInputMethodSettings() =>
      _channel.invokeMethod<void>('openInputMethodSettings');

  @override
  Future<void> showInputMethodPicker() =>
      _channel.invokeMethod<void>('showInputMethodPicker');
}
