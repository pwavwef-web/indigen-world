import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/app_config.dart';
import 'package:indigen_world_mobile/core/firebase_bootstrap.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    expect(appEnvironment, AppEnvironment.development);
    expect(useFirebaseEmulators, isTrue);
    expect(await FirebaseBootstrap.initialize(), isTrue);
  });

  testWidgets('development writes only to the Firestore emulator', (
    tester,
  ) async {
    final marker = FirebaseFirestore.instance
        .collection('_integration_tests')
        .doc('mobile-foundation');

    await marker.set({'source': 'flutter', 'emulator': true});
    final snapshot = await marker.get();

    expect(snapshot.data(), containsPair('emulator', true));
  });
}
