import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Whether the team's own details are shown in Settings: the app signature
/// Google Sign-In is granted to, and which Firebase environment this build
/// talks to.
///
/// Members never needed either. A SHA-1 fingerprint in the middle of Settings
/// is a line of noise to everybody but the one person debugging a refused
/// sign-in, and "production environment" under a guest's name reads as
/// something having gone wrong. So they are on in development and staging
/// builds, where everybody holding the phone is on the team, and in a
/// production build only after the version row has been tapped
/// [kDeveloperOptionsTaps] times — the convention Android itself uses.
/// Remembered on the device, not the account.
const developerOptionsPreferenceKey = 'indigen_developer_options_v1';

/// How many taps on the version row turn the details on.
const int kDeveloperOptionsTaps = 7;

final developerOptionsProvider = NotifierProvider<DeveloperOptions, bool>(
  DeveloperOptions.new,
);

class DeveloperOptions extends Notifier<bool> {
  @override
  bool build() {
    if (appEnvironment != AppEnvironment.production) return true;
    unawaited(_restore());
    return false;
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      if (preferences.getBool(developerOptionsPreferenceKey) ?? false) {
        state = true;
      }
    } on Object {
      // Off is the safe answer to a storage read that failed.
    }
  }

  Future<void> enable() async {
    if (state) return;
    state = true;
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(developerOptionsPreferenceKey, true);
    } on Object {
      // Still on for this session; only remembering it failed.
    }
  }
}
