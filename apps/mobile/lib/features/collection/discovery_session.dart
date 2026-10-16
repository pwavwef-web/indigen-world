import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// A bounded, frozen candidate order. Impressions written during this session
/// affect the next session; a rebuild/back navigation never shuffles this one.
class CollectionDiscoverySession {
  CollectionDiscoverySession(this.scope, this.account, {int? seed})
    : seed = seed ?? DateTime.now().millisecondsSinceEpoch;
  final String scope, account;
  final int seed;
  final _recent = <String, DateTime>{}, _order = <String>[];
  bool _loaded = false;
  String get _key => 'collection.discovery.v1.$account.$scope';
  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
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
        if (at != null && DateTime.now().difference(at).inDays < 30)
          _recent['${entry.key}'] = at;
      }
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
    final entries = _recent.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final bounded = {
      for (final e in entries.take(300)) e.key: e.value.toIso8601String(),
    };
    await (await SharedPreferences.getInstance()).setString(
      _key,
      jsonEncode(bounded),
    );
  }

  Future<void> reset() async {
    _recent.clear();
    _order.clear();
    await (await SharedPreferences.getInstance()).remove(_key);
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
