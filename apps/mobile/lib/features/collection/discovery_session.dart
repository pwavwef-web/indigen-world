import 'dart:async';
import 'dart:convert';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:indigen_world_mobile/core/firebase_ready.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// Where a signed-in member's discovery history is kept across devices.
///
/// Only the bounded "seen recently" map travels: item ids and when they were
/// seen, nothing about how long or what was tapped. A guest has no remote copy.
abstract interface class DiscoveryHistoryRemote {
  Future<Map<String, DateTime>> load(String account, String scope);
  Future<void> save(String account, String scope, Map<String, DateTime> seen);
  Future<void> clear(String account, String scope);
}

/// `discoveryHistory/{uid}`, one map per collection under `scopes`.
class FirestoreDiscoveryHistory implements DiscoveryHistoryRemote {
  FirestoreDiscoveryHistory(this._firestore);
  final FirebaseFirestore _firestore;

  DocumentReference<Map<String, dynamic>> _doc(String account) =>
      _firestore.collection('discoveryHistory').doc(account);

  @override
  Future<Map<String, DateTime>> load(String account, String scope) async {
    final snapshot = await _doc(account).get();
    final scopes = snapshot.data()?['scopes'];
    final raw = scopes is Map ? scopes[scope] : null;
    return {
      if (raw is Map)
        for (final entry in raw.entries)
          if (entry.value case final Timestamp at) '${entry.key}': at.toDate(),
    };
  }

  @override
  Future<void> save(String account, String scope, Map<String, DateTime> seen) =>
      _doc(account).set({
        'uid': account,
        'scopes': {
          scope: {
            for (final entry in seen.entries)
              entry.key: Timestamp.fromDate(entry.value),
          },
        },
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(mergeFields: ['uid', 'scopes.$scope', 'updatedAt']));

  @override
  Future<void> clear(String account, String scope) => _doc(account).set({
    'uid': account,
    'scopes': {scope: <String, Object>{}},
    'updatedAt': FieldValue.serverTimestamp(),
  }, SetOptions(mergeFields: ['uid', 'scopes.$scope', 'updatedAt']));
}

final discoveryHistoryRemoteProvider = Provider<DiscoveryHistoryRemote?>((ref) {
  if (!ref.watch(firebaseReadyProvider)) return null;
  return FirestoreDiscoveryHistory(FirebaseFirestore.instance);
});

/// A bounded, frozen candidate order. Impressions written during this session
/// affect the next session; a rebuild/back navigation never shuffles this one.
///
/// For a signed-in member the "seen recently" history also follows the
/// account across devices: [load] merges the remote copy (the newer sighting of
/// an item wins) and impressions are written back at most every
/// [remoteInterval]. The phone's own copy is always written first, so a dead
/// network costs nothing but the sync.
class CollectionDiscoverySession {
  CollectionDiscoverySession(
    this.scope,
    this.account, {
    int? seed,
    this.remote,
    this.remoteInterval = const Duration(seconds: 30),
  }) : seed = seed ?? DateTime.now().millisecondsSinceEpoch;
  final String scope, account;
  final int seed;
  final DiscoveryHistoryRemote? remote;
  final Duration remoteInterval;
  final _recent = <String, DateTime>{}, _order = <String>[];
  bool _loaded = false;
  Timer? _remoteTimer;

  /// Whether this history leaves the phone: never for a guest.
  bool get _synced =>
      remote != null && account.isNotEmpty && account != 'guest';
  String get _key => 'collection.discovery.v1.$account.$scope';

  static const _retention = Duration(days: 30);
  static const _cap = 300;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    await _loadLocal();
    if (!_synced) return;
    try {
      final remoteSeen = await remote!.load(account, scope);
      final now = DateTime.now();
      for (final entry in remoteSeen.entries) {
        if (now.difference(entry.value) >= _retention) continue;
        final local = _recent[entry.key];
        if (local == null || entry.value.isAfter(local)) {
          _recent[entry.key] = entry.value;
        }
      }
    } on Object {
      // Offline or denied: this device's own history still ranks the feed.
    }
  }

  Future<void> _loadLocal() async {
    final prefs = await SharedPreferences.getInstance();
    dynamic raw;
    try {
      raw = jsonDecode(prefs.getString(_key) ?? '{}');
    } on FormatException {
      raw = {};
    }
    if (raw is Map)
      for (final entry in raw.entries) {
        final at = DateTime.tryParse('${entry.value}');
        if (at != null && DateTime.now().difference(at) < _retention)
          _recent['${entry.key}'] = at;
      }
  }

  Map<String, DateTime> _bounded() {
    final entries = _recent.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return {for (final e in entries.take(_cap)) e.key: e.value};
  }

  void _scheduleRemote() {
    if (!_synced || _remoteTimer != null) return;
    _remoteTimer = Timer(remoteInterval, () {
      _remoteTimer = null;
      unawaited(flush());
    });
  }

  /// Writes the history to the account now. Safe to call when nothing changed.
  Future<void> flush() async {
    _remoteTimer?.cancel();
    _remoteTimer = null;
    if (!_synced) return;
    try {
      await remote!.save(account, scope, _bounded());
    } on Object {
      // The next impression schedules another attempt.
    }
  }

  /// Stops any pending remote write without sending it (the owner left).
  void dispose() {
    _remoteTimer?.cancel();
    _remoteTimer = null;
  }

  List<T> rank<T>(
    List<T> candidates, {
    required String Function(T) id,
    required String Function(T) creator,
    required bool Function(T) pinned,
  }) {
    final fresh = candidates.where((c) => !_order.contains(id(c))).toList();
    int score(T c) {
      final hash = sha256.convert(utf8.encode('$seed:${id(c)}')).bytes;
      return (pinned(c) ? 1 << 24 : 0) +
          (_recent.containsKey(id(c)) ? 0 : 1 << 20) +
          (hash[0] << 8) +
          hash[1];
    }

    fresh.sort((a, b) {
      final diff = score(b).compareTo(score(a));
      return diff == 0 ? id(a).compareTo(id(b)) : diff;
    });
    String lastCreator = '';
    while (fresh.isNotEmpty) {
      final distinct = fresh.indexWhere(
        (c) => creator(c).isEmpty || creator(c) != lastCreator || pinned(c),
      );
      final selected = fresh.removeAt(distinct < 0 ? 0 : distinct);
      _order.add(id(selected));
      lastCreator = creator(selected);
    }
    final byId = {for (final c in candidates) id(c): c};
    return [
      for (final key in _order)
        if (byId.containsKey(key)) byId[key] as T,
    ];
  }

  Future<void> impression(String id) async {
    _recent[id] = DateTime.now();
    final bounded = {
      for (final e in _bounded().entries) e.key: e.value.toIso8601String(),
    };
    await (await SharedPreferences.getInstance()).setString(
      _key,
      jsonEncode(bounded),
    );
    _scheduleRemote();
  }

  /// Forgets what was seen, here and on the account.
  Future<void> reset() async {
    _remoteTimer?.cancel();
    _remoteTimer = null;
    _recent.clear();
    _order.clear();
    await (await SharedPreferences.getInstance()).remove(_key);
    if (_synced) {
      try {
        await remote!.clear(account, scope);
      } on Object {
        // Cleared on this phone; the account copy is retried on next reset.
      }
    }
  }
}

class QualifiedCollectionExposure extends StatefulWidget {
  const QualifiedCollectionExposure({
    required this.id,
    required this.session,
    required this.child,
    super.key,
  });
  final String id;
  final CollectionDiscoverySession session;
  final Widget child;
  @override
  State<QualifiedCollectionExposure> createState() =>
      _QualifiedCollectionExposureState();
}

class CollectionBrowserBar extends StatelessWidget {
  const CollectionBrowserBar({
    required this.onSearch,
    required this.sort,
    required this.onSort,
    this.filters = const [],
    this.filter = '',
    this.onFilter,
    this.hint = 'Search collection',
    super.key,
  });
  final ValueChanged<String> onSearch, onSort;
  final ValueChanged<String>? onFilter;
  final String sort, filter, hint;
  final List<String> filters;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
    child: Column(
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: const Icon(Icons.search),
          ),
          onChanged: onSearch,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 16,
          children: [
            DropdownButton<String>(
              value: sort,
              items: const [
                DropdownMenuItem(
                  value: 'editorial',
                  child: Text('Editorial order'),
                ),
                DropdownMenuItem(value: 'name', child: Text('Name A–Z')),
              ],
              onChanged: (v) => onSort(v!),
            ),
            if (onFilter != null && filters.isNotEmpty)
              DropdownButton<String>(
                value: filters.contains(filter) ? filter : '',
                items: [
                  const DropdownMenuItem(
                    value: '',
                    child: Text('All categories'),
                  ),
                  ...filters.toSet().map(
                    (f) => DropdownMenuItem(value: f, child: Text(f)),
                  ),
                ],
                onChanged: (v) => onFilter!(v!),
              ),
          ],
        ),
      ],
    ),
  );
}

class _QualifiedCollectionExposureState
    extends State<QualifiedCollectionExposure> {
  Timer? _timer;
  bool _recorded = false;
  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => VisibilityDetector(
    key: ValueKey('collection-${widget.session.seed}-${widget.id}'),
    onVisibilityChanged: (info) {
      if (info.visibleFraction < .6) {
        _timer?.cancel();
        _timer = null;
        return;
      }
      if (_recorded || _timer != null) return;
      _timer = Timer(const Duration(seconds: 1), () {
        if (!mounted) return;
        _recorded = true;
        unawaited(widget.session.impression(widget.id));
      });
    },
    child: widget.child,
  );
}
