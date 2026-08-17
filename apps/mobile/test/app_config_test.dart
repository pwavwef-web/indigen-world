import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/app_config.dart';

void main() {
  test('development is the local default and uses Firebase emulators', () {
    expect(appEnvironment, AppEnvironment.development);
    expect(useFirebaseEmulators, isTrue);
  });
}
