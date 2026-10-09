import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/core/media_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'device low-data choice suppresses optional video and survives restart',
    () async {
      SharedPreferences.setMockInitialValues({
        lowDataPreferenceKey: true,
        videoAutoplayPreferenceKey: true,
      });
      var c = ProviderContainer();
      expect(c.read(effectiveVideoAutoplayProvider), false);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(effectiveVideoAutoplayProvider), false);
      await c.read(lowDataModeProvider.notifier).set(false);
      expect(c.read(effectiveVideoAutoplayProvider), true);
      c.dispose();
      c = ProviderContainer();
      c.read(lowDataModeProvider);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(lowDataModeProvider), false);
      c.dispose();
    },
  );
  test(
    'a new choice cannot be overwritten by late preference restoration',
    () async {
      SharedPreferences.setMockInitialValues({lowDataPreferenceKey: true});
      final c = ProviderContainer();
      await c.read(lowDataModeProvider.notifier).set(false);
      await Future<void>.delayed(Duration.zero);
      expect(c.read(lowDataModeProvider), false);
      c.dispose();
    },
  );
  test('only real thumbnail variants are requested; deliberate open keeps original', () {
    expect(
      feedImageUrl(lowData: true, original: 'full', thumbnail: 'thumb'),
      'thumb',
    );
    expect(feedImageUrl(lowData: true, original: 'full'), isNull);
    expect(
      feedImageUrl(lowData: false, original: 'full', thumbnail: 'thumb'),
      'full',
    );
  });
}
