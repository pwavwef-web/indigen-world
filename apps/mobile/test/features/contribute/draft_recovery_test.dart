import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/contribute/draft_recovery.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
    'refresh needs an explicit choice and preserves raw Unicode and metadata',
    () async {
      var uid = 'account-a';
      var value = <String, dynamic>{
        'text': 'TEST ɛ ɔ ŋ',
        'dialect': 'Navrongo',
        'category': 'sentences',
        'requestId': 'fixed-request',
      };
      AccountDraftSession open() => AccountDraftSession(
        account: () => uid,
        area: 'fixture',
        snapshot: () => value,
        meaningful: () => value.isNotEmpty,
        version: () => '1',
        changed: () {},
      );
      final first = open();
      await Future<void>.delayed(Duration.zero);
      await first.flush();
      first.dispose();
      final expected = Map<String, dynamic>.from(value);
      value = {};
      final refreshed = open();
      await Future<void>.delayed(Duration.zero);
      expect(refreshed.canSubmit, false);
      expect(
        value,
        isEmpty,
        reason: 'loading recovery never restores or submits',
      );
      value = refreshed.continueDraft()!;
      expect(value, expected);
      expect(refreshed.canSubmit, true);
      uid = 'account-b';
      expect(refreshed.accountChanged, true);
      expect(refreshed.canSubmit, false);
      await refreshed.flush();
      refreshed.dispose();
      value = {};
      final other = open();
      await Future<void>.delayed(Duration.zero);
      expect(other.recovery, isNull);
      other.dispose();
      uid = 'account-a';
      final returned = open();
      await Future<void>.delayed(Duration.zero);
      expect(returned.continueDraft(), expected);
      returned.dispose();
    },
  );
  test('remote version conflict is explicit and successful disposal cannot resurrect', () async {
    var version = '1';
    var value = <String, dynamic>{'text': 'Synthetic failed submission'};
    AccountDraftSession open() => AccountDraftSession(
      account: () => 'owner',
      area: 'conflict',
      snapshot: () => value,
      meaningful: () => value.isNotEmpty,
      version: () => version,
      changed: () {},
    );
    final first = open();
    await Future<void>.delayed(Duration.zero);
    await first.flush();
    first.dispose();
    version = '2';
    value = {};
    final next = open();
    await Future<void>.delayed(Duration.zero);
    expect(next.conflict, true);
    expect(next.canSubmit, false);
    value = next.continueDraft()!;
    await next.flush(); // failure leaves the same value and request available
    await next.clear();
    await next.flush();
    next.dispose();
    expect((await SharedPreferences.getInstance()).getKeys(), isEmpty);
  });
}
