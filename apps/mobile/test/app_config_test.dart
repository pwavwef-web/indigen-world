import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/app_config.dart';

void main() {
  test('development is the local default', () {
    expect(appEnvironment, AppEnvironment.development);
  });

  test('the emulator suite is opt-in, never the default', () {
    // Without an explicit --dart-define=USE_FIREBASE_EMULATORS=true the app
    // must talk to the real project: defaulting to emulators made every
    // on-device debug build look permanently offline.
    expect(useFirebaseEmulators, isFalse);
  });
}
