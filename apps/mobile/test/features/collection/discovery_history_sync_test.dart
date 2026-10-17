import 'package:flutter_test/flutter_test.dart';
import 'package:indigen_world_mobile/features/collection/discovery_session.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeRemote implements DiscoveryHistoryRemote {
  final store = <String, Map<String, DateTime>>{};
  var saves = 0, clears = 0;
  bool fail = false;

  @override
  Future<Map<String, DateTime>> load(String account, String scope) async {
    if (fail) throw StateError('offline');
    return {...?store['$account/$scope']};
  }

  @override
  Future<void> save(
    String account,
    String scope,
    Map<String, DateTime> seen,
  ) async {
    saves++;
    store['$account/$scope'] = {...seen};
  }

  @override
  Future<void> clear(String account, String scope) async {
    clears++;
    store.remove('$account/$scope');
  }
}

List<String> _rank(CollectionDiscoverySession session, List<String> ids) =>
    session.rank(ids, id: (v) => v, creator: (_) => '', pinned: (_) => false);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('history seen on another device ranks those items later here', () async {
    final remote = _FakeRemote()
      ..store['member/literature'] = {'seen-elsewhere': DateTime.now()};
    final session = CollectionDiscoverySession(
      'literature',
      'member',
      seed: 7,
      remote: remote,
    );
    await session.load();
    final order = _rank(session, ['seen-elsewhere', 'a', 'b', 'c']);
    expect(order.last, 'seen-elsewhere');
  });

  test('impressions reach the account after the interval, bounded', () async {
    final remote = _FakeRemote();
    final session = CollectionDiscoverySession(
      'music',
      'member',
      remote: remote,
      remoteInterval: const Duration(milliseconds: 10),
    );
    await session.load();
    await session.impression('one');
    await session.impression('two');
    expect(remote.saves, 0, reason: 'writes are batched, not per impression');
    await Future<void>.delayed(const Duration(milliseconds: 40));
    expect(remote.saves, 1);
    expect(remote.store['member/music']!.keys, containsAll(['one', 'two']));
  });

  test('a guest never sends history anywhere', () async {
    final remote = _FakeRemote();
    final session = CollectionDiscoverySession(
      'music',
      'guest',
      remote: remote,
      remoteInterval: Duration.zero,
    );
    await session.load();
    await session.impression('one');
    await session.flush();
    await session.reset();
    expect(remote.saves, 0);
    expect(remote.clears, 0);
  });

  test('reset clears this phone and the account', () async {
    final remote = _FakeRemote()..store['member/video'] = {'x': DateTime.now()};
    final session = CollectionDiscoverySession(
      'video',
      'member',
      remote: remote,
    );
    await session.load();
    await session.reset();
    expect(remote.store['member/video'], isNull);
    final again = CollectionDiscoverySession('video', 'member', remote: remote);
    await again.load();
    expect(_rank(again, ['x', 'y']).toSet(), {'x', 'y'});
  });

  test('an unreachable account still ranks from this device', () async {
    final remote = _FakeRemote()..fail = true;
    final session = CollectionDiscoverySession(
      'music',
      'member',
      remote: remote,
    );
    await session.load();
    expect(_rank(session, ['a', 'b']), hasLength(2));
  });

  test('another account never sees this one\'s history', () async {
    final remote = _FakeRemote()
      ..store['member-a/music'] = {'private': DateTime.now()};
    final session = CollectionDiscoverySession(
      'music',
      'member-b',
      seed: 7,
      remote: remote,
    );
    await session.load();
    // 'private' is unseen for member-b, so it competes on the seed alone.
    final ranked = _rank(session, ['private', 'other']);
    final control = CollectionDiscoverySession('music', 'nobody', seed: 7);
    await control.load();
    expect(ranked, _rank(control, ['private', 'other']));
  });
}
